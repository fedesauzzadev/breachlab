'use strict';
// Núcleo del lab (plan §2.3): node:sqlite — schema, seed fijo y estado runtime. Números: ADR D-0004.
const { mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SEED_LEGIT_ENTRIES = 12; // D-0004: cantidad fija y documentada
const SEED_TRAFFIC_EVENTS = 5; // timeline acto 1: tráfico legítimo del seed

// El leak vive SOLO en el artefacto repo-sim/config.json (ADR D-0003 §6):
// el seed lee la key de ahí; jamás hardcodeada en código.
const leakedKey = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'repo-sim', 'config.json'), 'utf8')
).api_key;

const SEED_ENTRIES = [
  ['Bienvenida al laboratorio', 'Primer registro legítimo del seed. Todo normal por acá.'],
  ['Onboarding del equipo', 'Guía de uso de la API interna para nuevos integrantes.'],
  ['Ticket #12: consulta de estado', 'Cliente pide el estado de su pedido vía /api/entries.'],
  ['Ticket #13: alto en inventario', 'Reporte de stock consultado con la key del servicio.'],
  ['Reporte diario', 'Resumen automático de operaciones del día anterior.'],
  ['Ticket #14: sincronización', 'Sincronización nocturna completada sin errores.'],
  ['Nota interna: backups', 'Backup de la base verificado a las 03:00 UTC.'],
  ['Ticket #15: export CSV', 'Export solicitado por analytics, servido en 200 ms.'],
  ['Ticket #16: duplicado', 'Consulta duplicada detectada y respondida desde caché.'],
  ['Nota interna: latencia', 'p95 estable bajo el umbral; sin anomalías.'],
  ['Ticket #17: alta de cliente', 'Alta procesada y registrada en el timeline de tráfico.'],
  ['Cierre del día', 'Último registro legítimo del seed. Nada raro todavía.'],
];

function maskKey(key) {
  // D-0004: primeros 4 + … + últimos 4 chars visibles como máximo.
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function createLab({ file } = {}) {
  const dbFile = file || path.join(__dirname, '..', 'data', 'breachlab.db');
  mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);

  // Re-seed en cada arranque: no hay estado que preservar (spec, supuesto #3).
  db.exec(`
    DROP TABLE IF EXISTS entries;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS api_keys;
    CREATE TABLE entries(
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('legit','garbage')),
      title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE events(
      id INTEGER PRIMARY KEY,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('traffic','alert','action','system')),
      severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical','success')),
      message TEXT NOT NULL
    );
    CREATE TABLE api_keys(
      id INTEGER PRIMARY KEY,
      label TEXT NOT NULL, key_plain TEXT, key_hash TEXT, scope TEXT,
      status TEXT NOT NULL CHECK(status IN ('active','revoked','disabled')),
      created_at TEXT NOT NULL
    );
  `);

  const base = Date.now();
  const insEntry = db.prepare(
    'INSERT INTO entries(kind, title, body, created_at) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < SEED_ENTRIES.length; i++) {
    const [title, body] = SEED_ENTRIES[i];
    insEntry.run('legit', title, body, new Date(base + i).toISOString());
  }

  // Exactamente 1 key en seed (contrato §2.4); key_plain = mala práctica visible (S05 migra a sha256).
  // Status active: la key del leak FUNCIONA.
  db.prepare(
    "INSERT INTO api_keys(label, key_plain, key_hash, scope, status, created_at) VALUES (?, ?, NULL, NULL, 'active', ?)"
  ).run('leaked-repo-config', leakedKey, new Date(base).toISOString());

  // Timeline acto 1: 1 evento system + tráfico legítimo. CERO eventos de seguridad (AC2).
  const insEvent = db.prepare(
    'INSERT INTO events(ts, kind, severity, message) VALUES (?, ?, ?, ?)');
  insEvent.run(new Date(base).toISOString(), 'system', 'info',
    `Sandbox iniciada · ${SEED_LEGIT_ENTRIES} registros legítimos · acto 1 (normal)`);
  for (let i = 1; i <= SEED_TRAFFIC_EVENTS; i++) {
    insEvent.run(new Date(base + i * 1000).toISOString(), 'traffic', 'info',
      `GET /api/entries · 200 · key ${maskKey(leakedKey)}`);
  }
  return {
    db,
    state: { act: 1 }, // actos 1..5 (D-0004); S01 vive siempre en acto 1
    countEntries: () => db.prepare('SELECT COUNT(*) AS n FROM entries').get().n,
    listEntries: () =>
      db.prepare('SELECT id, kind, title, body, created_at FROM entries ORDER BY id').all(),
    listEvents: (since = 0) =>
      db.prepare('SELECT id, ts, kind, severity, message FROM events WHERE id > ? ORDER BY id')
        .all(since),
    isKeyActive: (key) =>
      !!db.prepare("SELECT 1 FROM api_keys WHERE key_plain = ? AND status = 'active'").get(key),
    maskKey,
  };
}

module.exports = { createLab, maskKey, SEED_LEGIT_ENTRIES };
