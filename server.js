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

const HOST = '127.0.0.1'; // aislamiento del sandbox: nunca 0.0.0.0 (ADR D-0003)
const DEFAULT_PORT = 3000; // único env opt-in: PORT (plan §3)

function buildApp(lab) {
  const app = express();
  app.disable('x-powered-by'); // NFR-4: sin versiones en respuestas

  // Health del panel — sin key (contrato §2.4).
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', db_entries: lab.countEntries(), act: lab.state.act });
  });

  // API víctima — el contrato exige x-api-key. S01: comparación plaintext (el middleware llega en S03).
  app.get('/api/entries', (req, res) => {
    const key = req.get('x-api-key');
    if (!key || !lab.isKeyActive(key)) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }
    const entries = lab.listEntries();
    res.json({ entries, count: entries.length });
  });

  // Timeline del defensor (AC3): eventos cronológicos con hora. ?since=<id> incremental.
  app.get('/api/lab/timeline', (req, res) => {
    const since = Number.parseInt(req.query.since, 10);
    res.json({ events: lab.listEvents(Number.isInteger(since) ? since : 0) });
  });

  // El leak servido read-only: la "config versionada" con la key falsa (AC4, ADR D-0003 §6).
  app.get('/leak/config.json', (_req, res) => {
    res.sendFile(path.join(__dirname, 'repo-sim', 'config.json'));
  });

  // Panel del defensor (S02): vanilla static, sin build step (plan §2.1). index.html queda en /.
  app.use(express.static(path.join(__dirname, 'public')));

  // 404 JSON sin internals (NFR-4: sin rutas/stack/versiones en cuerpos de error).
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  // Handler central (plan §3): 500 sin internals.
  app.use((err, _req, res, _next) => {
    console.error('[breachlab] error no manejado:', err.message);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT, 10) || DEFAULT_PORT;
  const lab = createLab({ file: path.join(__dirname, 'data', 'breachlab.db') });
  buildApp(lab).listen(port, HOST, () => {
    console.log(`[breachlab] http://${HOST}:${port} — sandbox local · acto 1 (normal)`);
  });
}

module.exports = { buildApp, createLab };
