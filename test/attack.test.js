'use strict';
// S03 — Modo ataque + detección (N-0002): bot con la key filtrada, validación estricta
// de frontera, umbral >30/10 s → alerta critical, stop → basura persistida.
// La key usada sale del ARTEFACTO del leak, no de una constante duplicada.
const { readFileSync, mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../server');
const { createLab, maskKey, SEED_LEGIT_ENTRIES } = require('../src/lab');
const { createAttacker } = require('../src/attacker');

const leak = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'repo-sim', 'config.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withServer(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-'));
  const lab = createLab({ file: path.join(dir, 'test.db') });
  const attacker = createAttacker({ lab });
  const server = buildApp(lab, attacker).listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  attacker.setPort(server.address().port); // efímero: el host sigue siendo 127.0.0.1
  t.after(() => { attacker.stop(); server.close(); lab.db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body, key = leak.api_key) => fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const state = async () => (await fetch(`${base}/api/lab/state`)).json();
  const timeline = async () => (await (await fetch(`${base}/api/lab/timeline`)).json()).events;
  return { base, lab, attacker, post, state, timeline };
}

async function until(fn, timeoutMs, what) {
  const end = Date.now() + timeoutMs;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(100);
  }
  assert.ok(false, `timeout esperando ${what}`);
}

test('401: POST /api/entries sin key o key mala → invalid_api_key', async (t) => {
  const { base } = await withServer(t);
  for (const headers of [{}, { 'x-api-key': 'sk_breachlab_demo_WRONG_0000' }]) {
    const res = await fetch(`${base}/api/entries`, { method: 'POST', headers, body: '{}' });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'invalid_api_key' });
  }
});

test('400: validación estricta — campos extra, fuera de rango, tipos, JSON malformado', async (t) => {
  const { post } = await withServer(t);
  const bad = [
    {}, // faltan campos
    { title: 'x' }, // falta body
    { title: 'x', body: 'y', extra: 1 }, // campo extra (§2.4: sin campos extra)
    { title: '', body: 'y' }, // title vacío
    { title: 'x'.repeat(81), body: 'y' }, // title > 80
    { title: 'x', body: 'y'.repeat(281) }, // body > 280
    { title: 42, body: 'y' }, // tipo incorrecto
    { title: 'x', body: null },
    ['array'], // no-objeto
    '{"title":"x","body":"y"', // JSON malformado → parse error → 400
    'texto plano', // content-type json + body inválido
  ];
  for (const b of bad) {
    const res = await post('/api/entries', b);
    assert.equal(res.status, 400, `debería ser 400 para ${JSON.stringify(b)}`);
    const body = await res.json();
    assert.equal(body.error, 'invalid_request');
    assert.ok(typeof body.details === 'string' && body.details.length > 0);
    assert.ok(!JSON.stringify(body).includes('at ')); // sin stack (NFR-4)
  }
});

test('Propiedad (semilla fija): POST es 201 sii title 1..80 y body 1..280', async (t) => {
  const { post } = await withServer(t);
  let seed = 987654321; // LCG determinista: misma corrida siempre
  const rnd = (n) => Math.floor((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 * n);
  for (let i = 0; i < 40; i++) {
    const titleLen = rnd(90);
    const bodyLen = rnd(320);
    const valid = titleLen >= 1 && titleLen <= 80 && bodyLen >= 1 && bodyLen <= 280;
    const res = await post('/api/entries', { title: 'a'.repeat(titleLen), body: 'b'.repeat(bodyLen) });
    assert.equal(res.status, valid ? 201 : 400, `title=${titleLen} body=${bodyLen}`);
  }
});

test('201: POST válido sin ataque → {id}, kind legit, visible en GET', async (t) => {
  const { base, post } = await withServer(t);
  const res = await post('/api/entries', { title: 'Escritura legítima', body: 'Un usuario real crea un registro vía API.' });
  assert.equal(res.status, 201);
  const { id } = await res.json();
  assert.equal(typeof id, 'number');
  const list = await (await fetch(`${base}/api/entries`, { headers: { 'x-api-key': leak.api_key } })).json();
  assert.equal(list.count, SEED_LEGIT_ENTRIES + 1);
  const found = list.entries.find((e) => e.id === id);
  assert.equal(found.kind, 'legit'); // fuera de ataque: escritura legítima
});

test('AC1: attack start → 202, acto 2, bot dispara requests reales y escribe basura', async (t) => {
  const { post, state, lab } = await withServer(t);
  const res = await post('/api/lab/attack', { action: 'start' });
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { running: true });
  const s = await until(async () => ((await state()).attack.requests >= 3 ? await state() : null),
    5000, 'requests del bot');
  assert.equal(s.act, 2); // acto 2: ataque corriendo SIN alerta aún
  assert.equal(s.attack.blocked, 0); // sin matafuegos todo pasa (S03)
  assert.ok(s.db.garbage >= 1); // la basura entra de verdad
  assert.equal(s.db.legit, SEED_LEGIT_ENTRIES); // el seed queda intacto
  const spam = lab.listEntries().filter((e) => e.kind === 'garbage');
  assert.ok(spam.length >= 1 && spam.every((e) => /^SPAM-\d+$/.test(e.title))); // payload §2.5
  await post('/api/lab/attack', { action: 'stop' });
});

