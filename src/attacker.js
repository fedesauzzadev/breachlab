'use strict';
// Bot atacante in-process (ADR D-0003): ráfaga fija 4 req/s (interval 250 ms) con HTTP
// REAL a loopback — los códigos que ve el panel son respuestas genuinas de la API.
// La key sale del ARTEFACTO del leak (repo-sim/config.json), NUNCA hardcodeada acá.
// Host SIEMPRE 127.0.0.1: no hay path de código que apunte afuera del sandbox.
const { readFileSync } = require('node:fs');
const path = require('node:path');

const BOT_INTERVAL_MS = 250; // 4 req/s (ADR D-0004)
const BOT_GIVEUP_STREAK = 20; // FIX-2 (feedback G3, ADR D-0006): rebotes SEGUIDOS antes de rendirse
const SCENARIO_BURST = 10; // FIX-1 (feedback G3): ráfaga finita del escenario 2 (N-0006)
const HOST = '127.0.0.1'; // constante del sandbox (aislamiento, ADR D-0003)
const FEED_SIZE = 20; // ring de códigos recientes para el feed del panel (S04: 401/403/429)

function createAttacker({ lab, port } = {}) {
  const leakFile = path.join(__dirname, '..', 'repo-sim', 'config.json');
  const defaultPort = Number.parseInt(process.env.PORT, 10) || 3000; // PORT fluye a bot y server
  // FIX-1/FIX-2 (ADR D-0006): el bot narra su propio final en el timeline.
  const insEvent = lab.db.prepare(
    "INSERT INTO events(ts, kind, severity, message) VALUES (?, 'action', 'success', ?)");
  const att = {
    timer: null,
    n: 0,
    baseUrl: `http://${HOST}:${port || defaultPort}/api`,
    // Solo tests efímeros (puerto 0) reasignan el puerto; el host no cambia jamás.
    setPort(p) { att.baseUrl = `http://${HOST}:${p}/api`; },
    start(key, opts = {}) {
      if (att.timer) return;
      const a = lab.state.attack || (lab.state.attack = { running: false, requests: 0, blocked: 0, recent: [] });
      a.running = true;
      if (lab.state.act === 1) lab.state.act = 2; // acto 2: ataque corriendo sin alerta
      // Se relee el artefacto en CADA arranque: el re-ataque usa SIEMPRE la key filtrada
      // original. Excepción S08 (N-0006): key explícita = la sin scope del escenario 2.
      att.key = key || JSON.parse(readFileSync(leakFile, 'utf8')).api_key;
      att.burst = opts.burst || 0; // FIX-1: >0 = ráfaga finita que se frena sola (escenario 2)
      att.launched = 0; // lanzadas en ESTA corrida (att.n global solo numera payloads)
      att.done = 0; // completadas en esta corrida
      att.bounced = 0; // rebotes de esta corrida (para el evento de cierre del escenario)
      att.streak = 0; // rebotes CONSECUTIVOS (FIX-2): cualquier 2xx la borra
      att.timer = setInterval(() => att.fire(), BOT_INTERVAL_MS);
    },
    // S08 reset (N-0005): bot frenado y numeración de payloads a cero — la demo re-narrada
    // es idéntica a la primera (SPAM-1, no SPAM-45).
    reset() { att.stop(); att.n = 0; },
    stop() {
      if (!att.timer) return;
      clearInterval(att.timer);
      att.timer = null;
      if (lab.state.attack) lab.state.attack.running = false; // la basura queda persistida (AC4)
    },
    async fire() {
      if (!att.timer) return;
      if (att.burst && att.launched >= att.burst) return; // FIX-1: fuera de la ráfaga no se lanza nada
      att.launched += 1;
      att.n += 1;
      const spam = `SPAM-${att.n}`; // payload fijo del lab (ADR D-0004)
      let status = 0; // 0 = timeout / conexión rechazada
      try {
        const res = await fetch(`${att.baseUrl}/entries`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': att.key },
          body: JSON.stringify({ title: spam, body: spam }),
          signal: AbortSignal.timeout(2000), // NFR-6: IO saliente SIEMPRE con timeout
        });
        status = res.status;
      } catch { /* server caído o lento: cuenta como bloqueo */ }
      const a = lab.state.attack;
      if (!a || !a.running) return; // respuesta tardía tras stop: se descarta
      att.done += 1;
      a.requests += 1;
      if (status >= 200 && status < 300) att.streak = 0; // FIX-2: un 2xx reanima al atacante
      else { att.streak += 1; att.bounced += 1; a.blocked += 1; }
      a.recent.push({ ts: new Date().toISOString(), status });
      if (a.recent.length > FEED_SIZE) a.recent.shift();
      // FIX-1 (ADR D-0006): ráfaga finita del escenario 2 — completada la última, el bot
      // se frena solo y narra el resultado exacto (intentos/rechazos/escrituras de la corrida).
      if (att.burst && att.done >= att.burst) {
        att.stop();
        insEvent.run(new Date().toISOString(),
          `Escenario 2 completado · ${att.done} intentos · ${att.bounced} rechazados (403 insufficient_scope) · ${att.done - att.bounced} escrituras`);
        return;
      }
      // FIX-2 (ADR D-0006): rendición — N rebotes CONSECUTIVOS lo frenan. Con 2xx en el
      // camino nunca aplica: el ataque exitoso (201s) sigue sin detenerse solo (AC1 N-0002).
      if (att.streak >= BOT_GIVEUP_STREAK) {
        att.stop();
        insEvent.run(new Date().toISOString(),
          `El atacante dejó de intentar (${BOT_GIVEUP_STREAK} rebotes consecutivos) · ${a.blocked} bloqueados en total`);
      }
    },
  };
  return att;
}

module.exports = { createAttacker, BOT_INTERVAL_MS, BOT_GIVEUP_STREAK, SCENARIO_BURST };
