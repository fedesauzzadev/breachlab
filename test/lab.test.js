'use strict';
// S01 — Sandbox vivo: seed fijo + endpoints + aislamiento (AC2, AC3, AC4, AC5-bind).
// La key usada en los tests sale del ARTEFACTO del leak, no de una constante duplicada.
const { readFileSync, mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../server');
const { createLab, SEED_LEGIT_ENTRIES } = require('../src/lab');

const leak = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'repo-sim', 'config.json'), 'utf8'));

async function withServer(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-'));
  const lab = createLab({ file: path.join(dir, 'test.db') });
  const server = buildApp(lab).listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  t.after(() => { server.close(); lab.db.close(); });
  return { base: `http://127.0.0.1:${server.address().port}`, server, lab };
}

test('AC5: servidor efímero bindeado EXCLUSIVAMENTE a 127.0.0.1', async (t) => {
  const { server } = await withServer(t);
  assert.equal(server.address().address, '127.0.0.1');
  assert.ok(server.address().port > 0);
});

test('AC2: /api/health sin key → ok, seed de 12, acto 1', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { status: 'ok', db_entries: SEED_LEGIT_ENTRIES, act: 1 });
  assert.equal(body.db_entries, 12); // cantidad fija y documentada (D-0004)
});

test('AC2: /api/entries con la key DEL LEAK → 12 legit, 0 garbage', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(`${base}/api/entries`, { headers: { 'x-api-key': leak.api_key } });
  assert.equal(res.status, 200);
  const { entries, count } = await res.json();
  assert.equal(count, SEED_LEGIT_ENTRIES);
  assert.equal(entries.length, SEED_LEGIT_ENTRIES);
  entries.forEach((e, i) => {
    assert.equal(e.id, i + 1); // orden e ids determinísticos
    assert.equal(e.kind, 'legit'); // cero garbage en seed
    assert.equal(typeof e.title, 'string'); assert.ok(e.title.length > 0);
    assert.equal(typeof e.body, 'string'); assert.ok(e.body.length > 0);
    assert.ok(!Number.isNaN(Date.parse(e.created_at))); // ISO-8601 válido
  });
});

test('Contrato §2.4: /api/entries sin key o con key mala → 401 invalid_api_key', async (t) => {
  const { base } = await withServer(t);
  for (const headers of [{}, { 'x-api-key': 'sk_breachlab_demo_WRONG_0000' }]) {
    const res = await fetch(`${base}/api/entries`, { headers });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'invalid_api_key' });
  }
});

test('AC3: timeline con eventos normales cronológicos y CERO de seguridad', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(`${base}/api/lab/timeline`);
  assert.equal(res.status, 200);
  const { events } = await res.json();
  assert.equal(events.length, 6); // 1 system + 5 traffic (seed fijo)
  let prevTs = 0;
  events.forEach((e, i) => {
    assert.equal(e.id, i + 1); // cronológico por id
    const ts = Date.parse(e.ts);
    assert.ok(!Number.isNaN(ts));
    assert.ok(ts >= prevTs, 'ts no decreciente'); // cronológico por hora
    prevTs = ts;
    assert.ok(['traffic', 'system'].includes(e.kind)); // nada de alert/action
    assert.equal(e.severity, 'info'); // cero eventos de seguridad (AC2)
    assert.equal(typeof e.message, 'string'); assert.ok(e.message.length > 0);
  });
  // ?since=<id> devuelve solo lo posterior
  const res2 = await fetch(`${base}/api/lab/timeline?since=1`);
  const { events: tail } = await res2.json();
  assert.equal(tail.length, 5);
  assert.ok(tail.every((e) => e.id > 1));
});

test('AC4: /leak/config.json sirve el artefacto read-only con la key falsa', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(`${base}/leak/config.json`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.api_key.startsWith('sk_breachlab_demo_')); // prefijo propio (D-0004)
  assert.equal(body.api_key, leak.api_key); // la key servida ES la que autentica (el leak funciona)
});

test('Invariante: seed determinista entre corridas (semilla fija)', async () => {
  const run = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-'));
    const lab = createLab({ file: path.join(dir, 'test.db') });
    const titles = lab.listEntries().map((e) => e.title);
    const messages = lab.listEvents().map((e) => e.message);
    lab.db.close();
    return { titles, messages };
  };
  assert.deepEqual(run(), run()); // mismas 12 entries y mismos eventos, mismo orden
});

test('NFR-4: ruta desconocida → 404 JSON sin internals', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(`${base}/api/no-existe`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.deepEqual(body, { error: 'not_found' });
  assert.ok(!JSON.stringify(body).includes('/api/no-existe')); // sin rutas en el body
});
