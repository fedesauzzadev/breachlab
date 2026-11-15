'use strict';
// Middleware x-api-key (plan §2.1: rateLimit → apikey → handler). S03 = modo vulnerable:
// plaintext contra la key activa (la mala práctica que el lab denuncia). S04: la respuesta
// depende del ESTADO — kill switch (disabled) → 403 key_disabled · sin key / revocada por
// rotación → 401 invalid_api_key (D-0004). S05 agrega sha256+scope. Detección: >30 hits de
// una misma key en ventana móvil de 10 s → alert critical con cooldown 15 s (ADR D-0004).
const { maskKey } = require('./lab');

const DETECTION_MAX_REQUESTS = 30; // estrictamente mayor dispara la alerta
const DETECTION_WINDOW_MS = 10_000; // ventana móvil
const ALERT_COOLDOWN_MS = 15_000; // no spamea el timeline (riesgo T4)

function createApiKeyAuth(lab) {
  const hits = new Map(); // key → timestamps de requests autenticados
  let lastAlertAt = 0;
  const insAlert = lab.db.prepare(
    "INSERT INTO events(ts, kind, severity, message) VALUES (?, 'alert', 'critical', ?)");
  const getKeyStatus = lab.db.prepare('SELECT status FROM api_keys WHERE key_plain = ?');

  function recordHit(key) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < DETECTION_WINDOW_MS);
    recent.push(now);
    hits.set(key, recent);
    if (recent.length > DETECTION_MAX_REQUESTS && now - lastAlertAt > ALERT_COOLDOWN_MS) {
      lastAlertAt = now;
      lab.state.act = 3; // acto 3: detectado (D-0004)
      insAlert.run(new Date(now).toISOString(),
        `Detección: anomalous volume · key ${maskKey(key)} · ${recent.length} requests en 10 s`);
    }
  }

  return function apiKeyAuth(req, res, next) {
    const key = req.get('x-api-key');
    const row = key ? getKeyStatus.get(key) : undefined;
    if (row && row.status === 'disabled') {
      return res.status(403).json({ error: 'key_disabled' }); // kill switch (D-0004)
    }
    if (!row || row.status !== 'active') {
      return res.status(401).json({ error: 'invalid_api_key' }); // sin key / revocada (rotación)
    }
    recordHit(key);
    next();
  };
}

module.exports = { createApiKeyAuth, DETECTION_MAX_REQUESTS, DETECTION_WINDOW_MS, ALERT_COOLDOWN_MS };
