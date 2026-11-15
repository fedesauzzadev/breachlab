'use strict';
// Bot atacante in-process (ADR D-0003): ráfaga fija 4 req/s (interval 250 ms) con HTTP
// REAL a loopback — los códigos que ve el panel son respuestas genuinas de la API.
// La key sale del ARTEFACTO del leak (repo-sim/config.json), NUNCA hardcodeada acá.
// Host SIEMPRE 127.0.0.1: no hay path de código que apunte afuera del sandbox.
const { readFileSync } = require('node:fs');
const path = require('node:path');

const BOT_INTERVAL_MS = 250; // 4 req/s (ADR D-0004)
const HOST = '127.0.0.1'; // constante del sandbox (aislamiento, ADR D-0003)
const FEED_SIZE = 20; // ring de códigos recientes para el feed del panel (S04: 401/403/429)

function createAttacker({ lab, port } = {}) {
  const leakFile = path.join(__dirname, '..', 'repo-sim', 'config.json');
  const defaultPort = Number.parseInt(process.env.PORT, 10) || 3000; // PORT fluye a bot y server
  const att = {
    timer: null,
    n: 0,
    baseUrl: `http://${HOST}:${port || defaultPort}/api`,
    // Solo tests efímeros (puerto 0) reasignan el puerto; el host no cambia jamás.
    setPort(p) { att.baseUrl = `http://${HOST}:${p}/api`; },
    start() {
      if (att.timer) return;
      const a = lab.state.attack || (lab.state.attack = { running: false, requests: 0, blocked: 0, recent: [] });
      a.running = true;
      if (lab.state.act === 1) lab.state.act = 2; // acto 2: ataque corriendo sin alerta
      // Se relee el artefacto en CADA arranque: el re-ataque usa SIEMPRE la key filtrada original.
      att.key = JSON.parse(readFileSync(leakFile, 'utf8')).api_key;
      att.timer = setInterval(() => att.fire(), BOT_INTERVAL_MS);
    },
    stop() {
      if (!att.timer) return;
      clearInterval(att.timer);
      att.timer = null;
      if (lab.state.attack) lab.state.attack.running = false; // la basura queda persistida (AC4)
    },
    async fire() {
      if (!att.timer) return;
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
      a.requests += 1;
      if (!(status >= 200 && status < 300)) a.blocked += 1;
      a.recent.push({ ts: new Date().toISOString(), status });
      if (a.recent.length > FEED_SIZE) a.recent.shift();
    },
  };
  return att;
}

module.exports = { createAttacker, BOT_INTERVAL_MS };
