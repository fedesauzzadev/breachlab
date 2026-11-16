'use strict';
// S05 — Hardening (N-0004 parte A): migración plain→sha256 en DB (AC1) · scope 403 /
// revocada 401 (AC2) · audit log con hora, key enmascarada, endpoint y motivo (AC3) ·
// re-ataque 100% rebotado con 0 basura nueva y panel endurecido (AC5).
// AC4 (postmortem EN) queda para S06.
const test = require('node:test');
const assert = require('node:assert/strict');
const { maskKey, sha256Hex } = require('../src/lab');
const { KEY, until, withServer } = require('./helpers');

// Wrapper fino: labpost = POST a la consola del defensor (sin key).
async function withHardening(t) {
  const ctx = await withServer(t, { key: KEY });
  const labpost = (p, body) => ctx.post(p, body, null);
  return { ...ctx, labpost };
}

test('AC1 hardening: DB pasa a sha256 (plain NULL en todas las filas), scope solo para la vigente, la legítima sigue escribiendo', async (t) => {
  const { labpost, post, state, keysInDb } = await withHardening(t);
  await labpost('/api/lab/firewall/rotate-key', {}); // la vigente pasa a ser la rotada
  const before = keysInDb(); // el plain solo existe acá: se captura antes de migrar
  const rotated = before.find((r) => r.label === 'rotated').key_plain;

  const res = await labpost('/api/lab/hardening', { enabled: true });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { hardening: true, keys_hashed: 2 });

  const after = keysInDb();
  assert.ok(after.every((r) => r.key_plain === null)); // AC1: cero texto plano en la DB
  for (const r of after) {
    assert.equal(r.key_hash, sha256Hex(before.find((b) => b.label === r.label).key_plain));
  }
  assert.equal(after.find((r) => r.label === 'rotated').scope, 'write:entries'); // solo la vigente
  assert.equal(after.find((r) => r.label === 'leaked-repo-config').scope, null); // el leak, nunca

  const ok = await post('/api/entries', { title: 'legítima', body: 'escritura post-hardening' }, rotated);
  assert.equal(ok.status, 201); // el middleware hardened compara hash y acepta
  const s = await state();
  assert.equal(s.flags.hardening, true);
  assert.equal(s.keys.storage, 'sha256');
  assert.equal(s.act, 5); // §2.5: hardened
  assert.equal(s.keys.current_masked, maskKey(rotated));
});

test('AC2 sin rotación: la key filtrada (aún active) hace POST → 403 insufficient_scope; GET sigue OK; audit con la fila', async (t) => {
  const { base, labpost, post, audit } = await withHardening(t);
  await labpost('/api/lab/hardening', { enabled: true });
  const res = await post('/api/entries', { title: 'spam', body: 'spam' }); // key del leak
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'insufficient_scope' });
  const read = await fetch(`${base}/api/entries`, { headers: { 'x-api-key': KEY } });
  assert.equal(read.status, 200); // el scope exigido es de ESCRITURA (§2.4)
  const rows = await audit();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key_masked, maskKey(KEY)); // enmascarada, idéntico al timeline (D-0004)
  assert.deepEqual(
    { method: rows[0].method, endpoint: rows[0].endpoint, status: rows[0].status, reason: rows[0].reason },
    { method: 'POST', endpoint: '/api/entries', status: 403, reason: 'insufficient_scope' });
  assert.ok(!Number.isNaN(Date.parse(rows[0].ts))); // con hora (AC3)
});

test('AC2+AC5 re-ataque tras rotate+hardening: bot con la key filtrada → 100% rebota 401, 0 basura nueva, audit fila por intento', async (t) => {
  const { labpost, post, state, audit } = await withHardening(t);
  await labpost('/api/lab/firewall/rotate-key', {});
  await labpost('/api/lab/hardening', { enabled: true });
  const before = await state();
  await post('/api/lab/attack', { action: 'start' }); // re-ataque: el bot usa SIEMPRE el leak
  const s = await until(async () => ((await audit()).length >= 3 ? await state() : null),
    8000, 'rebotes auditados');
  await post('/api/lab/attack', { action: 'stop' });
  assert.ok(s.attack.blocked > before.attack.blocked); // blocked crece con cada rebote
  assert.ok(s.attack.recent.length > 0 && s.attack.recent.every((r) => r.status === 401)); // feed 100% 401
  assert.equal(s.db.garbage, before.db.garbage); // AC5: cero crecimiento de basura
  assert.equal(s.act, 5); // AC5: el sistema sigue endurecido durante el re-ataque
  const rows = await audit();
  assert.ok(rows.length >= 3); // una fila por intento
  for (const r of rows) {
    assert.deepEqual(
      { key: r.key_masked, method: r.method, endpoint: r.endpoint, status: r.status, reason: r.reason },
      { key: maskKey(KEY), method: 'POST', endpoint: '/api/entries', status: 401, reason: 'invalid_api_key' });
    assert.ok(!Number.isNaN(Date.parse(r.ts)));
  }
});

