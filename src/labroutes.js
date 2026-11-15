'use strict';
// Consola del defensor /api/lab/* (contrato §2.4): state, timeline y control del ataque.
// Sin key: solo existe en loopback (ADR D-0003). Números: ADR D-0004.
const express = require('express');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { maskKey, sha256Hex } = require('./lab');
const { DETECTION_MAX_REQUESTS, DETECTION_WINDOW_MS, ALERT_COOLDOWN_MS } = require('./apikey');
const { BOT_INTERVAL_MS, SCENARIO_BURST } = require('./attacker');

// La máscara del leak sale del ARTEFACTO (el leak nunca vive en código — ADR D-0003 §6).
const leakedKey = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'repo-sim', 'config.json'), 'utf8')).api_key;

function createLabRoutes(lab, attacker, rateLimiter, auth = null) {
  const router = express.Router();
  router.use(express.json());
  // L-7 (QA V1): un POST destructivo con body no-JSON (sin content-type o text/plain) era
  // tratado como vacío — la consola exige application/json explícito.
  router.use((req, res, next) => {
    if (req.method !== 'POST' || /^application\/json/i.test(req.get('content-type') || '')) {
      return next();
    }
    res.status(400).json({ error: 'invalid_request', details: 'content-type application/json requerido' });
  });
  const byKind = lab.db.prepare('SELECT kind, COUNT(*) AS n FROM entries GROUP BY kind');
  const activeKey = lab.db.prepare(
    "SELECT key_plain FROM api_keys WHERE status = 'active' ORDER BY id DESC LIMIT 1");

  router.get('/state', (_req, res) => {
    const counts = { legit: 0, garbage: 0 };
    for (const row of byKind.all()) counts[row.kind] = row.n;
    const current = activeKey.get();
    const a = lab.state.attack;
    const f = lab.state.flags;
    res.json({
      act: lab.state.act,
      attack: a,
      db: counts,
      flags: f,
      // S08 modo guiado (N-0005): hitos derivados SOLO de estado runtime — nada nuevo en DB.
      milestones: {
        attack_started: lab.state.act >= 2,
        alert_fired: lab.state.act >= 3,
        firewalls_applied: !!(f.killswitch && f.rotated && f.ratelimit),
        hardening_on: !!f.hardening,
        reattack_bounced: !!(f.hardening && a.blocked > (a.reattackBase ?? Infinity)),
      },
      keys: {
        leaked_masked: maskKey(leakedKey),
        // Con hardening el plain no existe: la máscara se guardó al migrar/rotar (lab.js).
        current_masked: lab.state.flags.hardening
          ? lab.state.currentMasked
          : (current && current.key_plain ? maskKey(current.key_plain) : null),
        storage: lab.state.flags.hardening ? 'sha256' : 'plaintext', // S05: §2.5
      },
      thresholds: {
        detection_max_requests: DETECTION_MAX_REQUESTS,
        detection_window_ms: DETECTION_WINDOW_MS,
        alert_cooldown_ms: ALERT_COOLDOWN_MS,
        bot_interval_ms: BOT_INTERVAL_MS,
      },
    });
  });

  // Timeline (desde S01, ahora en el router del lab): ?since=<id> incremental.
  router.get('/timeline', (req, res) => {
    const since = Number.parseInt(req.query.since, 10);
    res.json({ events: lab.listEvents(Number.isInteger(since) ? since : 0) });
  });

  // Control del bot atacante (AC1/AC4 de N-0002).
  router.post('/attack', (req, res) => {
    const action = req.body && req.body.action;
    if (action !== 'start' && action !== 'stop') {
      return res.status(400).json({ error: 'invalid_request', details: 'action debe ser "start" o "stop"' });
    }
    if (action === 'start') attacker.start();
    else attacker.stop();
    res.status(202).json({ running: lab.state.attack ? lab.state.attack.running : false });
  });

  // Matafuegos S04 (contrato §2.4): evento action con su efecto (AC4 N-0003); con detección previa → acto 4 (§2.5).
  const insAction = lab.db.prepare(
    "INSERT INTO events(ts, kind, severity, message) VALUES (?, 'action', 'success', ?)");
  const bad = (res, details) => res.status(400).json({ error: 'invalid_request', details });
  const firewallAction = (msg) => {
    insAction.run(new Date().toISOString(), msg);
    if (lab.state.act >= 3) lab.state.act = 4;
  };

  router.post('/firewall/kill-switch', (req, res) => {
    if (!req.body || req.body.enabled !== true) return bad(res, 'enabled debe ser true');
    const mask = lab.killSwitch(); // deshabilita la key COMPROMETIDA (el leak)
    lab.state.flags.killswitch = true;
    firewallAction(`Kill switch ON · key ${mask} deshabilitada · cada request con esa key → 403`);
    res.json({ killswitch: true });
  });

  router.post('/firewall/rotate-key', (req, res) => {
    const b = req.body;
    if (b !== undefined && (typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length > 0)) {
      return bad(res, 'body vacío {} — sin campos extra');
    }
    const mask = lab.rotateKey(); // revoca la vigente, emite una nueva (solo su máscara sale)
    lab.state.flags.rotated = true;
    firewallAction(`Rotación de key · filtrada revocada (→401) · nueva key ${mask} activa`);
    res.json({ new_key_masked: mask });
  });

  router.post('/firewall/rate-limit', (req, res) => {
    const b = req.body || {};
    if (b.enabled !== true) return bad(res, 'enabled debe ser true');
    const opt = (v, dflt) => (v === undefined ? dflt : (Number.isInteger(v) ? v : NaN));
    const max = opt(b.max, 10);
    const windowMs = opt(b.window_ms, 10_000);
    if (!(max >= 1 && max <= 1000) || !(windowMs >= 1000 && windowMs <= 600_000)) {
      return bad(res, 'max: entero 1..1000 · window_ms: entero 1000..600000');
    }
    rateLimiter.cfg.enabled = true;
    rateLimiter.configure({ max, windowMs }); // ventanas limpias → la ráfaga post-ON arranca de 0
    lab.state.flags.ratelimit = true;
    firewallAction(`Rate limit ON · ${max} req / ${windowMs / 1000} s por key · exceso → 429`);
    res.json({ ratelimit: true, max, window_ms: windowMs });
  });

  // S05 hardening (§2.4/§2.5): migra las keys a sha256 (plain → NULL), scope write:entries
  // solo para la vigente y audit de cada rebote. Acto 5: firme a futuro.
  router.post('/hardening', (req, res) => {
    if (!req.body || req.body.enabled !== true) return bad(res, 'enabled debe ser true');
    const keys_hashed = lab.hardenKeys();
    lab.state.flags.hardening = true;
    lab.state.act = 5;
    // S08: base del hito "re-ataque rebote" — cuentan los bloqueos NUEVOS desde acá.
    if (lab.state.attack) lab.state.attack.reattackBase = lab.state.attack.blocked;
    insAction.run(new Date().toISOString(),
      `Hardening ON · ${keys_hashed} key(s) migradas a sha256 (key_plain → NULL) · scope write:entries solo para la vigente · cada rebote queda en el audit log`);
    res.json({ hardening: true, keys_hashed });
  });

  // S08 (N-0005): reinicio del incidente SIN reiniciar el proceso — vuelve al acto 1
  // exacto: seed restaurado, timeline/audit limpios, flags y contadores en cero.
  router.post('/reset', async (req, res) => {
    const b = req.body;
    if (b !== undefined && (typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length > 0)) {
      return bad(res, 'body vacío {} — sin campos extra');
    }
    attacker.reset();
    // Deja terminar los POST en vuelo del bot antes de limpiar: si no, un insert ya
    // autenticado podría aterrizar en la DB recién re-seedeada.
    await new Promise((r) => setTimeout(r, BOT_INTERVAL_MS + 100));
    rateLimiter.cfg.enabled = false;
    rateLimiter.configure(); // ventanas limpias
    if (typeof auth.reset === 'function') auth.reset(); // detector: hits y cooldown a cero
    lab.reset();
    res.json({ reset: true });
  });

  // S08 (N-0006) escenario 2: key auténtica y activa pero SIN scope de escritura — el
  // bot la usa en una RÁFAGA FINITA de 10 (FIX-1, ADR D-0006): sus POST rebotan 403
  // insufficient_scope auditados, la DB queda limpia y el bot se detiene solo.
  router.post('/scenario/scopeless-key', (req, res) => {
    const b = req.body;
    if (b !== undefined && (typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length > 0)) {
      return bad(res, 'body vacío {} — sin campos extra');
    }
    if (!lab.state.flags.hardening) return bad(res, 'requiere hardening activo (activelo primero)');
    if (lab.state.attack.running) return bad(res, 'detenga el ataque antes de lanzar el escenario');
    const fresh = `sk_breachlab_demo_SCOPELESS_${randomBytes(8).toString('hex')}`; // FAKE BY DESIGN
    lab.db.prepare(
      "INSERT INTO api_keys(label, key_hash, scope, status, created_at) VALUES ('scenario-scopeless', ?, NULL, 'active', ?)"
    ).run(sha256Hex(fresh), new Date().toISOString());
    const mask = maskKey(fresh);
    insAction.run(new Date().toISOString(),
      `Escenario 2 · key ${mask} válida y activa pero SIN scope write:entries · sus POST → 403`);
    attacker.start(fresh, { burst: SCENARIO_BURST });
    res.status(202).json({ scenario: 'scopeless-key', running: true, key_masked: mask, requests_planned: SCENARIO_BURST });
  });

  // Audit log (§2.4): intentos bloqueados con hardening activo; ?since=<id> incremental.
  router.get('/audit', (req, res) => {
    const since = Number.parseInt(req.query.since, 10);
    res.json({ attempts: lab.listAudit(Number.isInteger(since) ? since : 0) });
  });

  return router;
}

module.exports = { createLabRoutes };