test('AC3: umbral >30/10 s → alerta critical con hora, key enmascarada y motivo; cooldown 15 s', async (t) => {
  const { post, base, state, timeline } = await withServer(t);
  await post('/api/lab/attack', { action: 'start' });
  // Acelera el cruce del umbral: 32 requests autenticados de la MISMA key (el bot suma el resto).
  for (let i = 0; i < 32; i++) {
    await fetch(`${base}/api/entries`, { headers: { 'x-api-key': leak.api_key } });
  }
  const alert = await until(async () => (await timeline()).find((e) => e.kind === 'alert') || null,
    5000, 'evento alert');
  assert.equal(alert.severity, 'critical');
  assert.ok(!Number.isNaN(Date.parse(alert.ts))); // con hora
  assert.ok(alert.message.includes(maskKey(leak.api_key))); // key enmascarada (D-0004)
  assert.ok(!alert.message.includes(leak.api_key)); // nunca la key completa
  assert.match(alert.message, /anomalous volume/i); // motivo fijo (§2.5)
  assert.equal((await state()).act, 3); // acto 3: detectado
  assert.equal((await (await fetch(`${base}/api/health`)).json()).act, 3);
  // Cooldown: otra ráfaga inmediata NO genera segunda alerta (riesgo T4)
  for (let i = 0; i < 32; i++) {
    await fetch(`${base}/api/entries`, { headers: { 'x-api-key': leak.api_key } });
  }
  await sleep(300);
  assert.equal((await timeline()).filter((e) => e.kind === 'alert').length, 1);
  await post('/api/lab/attack', { action: 'stop' });
});

test('AC4: stop → bot se detiene y la basura queda persistida en la DB (estado degradado)', async (t) => {
  const { post, state, lab } = await withServer(t);
  await post('/api/lab/attack', { action: 'start' });
  await until(async () => ((await state()).db.garbage >= 2 ? 1 : null), 5000, 'basura');
  const res = await post('/api/lab/attack', { action: 'stop' });
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { running: false });
  await sleep(400); // drena requests en vuelo
  const before = (await state()).db.garbage;
  assert.ok(before >= 2);
  await sleep(800); // el bot está muerto: nada nuevo entra
  const s = await state();
  assert.equal(s.attack.running, false);
  assert.equal(s.db.garbage, before); // persistido, sin crecimiento
  const inDb = lab.db.prepare("SELECT COUNT(*) AS n FROM entries WHERE kind = 'garbage'").get().n;
  assert.equal(inDb, before); // está en la DB real (AC4)
});

test('Contrato §2.4: /api/lab/state expone act, attack, db, flags, keys y thresholds', async (t) => {
  const { state } = await withServer(t);
  const s = await state();
  assert.equal(s.act, 1);
  assert.deepEqual(s.attack, { running: false, requests: 0, blocked: 0, recent: [] });
  assert.deepEqual(s.db, { legit: SEED_LEGIT_ENTRIES, garbage: 0 });
  assert.deepEqual(s.flags, { killswitch: false, ratelimit: false, hardening: false, rotated: false });
  assert.equal(s.keys.leaked_masked, maskKey(leak.api_key));
  assert.equal(s.keys.current_masked, maskKey(leak.api_key)); // S03: leaked === vigente
  assert.equal(s.keys.storage, 'plaintext'); // mala práctica visible
  assert.deepEqual(s.thresholds, {
    detection_max_requests: 30, detection_window_ms: 10000,
    alert_cooldown_ms: 15000, bot_interval_ms: 250,
  });
});

test('/api/lab/attack con action inválida → 400 invalid_request', async (t) => {
  const { post } = await withServer(t);
  for (const b of [{ action: 'nuke' }, {}, null, 'start']) {
    const res = await post('/api/lab/attack', b);
    assert.equal(res.status, 400, `debería ser 400 para ${JSON.stringify(b)}`);
    assert.equal((await res.json()).error, 'invalid_request');
  }
});
