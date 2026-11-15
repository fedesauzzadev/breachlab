'use strict';
// Middleware fixed-window por key (plan §2.1: rateLimit → apikey → handler).
// Defaults 10 req / 10 s por key (ADR D-0004). Rangos válidos: max 1..1000, window_ms 1000..600000.
const DEFAULT_MAX = 10;
const DEFAULT_WINDOW_MS = 10_000;

function createRateLimiter() {
  const cfg = { enabled: false, max: DEFAULT_MAX, windowMs: DEFAULT_WINDOW_MS };
  const buckets = new Map(); // key → {start, count}; shortcut: sin eviction — sandbox loopback, pocas keys
  return {
    cfg,
    // Ventanas limpias al cambiar límites: la ráfaga posterior al ON arranca de 0 (determinismo NFR-5).
    configure({ max = cfg.max, windowMs = cfg.windowMs } = {}) {
      cfg.max = max;
      cfg.windowMs = windowMs;
      buckets.clear();
    },
    middleware(req, res, next) {
      if (!cfg.enabled) return next();
      const key = req.get('x-api-key') || '';
      const now = Date.now();
      let b = buckets.get(key);
      if (!b || now - b.start >= cfg.windowMs) buckets.set(key, (b = { start: now, count: 0 }));
      b.count += 1;
      if (b.count > cfg.max) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((b.start + cfg.windowMs - now) / 1000))));
        return res.status(429).json({ error: 'rate_limited' }); // D-0004
      }
      next();
    },
  };
}

module.exports = { createRateLimiter };
