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

function createLabRoutes(lab, attacker) {
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

  return router;
}

module.exports = { createLabRoutes };
