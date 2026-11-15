'use strict';
// API víctima: GET/POST /api/entries (contrato §2.4), montado DETRÁS del middleware
// x-api-key. Validación estricta de frontera: {title 1..80, body 1..280} sin extras (NFR-1).
const express = require('express');

function validateEntry(b) {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) {
    return 'body debe ser un objeto JSON {title, body}';
  }
  const ks = Object.keys(b);
  if (ks.length !== 2 || !('title' in b) || !('body' in b)) {
    return 'exactamente los campos title y body, sin campos extra';
  }
  if (typeof b.title !== 'string' || b.title.length < 1 || b.title.length > 80) {
    return 'title debe ser texto de 1 a 80 caracteres';
  }
  if (typeof b.body !== 'string' || b.body.length < 1 || b.body.length > 280) {
    return 'body debe ser texto de 1 a 280 caracteres';
  }
  return null;
}

function createEntriesRouter(lab) {
  const router = express.Router();
  router.use(express.json({ limit: '100kb' })); // frontera: payload acotado
  const ins = lab.db.prepare('INSERT INTO entries(kind, title, body, created_at) VALUES (?, ?, ?, ?)');

  router.get('/', (_req, res) => {
    const entries = lab.listEntries();
    res.json({ entries, count: entries.length });
  });

  router.post('/', (req, res) => {
    const problem = validateEntry(req.body);
    if (problem) return res.status(400).json({ error: 'invalid_request', details: problem });
    // §2.1/§2.5: todo POST autenticado escribe; el kind lo da el flujo del lab —
    // lo que entra mientras corre un ataque es basura, lo demás es escritura legítima.
    const kind = lab.state.attack && lab.state.attack.running ? 'garbage' : 'legit';
    const { lastInsertRowid } = ins.run(kind, req.body.title, req.body.body, new Date().toISOString());
    res.status(201).json({ id: Number(lastInsertRowid) });
  });

  return router;
}

module.exports = { createEntriesRouter };
