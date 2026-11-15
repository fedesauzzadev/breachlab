'use strict';
// Middleware x-api-key (plan §2.1: apikey → contador → handler). S03 = modo vulnerable:
// comparación plaintext contra la key activa — la mala práctica que el lab denuncia.
// Incluye el contador de detección: >30 hits de una misma key en ventana móvil de 10 s
// → evento alert critical con cooldown 15 s (números FIJOS, ADR D-0004).
const { maskKey } = require('./lab');

const DETECTION_MAX_REQUESTS = 30; // estrictamente mayor dispara la alerta
const DETECTION_WINDOW_MS = 10_000; // ventana móvil
const ALERT_COOLDOWN_MS = 15_000; // no spamea el timeline (riesgo T4)

function createApiKeyAuth(lab) {
  const hits = new Map(); // key → timestamps de requests autenticados
  let lastAlertAt = 0;
  const insAlert = lab.db.prepare(
    "INSERT INTO events(ts, kind, severity, message) VALUES (?, 'alert', 'critical', ?)");

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
    if (!key || !lab.isKeyActive(key)) {
      return res.status(401).json({ error: 'invalid_api_key' }); // D-0004
    }
    recordHit(key);
    next();
  };
}

module.exports = { createApiKeyAuth, DETECTION_MAX_REQUESTS, DETECTION_WINDOW_MS, ALERT_COOLDOWN_MS };
