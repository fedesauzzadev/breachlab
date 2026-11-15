'use strict';
// S04 — Matafuegos (N-0003): kill switch → 403 · rotación → 401 + key nueva (solo máscara) · rate limit → 429 + Retry-After.
const { readFileSync, mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../server');
const { createLab, maskKey } = require('../src/lab');
const { createAttacker } = require('../src/attacker');

const KEY = JSON.parse(readFileSync(path.join(__dirname, '..', 'repo-sim', 'config.json'), 'utf8')).api_key;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withServer(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-'));
  const lab = createLab({ file: path.join(dir, 'test.db') });
  const attacker = createAttacker({ lab });
  const server = buildApp(lab, attacker).listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  attacker.setPort(server.address().port);
  t.after(() => { attacker.stop(); server.close(); lab.db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body, key = KEY) => fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
  const fw = (name, body) => post(`/api/lab/firewall/${name}`, body, null);
  const state = async () => (await fetch(`${base}/api/lab/state`)).json();
  const timeline = async () => (await (await fetch(`${base}/api/lab/timeline`)).json()).events;
  const until = async (fn, ms, what) => {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(100); }
    assert.ok(false, `timeout esperando ${what}`);
  };
  const activeKey = () => // la key NUEVA solo existe completa en la DB (acceso de test)
    lab.db.prepare("SELECT key_plain FROM api_keys WHERE status = 'active' ORDER BY id DESC LIMIT 1")
      .get().key_plain;
  return { base, lab, post, fw, state, timeline, until, activeKey };
}test('AC1 kill switch: 403 key_disabled, basura congela, blocked crece, evento con hora, acto 3→4', async (t) => {
  const { base, post, fw, state, timeline, until } = await withServer(t);
  await post('/api/lab/attack', { action: 'start' });
  for (let i = 0; i < 32; i++) await fetch(`${base}/api/entries`, { headers: { 'x-api-key': KEY } }); // umbral (patrón S03)
  await until(async () => ((await timeline()).some((e) => e.kind === 'alert') ? 1 : null), 5000, 'alerta');
  // Los 32 fetch de arriba son GETs (solo inflan el detector): la basura llega con el
  // primer POST del bot — en runners lentos puede llegar después de la alerta. Poll.
  await until(async () => (((await state()).db.garbage >= 1) ? 1 : null), 5000, 'garbage >= 1 (primer POST del bot)');

  const res = await fw('kill-switch', { enabled: true });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { killswitch: true });
  const s0 = await state(); // baseline POST-switch: desde acá nada nuevo puede entrar
  const s = await until(async () => // el bot NO se detiene: sigue disparando y rebota
    ((await state()).attack.blocked > s0.attack.blocked + 1 ? await state() : null), 6000, 'blocked creciendo');
  assert.ok(s.attack.recent.some((r) => r.status === 403)); // feed con 403 REALES
  assert.equal(s.db.garbage, s0.db.garbage); // el bot dejó de consumir: basura congelada
  assert.equal(s.flags.killswitch, true);
  assert.equal(s.act, 4); // contained: matafuegos tras detección (§2.5)
  const direct = await post('/api/entries', { title: 't', body: 'b' });
  assert.equal(direct.status, 403);
  assert.deepEqual(await direct.json(), { error: 'key_disabled' });
  const ev = (await timeline()).filter((e) => e.kind === 'action').pop(); // AC4: evento con hora y efecto
  assert.ok(ev && !Number.isNaN(Date.parse(ev.ts)) && ev.message.includes('403') && ev.message.includes(maskKey(KEY)));
  await post('/api/lab/attack', { action: 'stop' });
});

