'use strict';
// Middleware x-api-key (plan §2.1: rateLimit → apikey → handler). S03 = modo vulnerable:
// plaintext contra la key activa (la mala práctica que el lab denuncia). S04: la respuesta
// depende del ESTADO — kill switch (disabled) → 403 key_disabled · sin key / revocada por
// rotación → 401 invalid_api_key (D-0004). S05 modo hardened: compara sha256(presented)
// contra key_hash, POST exige scope write:entries (sin él → 403 insufficient_scope) y cada
// rechazo deja fila en audit. Detección: >30 hits de una misma key en ventana móvil de
// 10 s → alert critical con cooldown 15 s (ADR D-0004).
const { maskKey, sha256Hex } = require('./lab');

const DETECTION_MAX_REQUESTS = 30; // estrictamente mayor dispara la alerta
const DETECTION_WINDOW_MS = 10_000; // ventana móvil
const ALERT_COOLDOWN_MS = 15_000; // no spamea el timeline (riesgo T4)

function createApiKeyAuth(lab) {
  const hits = new Map(); // key → timestamps de requests autenticados
  let lastAlertAt = 0;
  const insAlert = lab.db.prepare(
    "INSERT INTO events(ts, kind, severity, message) VALUES (?, 'alert', 'critical', ?)");
  const getByPlain = lab.db.prepare('SELECT status FROM api_keys WHERE key_plain = ?');
  const getByHash = lab.db.prepare('SELECT status, scope FROM api_keys WHERE key_hash = ?');
  const insAudit = lab.db.prepare(
    'INSERT INTO audit(ts, key_masked, method, endpoint, status, reason) VALUES (?, ?, ?, ?, ?, ?)');

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

  // Rechazo + audit: la tabla audit SOLO se escribe con hardening activo (contrato §2.4).
  const reject = (req, res, key, status, error) => {
    if (lab.state.flags && lab.state.flags.hardening) {
      insAudit.run(new Date().toISOString(), key ? maskKey(key) : '—',
        req.method, req.originalUrl, status, error);
    }
    return res.status(status).json({ error });
  };

  const apiKeyAuth = function apiKeyAuth(req, res, next) {
    const key = req.get('x-api-key');
    const hardened = lab.state.flags && lab.state.flags.hardening;
    const row = key
      ? (hardened ? getByHash.get(sha256Hex(key)) : getByPlain.get(key))
      : undefined;
    if (row && row.status === 'disabled') {
      return reject(req, res, key, 403, 'key_disabled'); // kill switch (D-0004)
    }
    if (!row || row.status !== 'active') {
      return reject(req, res, key, 401, 'invalid_api_key'); // sin key / revocada (rotación)
    }
    if (hardened && req.method === 'POST' && row.scope !== 'write:entries') {
      return reject(req, res, key, 403, 'insufficient_scope'); // §2.5: escribir exige scope
    }
    req.authEpoch = lab.state.epoch; // M-3 (QA V1): la auth vale para la epoch vigente al llegar headers
    // L-9 (QA V1, D-0007): el detector cuenta SOLO intentos de escritura (POST) —
    // un flood de GETs legítimos no dispara alerta ni degrada el acto (5→3).
    if (req.method !== 'GET') recordHit(key);
    next();
  };
  // S08 reset (N-0005): el detector vuelve a cero — sin hits ni cooldown heredados del
  // incidente anterior (si no, la 2da demo detectaría tarde por el cooldown de 15 s).
  apiKeyAuth.reset = () => { hits.clear(); lastAlertAt = 0; };
  return apiKeyAuth;
}

module.exports = { createApiKeyAuth, DETECTION_MAX_REQUESTS, DETECTION_WINDOW_MS, ALERT_COOLDOWN_MS };
