'use strict';
// S09a — N-0007: serie de labs. Dos vectores NUEVOS de filtración (server-log,
// frontend-bundle) elegibles desde el panel, cada uno con evidencia propia bajo /leak/,
// narración en timeline, seed con SU key y ciclo completo sobre ella (ataque →
// detección → matafuegos → hardening → re-ataque rebota auditado). La base
// (repo-config) queda intacta: mismo seed, mismo relato del acto 1.
const { mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../server');
const { createLab, maskKey, SEED_LEGIT_ENTRIES } = require('../src/lab');
const { createAttacker, BOT_INTERVAL_MS } = require('../src/attacker');
const { DETECTION_MAX_REQUESTS, DETECTION_WINDOW_MS } = require('../src/apikey');
const { SCENARIOS } = require('../src/scenarios');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withServer(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-s09a-'));
  const lab = createLab({ file: path.join(dir, 'test.db') });
  const attacker = createAttacker({ lab });
  const server = buildApp(lab, attacker).listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  attacker.setPort(server.address().port);
  t.after(() => { attacker.stop(); server.close(); lab.db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) => fetch(base + p, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
  const get = (p) => fetch(base + p).then((r) => r.json());
  const state = () => get('/api/lab/state');
  const audit = async () => (await get('/api/lab/audit')).attempts;
  const until = async (fn, ms, what) => {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(100); }
    assert.ok(false, `timeout esperando ${what}`);
  };
  const keysInDb = () => lab.db.prepare(
    'SELECT label, key_plain, status FROM api_keys ORDER BY id').all();
  return { base, lab, post, get, state, audit, until, keysInDb };
}

test('N-0007 AC1: la serie es elegible — catálogo de 3 vectores con evidencia y origen propios', async (t) => {
  const { post, get, state } = await withServer(t);
  const { scenarios, current } = await get('/api/lab/scenarios');
  assert.deepEqual(scenarios.map((s) => s.id), ['repo-config', 'server-log', 'frontend-bundle']);
  assert.equal(current, 'repo-config'); // arranque: la base histórica
  assert.deepEqual((await state()).scenario.id, 'repo-config');
  assert.equal(new Set(scenarios.map((s) => s.leak_url)).size, 3); // evidencia distinta por vector
  assert.ok(scenarios.every((s) => s.name && s.origin && s.leak_kind));

  // Fronteras: vector desconocido → 404 · body extra → 400.
  assert.equal((await post('/api/lab/scenarios/nope', {})).status, 404);
  assert.equal((await post('/api/lab/scenarios/server-log', { x: 1 })).status, 400);
});

// AC2: para CADA vector nuevo — selección → evidencia + narración + seed propio →
// ciclo completo sobre la key del vector → reset re-narra el vector activo.
for (const id of ['server-log', 'frontend-bundle']) {
  test(`N-0007 AC2: vector ${id} — ciclo completo con su key, su evidencia y su narración`, async (t) => {
    const sc = SCENARIOS[id];
    const { base, lab, post, get, state, audit, until, keysInDb } = await withServer(t);

    const res = await post(`/api/lab/scenarios/${id}`, {});
    assert.deepEqual(await res.json(), { scenario: id, reset: true });
    const s1 = await state();
    assert.deepEqual(s1.scenario,
      { id, name: sc.name, origin: sc.origin, leak_url: sc.leakUrl, leak_kind: sc.leakKind });
    assert.deepEqual(s1.db, { legit: SEED_LEGIT_ENTRIES, garbage: 0 }); // acto 1 exacto
    assert.equal(s1.act, 1);
    assert.equal(s1.keys.leaked_masked, maskKey(sc.key)); // el leak es el de ESTE vector
    assert.deepEqual(keysInDb().map((k) => [k.label, k.key_plain, k.status]),
      [[sc.dbLabel, sc.key, 'active']]); // seed sembró SU key

    const leak = await fetch(base + sc.leakUrl); // evidencia del leak, visible
    assert.equal(leak.status, 200);
    assert.ok((await leak.text()).includes(sc.key));
    const events = (await get('/api/lab/timeline')).events;
    assert.ok(events.some((e) => e.kind === 'system' && e.severity === 'warning' && e.message === sc.narration));

    await post('/api/lab/attack', { action: 'start' }); // ataque con la key DEL VECTOR
    assert.equal((await post(`/api/lab/scenarios/${id}`, {})).status, 400, 'ataque corriendo');
    const budget = DETECTION_WINDOW_MS + (DETECTION_MAX_REQUESTS + 2) * BOT_INTERVAL_MS + 5000;
    const s3 = await until(async () => ((await state()).act === 3 ? await state() : null), budget, `detección (${id})`);
    assert.ok(s3.db.garbage >= DETECTION_MAX_REQUESTS - 1); // la basura creció con SU key
    await post('/api/lab/attack', { action: 'stop' });
    await sleep(BOT_INTERVAL_MS + 150); // aterriza lo en vuelo antes de congelar
    const frozen = (await state()).db.garbage;

    await post('/api/lab/firewall/kill-switch', { enabled: true });
    await post('/api/lab/firewall/rotate-key', {});
    await post('/api/lab/hardening', { enabled: true });
    await post('/api/lab/attack', { action: 'start' }); // re-ataque con la MISMA key
    await until(async () => ((await state()).milestones.reattack_bounced ? 1 : null), 15_000, `rebote (${id})`);
    await post('/api/lab/attack', { action: 'stop' });
    const attempts = await audit();
    assert.ok(attempts.length >= 1); // todo rebote auditado, con la máscara del vector
    assert.ok(attempts.every((a) => a.key_masked === maskKey(sc.key) && a.status !== 201));
    assert.equal((await state()).db.garbage, frozen); // 0 basura nueva post-hardening

    await post('/api/lab/reset', {}); // el reset RE-NARRA el vector activo (no vuelve a la base)
    const sr = await state();
    assert.equal(sr.scenario.id, id);
    assert.equal(sr.keys.leaked_masked, maskKey(sc.key));
    assert.deepEqual(keysInDb().map((k) => [k.label, k.key_plain]), [[sc.dbLabel, sc.key]]);
    assert.ok(lab.listEvents().some((e) => e.message === sc.narration));
  });
}

test('N-0007 base intacta: repo-config sin narración extra y vuelta limpia desde otro vector', async (t) => {
  const { post, get, state, keysInDb } = await withServer(t);
  await post('/api/lab/scenarios/frontend-bundle', {});
  const back = await post('/api/lab/scenarios/repo-config', {});
  assert.deepEqual(await back.json(), { scenario: 'repo-config', reset: true });
  const events = (await get('/api/lab/timeline')).events; // base: 6 eventos exactos (S08 intacto)
  assert.deepEqual(events.map((e) => e.kind), ['system', 'traffic', 'traffic', 'traffic', 'traffic', 'traffic']);
  assert.equal((await state()).keys.leaked_masked, maskKey(SCENARIOS['repo-config'].key));
  assert.deepEqual(keysInDb().map((k) => k.label), ['leaked-repo-config']);
});
