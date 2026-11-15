'use strict';
// Núcleo del lab (plan §2.3): node:sqlite — schema, seed fijo y estado runtime. Números: ADR D-0004.
const { mkdirSync, readFileSync, rmSync } = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
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

function sha256Hex(key) {
  // S05 hardening (§2.5): así — y solo así — queda la key en la DB. node:crypto nativo.
  return createHash('sha256').update(key).digest('hex');
}

// Re-seed en cada arranque: no hay estado que preservar (spec, supuesto #3).
const SCHEMA = `
    DROP TABLE IF EXISTS entries;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS api_keys;
    DROP TABLE IF EXISTS audit;
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
    CREATE TABLE audit(
      id INTEGER PRIMARY KEY,
      ts TEXT NOT NULL, key_masked TEXT NOT NULL, method TEXT NOT NULL,
      endpoint TEXT NOT NULL, status INTEGER NOT NULL, reason TEXT NOT NULL
    );
`;

// M-2 (NFR-10): DB corrupta al arranque → log accionable + borrar + re-seed, no stack crudo.
function openDb(dbFile) {
  let db;
  try {
    db = new DatabaseSync(dbFile);
    db.exec(SCHEMA);
    return db;
  } catch (err) {
    if (db) db.close(); // Windows: liberar el handle antes de borrar el archivo
    console.error(`[breachlab] DB corrupta, recreando… (${err.message})`);
    rmSync(dbFile);
    db = new DatabaseSync(dbFile);
    db.exec(SCHEMA);
    return db;
  }
}

function createLab({ file } = {}) {
  const dbFile = file || path.join(__dirname, '..', 'data', 'breachlab.db');
  mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = openDb(dbFile);

  const insEntry = db.prepare(
    'INSERT INTO entries(kind, title, body, created_at) VALUES (?, ?, ?, ?)');
  const insKey = db.prepare(
    "INSERT INTO api_keys(label, key_plain, key_hash, scope, status, created_at) VALUES (?, ?, NULL, NULL, 'active', ?)");
  const insEvent = db.prepare(
    'INSERT INTO events(ts, kind, severity, message) VALUES (?, ?, ?, ?)');
  // Seed del estado normal inicial (acto 1): lo usa el arranque y el reset del incidente (S08).
  const seed = () => {
    const base = Date.now();
    for (let i = 0; i < SEED_ENTRIES.length; i++) {
      const [title, body] = SEED_ENTRIES[i];
      insEntry.run('legit', title, body, new Date(base + i).toISOString());
    }
    // Exactamente 1 key en seed (contrato §2.4); key_plain = mala práctica visible (S05 migra a sha256).
    // Status active: la key del leak FUNCIONA.
    insKey.run('leaked-repo-config', leakedKey, new Date(base).toISOString());
    // Timeline acto 1: 1 evento system + tráfico legítimo. CERO eventos de seguridad (AC2).
    insEvent.run(new Date(base).toISOString(), 'system', 'info',
      `Sandbox iniciada · ${SEED_LEGIT_ENTRIES} registros legítimos · acto 1 (normal)`);
    for (let i = 1; i <= SEED_TRAFFIC_EVENTS; i++) {
      insEvent.run(new Date(base + i * 1000).toISOString(), 'traffic', 'info',
        `GET /api/entries · 200 · key ${maskKey(leakedKey)}`);
    }
  };
  seed();
  // State runtime: actos 1..5 (D-0004). currentMasked: la máscara vigente se guarda acá
  // porque con storage sha256 no se puede re-derivar desde la DB (S05).
  const state = { act: 1, currentMasked: maskKey(leakedKey) };

  const api = {
    db,
    state,
    countEntries: () => db.prepare('SELECT COUNT(*) AS n FROM entries').get().n,
    listEntries: () =>
      db.prepare('SELECT id, kind, title, body, created_at FROM entries ORDER BY id').all(),
    listEvents: (since = 0) =>
      db.prepare('SELECT id, ts, kind, severity, message FROM events WHERE id > ? ORDER BY id')
        .all(since),
    listAudit: (since = 0) =>
      db.prepare('SELECT id, ts, key_masked, method, endpoint, status, reason FROM audit WHERE id > ? ORDER BY id')
        .all(since),
    maskKey,
    // S04 matafuegos (§2.5): acciones sobre la key COMPROMETIDA — el leak del artefacto repo-sim.
    killSwitch: () => {
      // Post-hardening el plain ya no existe: matchea también por hash (§2.5).
      db.prepare("UPDATE api_keys SET status = 'disabled' WHERE key_plain = ? OR key_hash = ?")
        .run(leakedKey, sha256Hex(leakedKey));
      return maskKey(leakedKey);
    },
    rotateKey: () => {
      // La "key vieja" es la activa vigente (leaked o rotación previa) → revoked.
      db.prepare("UPDATE api_keys SET status = 'revoked' WHERE status = 'active'").run();
      // Nueva key falsa con el prefijo propio (FAKE BY DESIGN, allowlist gitleaks).
      const fresh = `sk_breachlab_demo_ROTATED_${randomBytes(8).toString('hex')}`;
      if (state.flags && state.flags.hardening) {
        // Con hardening activo la key NACE hasheada y con scope: jamás reintroduce plain.
        db.prepare(
          "INSERT INTO api_keys(label, key_hash, scope, status, created_at) VALUES ('rotated', ?, 'write:entries', 'active', ?)"
        ).run(sha256Hex(fresh), new Date().toISOString());
      } else {
        db.prepare(
          "INSERT INTO api_keys(label, key_plain, status, created_at) VALUES ('rotated', ?, 'active', ?)"
        ).run(fresh, new Date().toISOString());
      }
      state.currentMasked = maskKey(fresh); // solo la máscara sale del lab
      return state.currentMasked;
    },
    // S05 (§2.5): migración one-shot plain→sha256 en DB. La key del leak queda SIN scope
    // aunque siga active — D-0004: re-ataque sin rotación previa rebota 403 por alcance.
    hardenKeys: () => {
      const rows = db.prepare(
        'SELECT id, key_plain, status FROM api_keys WHERE key_plain IS NOT NULL').all();
      const upd = db.prepare(
        'UPDATE api_keys SET key_hash = ?, key_plain = NULL, scope = ? WHERE id = ?');
      for (const r of rows) {
        const legit = r.status === 'active' && r.key_plain !== leakedKey;
        upd.run(sha256Hex(r.key_plain), legit ? 'write:entries' : null, r.id);
        if (legit) state.currentMasked = maskKey(r.key_plain);
      }
      return rows.length;
    },
    // S08 (N-0005): reinicio del incidente SIN reiniciar el proceso — vuelve al acto 1
    // exacto: seed restaurado (12 legit + key original activa en plaintext), timeline y
    // audit limpios (ids desde 1), flags y contadores en cero.
    reset() {
      db.exec('DELETE FROM entries; DELETE FROM events; DELETE FROM api_keys; DELETE FROM audit;');
      seed();
      state.act = 1;
      state.currentMasked = maskKey(leakedKey);
      state.attack = { running: false, requests: 0, blocked: 0, recent: [] };
      state.flags = { killswitch: false, ratelimit: false, hardening: false, rotated: false };
    },
  };
  return api;
}

module.exports = { createLab, maskKey, sha256Hex, SEED_LEGIT_ENTRIES };