test('AC3 tabla audit SOLO con hardening activo: rebotes previos (401/403) no dejan rastro; con hardening sí', async (t) => {
  const { lab, labpost, post, audit } = await withHardening(t);
  await labpost('/api/lab/firewall/rotate-key', {});
  assert.equal((await post('/api/entries', { title: 'x', body: 'y' })).status, 401); // vulnerable
  await labpost('/api/lab/firewall/kill-switch', { enabled: true });
  assert.equal((await post('/api/entries', { title: 'x', body: 'y' })).status, 403); // vulnerable
  assert.deepEqual(await audit(), []); // sin hardening → 0 filas (contrato §2.4)
  assert.equal(lab.db.prepare('SELECT COUNT(*) AS n FROM audit').get().n, 0);
  await labpost('/api/lab/hardening', { enabled: true });
  const rebote = await post('/api/entries', { title: 'x', body: 'y' }); // ahora sí audita
  assert.equal(rebote.status, 403); // disabled (kill switch) pisa: mismo orden de S04
  assert.equal((await audit()).length, 1);
  assert.equal((await audit())[0].reason, 'key_disabled');
});

test('AC3 GET /api/lab/audit: ids ascendentes, fila sin key presentada con máscara —, ?since= incremental', async (t) => {
  const { base, labpost, audit } = await withHardening(t);
  await labpost('/api/lab/hardening', { enabled: true });
  await fetch(`${base}/api/entries`, { method: 'POST', body: '{}' }); // sin header x-api-key
  await fetch(`${base}/api/entries`, { method: 'POST',
    headers: { 'x-api-key': 'sk_breachlab_demo_WRONG_0000' }, body: '{}' });
  const rows = await audit();
  assert.equal(rows.length, 2);
  assert.ok(rows[0].id < rows[1].id);
  assert.equal(rows[0].key_masked, '—'); // no hay key que enmascarar
  assert.deepEqual({ method: rows[0].method, endpoint: rows[0].endpoint, status: rows[0].status, reason: rows[0].reason },
    { method: 'POST', endpoint: '/api/entries', status: 401, reason: 'invalid_api_key' });
  const tail = await audit(rows[0].id); // since=<id>: solo lo posterior
  assert.deepEqual(tail.map((r) => r.id), [rows[1].id]);
});

test('rotar con hardening activo: la nueva key nace hasheada con scope y la DB sigue sin texto plano', async (t) => {
  const { labpost, post, state, keysInDb } = await withHardening(t);
  await labpost('/api/lab/hardening', { enabled: true });
  assert.equal((await labpost('/api/lab/firewall/rotate-key', {})).status, 200);
  const rows = keysInDb();
  assert.ok(rows.every((r) => r.key_plain === null && r.key_hash)); // cero plain, todas con hash
  const nueva = rows.find((r) => r.label === 'rotated');
  assert.equal(nueva.scope, 'write:entries'); // la vigente legítima
  // la key filtrada quedó REVOCADA por la rotación → 401 (D-0004), no 403 por scope
  const leak = await post('/api/entries', { title: 'x', body: 'y' });
  assert.equal(leak.status, 401);
  assert.deepEqual(await leak.json(), { error: 'invalid_api_key' });
  const s = await state();
  assert.equal(s.keys.storage, 'sha256');
  assert.match(s.keys.current_masked, /^sk_b…[0-9a-f]{4}$/);
});

test('validación 400 en POST /api/lab/hardening (frontera §2.4)', async (t) => {
  const { labpost } = await withHardening(t);
  for (const body of [{}, { enabled: false }, { enabled: 'true' }, { enabled: 1 }, 'x', []]) {
    const res = await labpost('/api/lab/hardening', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal((await res.json()).error, 'invalid_request');
  }
});
