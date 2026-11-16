'use strict';
// S08 — V1 narración sin fricción. N-0005: hitos del modo guiado visibles por
// /api/lab/state (milestones) + reset del incidente SIN reiniciar el proceso (seed
// restaurado, timeline/audit limpios, flags en cero, demo re-jugable). N-0006:
// escenario 2 — key auténtica y activa SIN scope: POST → 403 insufficient_scope
// auditado, GET → 200, DB limpia.
const net = require('node:net');
const test = require('node:test');
const assert = require('node:assert/strict');
const { maskKey, SEED_LEGIT_ENTRIES } = require('../src/lab');
const { BOT_INTERVAL_MS } = require('../src/attacker');
const { DETECTION_MAX_REQUESTS, DETECTION_WINDOW_MS } = require('../src/apikey');
const { KEY, sleep, until, withServer } = require('./helpers');

test('N-0005 hitos del modo guiado avanzan con el incidente y el reset restaura el acto 1 sin reiniciar el proceso', async (t) => {
  const { base, lab, post, getJson: get, state, audit, server } = await withServer(t);
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
  const { base, lab, post, getJson: get, state, audit, keysInDb } = await withServer(t);

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

// M-3 (QA V1, hallazgo medio): TOCTOU del reset — la auth viaja con los headers y el
// insert con el body; un POST autenticado ANTES del reset puede aterrizar DESPUÉS del
// re-seed y dejar una fila legit extra en el acto 1 (repro P6: socket crudo goteando
// el body). El fix: epoch del lab estampada en la auth; el handler rechaza 409 si el
// reset cambió el mundo debajo del request.
test('M-3 TOCTOU del reset: POST autenticado pre-reset con body goteado rebota y no ensucia el seed', async (t) => {
  const { lab, server, post, getJson: get } = await withServer(t);
  const port = server.address().port;
  const body = JSON.stringify({ title: 'QA-RACE-TRICKLE', body: 'escritura de la demo anterior' });
  const headers =
    'POST /api/entries HTTP/1.1\r\n' +
    `Host: 127.0.0.1:${port}\r\n` +
    'Content-Type: application/json\r\n' +
    `x-api-key: ${KEY}\r\n` +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    'Connection: close\r\n\r\n';

  const sock = net.connect(port, '127.0.0.1');
  await new Promise((r) => sock.on('connect', r));
  sock.write(headers + body.slice(0, 10)); // headers completos + 10 bytes: la auth YA corrió
  await sleep(250); // express.json queda esperando el resto del body
  assert.equal((await post('/api/lab/reset', {})).status, 200); // reset completa en el medio
  sock.end(body.slice(10)); // el body restante llega TRAS el re-seed

  const raw = await new Promise((r) => {
    const chunks = [];
    sock.on('data', (c) => chunks.push(c));
    sock.on('close', () => r(Buffer.concat(chunks).toString()));
  });
  assert.match(raw, /^HTTP\/1\.1 409/); // sin fix: 201 Created (fila legit id 13 en acto 1)
  assert.deepEqual(await get('/api/health'),
    { status: 'ok', db_entries: SEED_LEGIT_ENTRIES, act: 1 }); // sin fix: 13 entries
  assert.ok(!lab.listEntries().some((e) => e.title === 'QA-RACE-TRICKLE')); // ninguna fila colada
});
