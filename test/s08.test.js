'use strict';
// S08 — V1 narración sin fricción. N-0005: hitos del modo guiado visibles por
// /api/lab/state (milestones) + reset del incidente SIN reiniciar el proceso (seed
// restaurado, timeline/audit limpios, flags en cero, demo re-jugable). N-0006:
// escenario 2 — key auténtica y activa SIN scope: POST → 403 insufficient_scope
// auditado, GET → 200, DB limpia.
const { readFileSync, mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../server');
const { createLab, maskKey, SEED_LEGIT_ENTRIES } = require('../src/lab');
const { createAttacker, BOT_INTERVAL_MS } = require('../src/attacker');
const { DETECTION_MAX_REQUESTS, DETECTION_WINDOW_MS } = require('../src/apikey');

const KEY = JSON.parse(readFileSync(path.join(__dirname, '..', 'repo-sim', 'config.json'), 'utf8')).api_key;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withServer(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-s08-'));
  const lab = createLab({ file: path.join(dir, 'test.db') });
  const attacker = createAttacker({ lab });
  const server = buildApp(lab, attacker).listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  attacker.setPort(server.address().port);
  t.after(() => { attacker.stop(); server.close(); lab.db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body, key = null) => fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
  const get = (p, key) => fetch(base + p, { headers: key ? { 'x-api-key': key } : {} })
    .then((r) => r.json());
  const state = () => get('/api/lab/state');
  const audit = async () => (await get('/api/lab/audit')).attempts;
  const until = async (fn, ms, what) => {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(100); }
    assert.ok(false, `timeout esperando ${what}`);
  };
  const keysInDb = () => lab.db.prepare(
    'SELECT label, key_plain, key_hash, scope, status FROM api_keys ORDER BY id').all();
  return { base, lab, server, post, get, state, audit, until, keysInDb };
}

test('N-0005 hitos del modo guiado avanzan con el incidente y el reset restaura el acto 1 sin reiniciar el proceso', async (t) => {
  const { lab, server, post, get, state, audit, until } = await withServer(t);
  const NONE = { attack_started: false, alert_fired: false, firewalls_applied: false, hardening_on: false, reattack_bounced: false };
  assert.deepEqual((await state()).milestones, NONE); // arranque: nada completado

  assert.equal((await post('/api/lab/reset', { x: 1 })).status, 400); // frontera: body vacío

  await t.test('hitos: ataque → detección → matafuegos → hardening → re-ataque rebote', async () => {
    await post('/api/lab/attack', { action: 'start' });
    await until(async () => ((await state()).milestones.attack_started ? 1 : null), 3000, 'hito ataque');
    await until(async () => ((await state()).act === 3 ? 1 : null),
      DETECTION_WINDOW_MS + (DETECTION_MAX_REQUESTS + 2) * BOT_INTERVAL_MS + 5000, 'acto 3 (detección)');
    await post('/api/lab/attack', { action: 'stop' });
    await post('/api/lab/firewall/kill-switch', { enabled: true });
    await post('/api/lab/firewall/rotate-key', {});
    await post('/api/lab/firewall/rate-limit', { enabled: true });
    await post('/api/lab/hardening', { enabled: true });
    const s5 = await state();
    assert.deepEqual(s5.milestones,
      { ...NONE, attack_started: true, alert_fired: true, firewalls_applied: true, hardening_on: true });
    await post('/api/lab/attack', { action: 'start' }); // re-ataque con la key filtrada
    await until(async () => ((await state()).milestones.reattack_bounced ? 1 : null), 8000, 'hito re-ataque');
    await post('/api/lab/attack', { action: 'stop' });
  });

  const dirty = await state();
  assert.ok(dirty.db.garbage > 0); // el incidente dejó basura, alertas y audit…
  assert.ok((await get('/api/lab/timeline')).events.some((e) => e.kind === 'alert'));
  assert.ok((await audit()).length >= 1);

  await t.test('reset: seed restaurado, timeline/audit limpios, flags en cero — proceso vivo', async () => {
    const res = await post('/api/lab/reset', {});
    assert.deepEqual(await res.json(), { reset: true });
    assert.equal(res.status, 200);
    assert.ok(server.listening); // mismo server, mismo proceso
    assert.deepEqual(await get('/api/health'), { status: 'ok', db_entries: SEED_LEGIT_ENTRIES, act: 1 });
    const s = await state();
    assert.deepEqual(s.db, { legit: SEED_LEGIT_ENTRIES, garbage: 0 });
    assert.deepEqual(s.flags, { killswitch: false, ratelimit: false, hardening: false, rotated: false });
    assert.equal(s.act, 1);
    assert.equal(s.attack.requests, 0);
    assert.deepEqual(s.attack.recent, []);
    assert.equal(s.keys.storage, 'plaintext'); // key original activa, sin hashear
    assert.equal(s.keys.current_masked, maskKey(KEY));
    assert.deepEqual(s.milestones, NONE); // el guion vuelve a arrancar de cero
    const events = (await get('/api/lab/timeline')).events;
    assert.equal(events.length, 6); // timeline limpio: solo el seed del acto 1
    assert.deepEqual(events.map((e) => e.kind), ['system', 'traffic', 'traffic', 'traffic', 'traffic', 'traffic']);
    assert.deepEqual(await audit(), []);
    const keys = lab.db.prepare('SELECT label, key_plain, key_hash, scope, status FROM api_keys').all();
    assert.equal(keys.length, 1); // exactamente la key original, activa y en plaintext
    assert.deepEqual({ ...keys[0] },
      { label: 'leaked-repo-config', key_plain: KEY, key_hash: null, scope: null, status: 'active' });
  });

  await t.test('la demo es re-jugable: el ataque vuelve a escribir basura con la key original', async () => {
    await post('/api/lab/attack', { action: 'start' });
    const s = await until(async () => ((await state()).db.garbage > 0 && (await state()).milestones.attack_started ? 1 : null), 5000, 'basura post-reset');
    await post('/api/lab/attack', { action: 'stop' });
    assert.ok(s);
  });
});

test('N-0006 escenario 2: key válida sin scope — POST 403 insufficient_scope auditado, GET 200, DB limpia', async (t) => {
  const { base, lab, post, get, state, audit, until, keysInDb } = await withServer(t);

  assert.equal((await post('/api/lab/scenario/scopeless-key', {})).status, 400); // sin hardening
  await post('/api/lab/hardening', { enabled: true });
  for (const bad of [{ x: 1 }, 'x', []]) {
    const res = await post('/api/lab/scenario/scopeless-key', bad);
    assert.equal(res.status, 400, JSON.stringify(bad)); // frontera: body vacío {}
  }

  const res = await post('/api/lab/scenario/scopeless-key', {});
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.deepEqual([body.scenario, body.running], ['scopeless-key', true]);
  assert.match(body.key_masked, /^sk_b…[0-9a-f]{4}$/); // máscara de una key NUEVA
  assert.notEqual(body.key_masked, maskKey(KEY));
  const row = keysInDb().find((r) => r.label === 'scenario-scopeless');
  assert.ok(row && row.key_hash && row.key_plain === null && row.scope === null && row.status === 'active');

  assert.equal((await post('/api/lab/scenario/scopeless-key', {})).status, 400); // ya corre un ataque

  const s = await until(async () => {
    const st = await state();
    return (await audit()).length >= 3 && st.attack.recent.length > 0
      && st.attack.recent.every((r) => r.status === 403) ? st : null;
  }, 8000, 'POSTs del escenario rebotando 403');
  await post('/api/lab/attack', { action: 'stop' });

  assert.equal(s.db.garbage, 0); // DB limpia: ningún POST llegó al handler
  assert.equal(s.db.legit, SEED_LEGIT_ENTRIES);
  for (const r of await audit()) {
    assert.deepEqual(
      { key: r.key_masked, method: r.method, endpoint: r.endpoint, status: r.status, reason: r.reason },
      { key: body.key_masked, method: 'POST', endpoint: '/api/entries', status: 403, reason: 'insufficient_scope' });
    assert.ok(!Number.isNaN(Date.parse(r.ts)));
  }
  const read = await fetch(`${base}/api/entries`, { headers: { 'x-api-key': KEY } }); // key activa sin scope
  assert.equal(read.status, 200); // leer SÍ puede — el scope exigido es de escritura
});
