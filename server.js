'use strict';
// BreachLab bootstrap (plan §2.3): Express, rutas S01, bind EXCLUSIVO a 127.0.0.1 (ADR D-0003).
try {
  require('node:sqlite'); // check T1: exige Node >= 24 (node:sqlite estable)
} catch {
  console.error(`[breachlab] Se requiere Node.js >= 24 (módulo nativo node:sqlite). Versión actual: ${process.version}.`);
  process.exit(1);
}

const path = require('node:path');
const express = require('express');
const { createLab } = require('./src/lab');
const { createApiKeyAuth } = require('./src/apikey');
const { createEntriesRouter } = require('./src/entries');
const { createLabRoutes } = require('./src/labroutes');
const { createAttacker } = require('./src/attacker');
const { createRateLimiter } = require('./src/ratelimit');

const HOST = '127.0.0.1'; // aislamiento del sandbox: nunca 0.0.0.0 (ADR D-0003)
const DEFAULT_PORT = 3000; // único env opt-in: PORT (plan §3)

function buildApp(lab, attacker = createAttacker({ lab })) {
  const app = express();
  app.disable('x-powered-by'); // NFR-4: sin versiones en respuestas

  // Runtime S03 sobre el lab: contadores del ataque + flags de matafuegos (S04 las prende).
  lab.state.attack = { running: false, requests: 0, blocked: 0, recent: [] };
  lab.state.flags = { killswitch: false, ratelimit: false, hardening: false, rotated: false };

  // Health del panel — sin key (contrato §2.4).
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', db_entries: lab.countEntries(), act: lab.state.act });
  });

  // API víctima detrás de la cadena §2.1: rateLimit → apikey → contador → handler.
  const rateLimiter = createRateLimiter();
  app.use('/api/entries', rateLimiter.middleware, createApiKeyAuth(lab), createEntriesRouter(lab));
  // Consola del defensor (state, timeline, attack, firewall).
  app.use('/api/lab', createLabRoutes(lab, attacker, rateLimiter));

  // El leak servido read-only: la "config versionada" con la key falsa (AC4, ADR D-0003 §6).
  app.get('/leak/config.json', (_req, res) => {
    res.sendFile(path.join(__dirname, 'repo-sim', 'config.json'));
  });

  // Postmortem servido read-only (S06): el relato EN del incidente, linkeado desde el panel.
  app.get('/docs/postmortem.md', (_req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'postmortem.md'));
  });

  // Panel del defensor (S02): vanilla static, sin build step (plan §2.1). index.html queda en /.
  app.use(express.static(path.join(__dirname, 'public')));

  // 404 JSON sin internals (NFR-4: sin rutas/stack/versiones en cuerpos de error).
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  // Handler central (plan §3): bodies malformados (parse/size/charset de body-parser)
  // → 400 invalid_request sin internals; todo lo demás → 500 sin internals.
  app.use((err, _req, res, _next) => {
    if (err && [400, 413, 415].includes(err.status)) {
      return res.status(400).json({ error: 'invalid_request', details: 'body JSON malformado o demasiado grande' });
    }
    console.error('[breachlab] error no manejado:', err.message);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT, 10) || DEFAULT_PORT;
  const lab = createLab({ file: path.join(__dirname, 'data', 'breachlab.db') });
  const attacker = createAttacker({ lab, port }); // PORT fluye a bot y server (ADR D-0003)
  buildApp(lab, attacker).listen(port, HOST, () => {
    console.log(`[breachlab] http://${HOST}:${port} — sandbox local · acto 1 (normal)`);
  });
}

module.exports = { buildApp, createLab };
