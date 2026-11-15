'use strict';
// Consola del defensor /api/lab/* (contrato §2.4): state, timeline y control del ataque.
// Sin key: solo existe en loopback (ADR D-0003). Números: ADR D-0004.
const express = require('express');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { maskKey } = require('./lab');
const { DETECTION_MAX_REQUESTS, DETECTION_WINDOW_MS, ALERT_COOLDOWN_MS } = require('./apikey');
const { BOT_INTERVAL_MS } = require('./attacker');

// La máscara del leak sale del ARTEFACTO (el leak nunca vive en código — ADR D-0003 §6).
const leakedKey = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'repo-sim', 'config.json'), 'utf8')).api_key;

function createLabRoutes(lab, attacker, rateLimiter) {
  const router = express.Router();
  router.use(express.json());
  const byKind = lab.db.prepare('SELECT kind, COUNT(*) AS n FROM entries GROUP BY kind');
  const activeKey = lab.db.prepare(
    "SELECT key_plain FROM api_keys WHERE status = 'active' ORDER BY id DESC LIMIT 1");

  router.get('/state', (_req, res) => {
    const counts = { legit: 0, garbage: 0 };
    for (const row of byKind.all()) counts[row.kind] = row.n;
    const current = activeKey.get();
    res.json({
      act: lab.state.act,
      attack: lab.state.attack,
      db: counts,
      flags: lab.state.flags,
      keys: {
        leaked_masked: maskKey(leakedKey),
        current_masked: current && current.key_plain ? maskKey(current.key_plain) : null,
        storage: 'plaintext', // S03: mala práctica visible; S05 migra a sha256
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

  return router;
}

module.exports = { createLabRoutes };