test('AC2 rotación: key vieja → 401, nueva legítima (solo máscara en respuestas), bot rebota 401', async (t) => {
  const { post, fw, state, timeline, until, activeKey } = await withServer(t);
  await post('/api/lab/attack', { action: 'start' });
  await until(async () => ((await state()).attack.requests >= 2 ? 1 : null), 5000, 'requests del bot');

  const res = await fw('rotate-key', {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.new_key_masked, /^sk_b…[0-9a-f]{4}$/); // máscara ONLY
  assert.ok(!JSON.stringify(body).includes(activeKey())); // jamás la key completa
  const s1 = await state();
  assert.equal(s1.flags.rotated, true);
  assert.equal(s1.keys.current_masked, body.new_key_masked);
  assert.notEqual(s1.keys.current_masked, s1.keys.leaked_masked);
  const old = await post('/api/entries', { title: 't', body: 'b' }); // la filtrada
  assert.equal(old.status, 401);
  assert.deepEqual(await old.json(), { error: 'invalid_api_key' });
  await post('/api/lab/attack', { action: 'stop' });
  const fresh = await post('/api/entries', { title: 'nueva key', body: 'escritura legítima' }, activeKey());
  assert.equal(fresh.status, 201); // la nueva key ES legítima
  await post('/api/lab/attack', { action: 'start' }); // re-ataque: bot relee SIEMPRE el leak
  const blockedBefore = (await state()).attack.blocked;
  const s2 = await until(async () =>
    ((await state()).attack.blocked > blockedBefore ? await state() : null), 6000, 'rebotes 401 del re-ataque');
  assert.ok(s2.attack.recent.some((r) => r.status === 401)); // feed con 401 REALES
  const ev = (await timeline()).filter((e) => e.kind === 'action').pop(); // AC4
  assert.ok(ev.message.includes('401') && ev.message.includes(body.new_key_masked));
  await post('/api/lab/attack', { action: 'stop' });
});

test('AC3+NFR-5 rate limit default 10/10s: 25 en ráfaga → EXACTAMENTE 10×2xx y 15×429 con Retry-After', async (t) => {
  const { post, fw, state } = await withServer(t);
  const on = await fw('rate-limit', { enabled: true });
  assert.equal(on.status, 200);
  assert.deepEqual(await on.json(), { ratelimit: true, max: 10, window_ms: 10000 });
  const codes = [];
  for (let i = 0; i < 25; i++) {
    const r = await post('/api/entries', { title: 'burst', body: 'nfr-5' });
    if (r.status === 429) assert.ok(Number(r.headers.get('retry-after')) >= 1);
    codes.push(r.status);
  }
  assert.equal(codes.filter((c) => c >= 200 && c < 300).length, 10); // exacto (NFR-5)
  assert.equal(codes.filter((c) => c === 429).length, 15);
  assert.equal((await state()).flags.ratelimit, true);
});

test('AC3 params custom + bot estrangulado: 429 domina el feed, throughput acotado al límite', async (t) => {
  const { post, fw, state, timeline, until } = await withServer(t);
  const on = await fw('rate-limit', { enabled: true, max: 3, window_ms: 60000 });
  assert.deepEqual(await on.json(), { ratelimit: true, max: 3, window_ms: 60000 });
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await post('/api/entries', { title: 'x', body: 'y' })).status);
  assert.equal(codes.filter((c) => c === 201).length, 3); // solo max pasa por ventana
  assert.equal(codes.filter((c) => c === 429).length, 3);
  await post('/api/lab/attack', { action: 'start' }); // presupuesto de la ventana ya agotado
  const s = await until(async () =>
    ((await state()).attack.recent.filter((r) => r.status === 429).length >= 5 ? await state() : null),
    8000, '429 en feed');
  assert.ok(s.attack.recent.length >= 5 && s.attack.recent.every((r) => r.status === 429)); // acotado
  const ev = (await timeline()).filter((e) => e.kind === 'action').pop(); // AC4
  assert.ok(ev.message.includes('429'));
  await post('/api/lab/attack', { action: 'stop' });
});

test('Combinados en cualquier orden: kill switch sobre la key filtrada tras rotar → 403; flags íntegros', async (t) => {
  const { post, fw, state, activeKey } = await withServer(t);
  await fw('rotate-key', {});
  await fw('kill-switch', { enabled: true }); // actúa sobre la COMPROMETIDA (ahora disabled)
  const r = await post('/api/entries', { title: 't', body: 'b' });
  assert.equal(r.status, 403); // disabled pisa a revoked
  const ok = await post('/api/entries', { title: 't', body: 'b' }, activeKey()); // la nueva sigue viva
  assert.equal(ok.status, 201);
  await fw('rate-limit', { enabled: true, max: 1000, window_ms: 1000 }); // borde superior válido
  const s = await state();
  assert.deepEqual( // contrato §2.4: el estado refleja las 3 flags (hardening es S05)
    { killswitch: s.flags.killswitch, ratelimit: s.flags.ratelimit, rotated: s.flags.rotated },
    { killswitch: true, ratelimit: true, rotated: true });
});

test('Validación 400 en los tres endpoints (frontera §2.4) y bordes de rango aceptados', async (t) => {
  const { fw } = await withServer(t);
  const badBodies = [
    ['kill-switch', { enabled: 'true' }], ['kill-switch', {}], ['kill-switch', { enabled: 1 }],
    ['rotate-key', { extra: 1 }], ['rotate-key', 'x'], ['rotate-key', []],
    ['rate-limit', {}], ['rate-limit', { enabled: false }],
    ['rate-limit', { enabled: true, max: 0 }], ['rate-limit', { enabled: true, max: 1001 }],
    ['rate-limit', { enabled: true, max: '10' }], ['rate-limit', { enabled: true, max: 10.5 }],
    ['rate-limit', { enabled: true, window_ms: 999 }], ['rate-limit', { enabled: true, window_ms: 600001 }],
  ];
  for (const [name, body] of badBodies) {
    const res = await fw(name, body);
    assert.equal(res.status, 400, `${name} ${JSON.stringify(body)}`);
    assert.equal((await res.json()).error, 'invalid_request');
  }
  for (const body of [ // bordes del rango: válidos
    { enabled: true, max: 1, window_ms: 1000 }, { enabled: true, max: 1000, window_ms: 600000 }]) {
    assert.equal((await fw('rate-limit', body)).status, 200);
  }
});