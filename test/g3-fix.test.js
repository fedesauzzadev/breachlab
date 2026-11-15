'use strict';
// Fix feedback G3 (ADR D-0006): el bot ya no es un loop sin fin.
// FIX-1: escenario 2 = ráfaga finita de exactamente 10 que se frena sola + evento de
// cierre en timeline. FIX-2: rendición tras 20 rebotes CONSECUTIVOS (cualquier 2xx
// reanima) — el ataque exitoso (201s) NUNCA se auto-detiene (AC1 de N-0002 intacta).
const { mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../server');
const { createLab } = require('../src/lab');
const { createAttacker, BOT_GIVEUP_STREAK, SCENARIO_BURST } = require('../src/attacker');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

assert.equal(BOT_GIVEUP_STREAK, 20); // contrato G3: los números son finales
assert.equal(SCENARIO_BURST, 10);

async function withServer(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-g3-'));
  const lab = createLab({ file: path.join(dir, 'test.db') });
  const attacker = createAttacker({ lab });
  const server = buildApp(lab, attacker).listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  attacker.setPort(server.address().port);
  t.after(() => { attacker.stop(); server.close(); lab.db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) => fetch(base + p, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const get = (p) => fetch(base + p).then((r) => r.json());
  const state = () => get('/api/lab/state');
  const events = async () => (await get('/api/lab/timeline')).events;
  const until = async (fn, ms, what) => {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(100); }
    assert.ok(false, `timeout esperando ${what}`);
  };
  return { lab, post, get, state, events, until };
}

test('FIX-1 escenario 2: ráfaga finita — exactamente 10, se frena solo, evento de cierre, 0 escrituras', async (t) => {
  const { post, get, state, events, until } = await withServer(t);
  await post('/api/lab/hardening', { enabled: true });
  const res = await post('/api/lab/scenario/scopeless-key');
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.requests_planned, SCENARIO_BURST);

  await until(async () => ((await state()).attack.running ? null : 1), 10000, 'auto-stop del escenario');
  const s = await state();
  assert.equal(s.attack.requests, SCENARIO_BURST); // exactamente 10, ni una más
  assert.equal(s.db.garbage, 0); // 0 escrituras: el 403 nunca llega al handler
  const attempts = (await get('/api/lab/audit')).attempts;
  assert.equal(attempts.length, SCENARIO_BURST); // una fila por intento
  assert.ok(attempts.every((r) => r.status === 403 && r.reason === 'insufficient_scope'));
  assert.ok((await events()).some((e) =>
    e.message === 'Escenario 2 completado · 10 intentos · 10 rechazados (403 insufficient_scope) · 0 escrituras'));

  await sleep(600); // no queda proceso corriendo: nada sigue llegando
  const after = await state();
  assert.equal(after.attack.running, false);
  assert.equal(after.attack.requests, SCENARIO_BURST);
});

test('FIX-2 rendición: 20 rebotes consecutivos frenan al bot; los 201 nunca (racha resetea con 2xx)', async (t) => {
  const { post, state, events, until } = await withServer(t);

  await t.test('ataque exitoso: >20 requests con 201 y el bot sigue corriendo (AC1 N-0002)', async () => {
    await post('/api/lab/attack', { action: 'start' });
    await until(async () => ((await state()).attack.requests > BOT_GIVEUP_STREAK + 1 ? 1 : null),
      12000, 'más de 21 requests exitosas');
    const s = await state();
    assert.equal(s.attack.running, true); // NO se auto-detiene durante el ataque
    assert.equal(s.attack.blocked, 0);
    assert.ok(s.db.garbage > 0);
    assert.ok(!(await events()).some((e) => e.message.startsWith('El atacante dejó de intentar')));
  });

  await t.test('kill switch → todo rebota → rendición con evento de timeline', async () => {
    await post('/api/lab/firewall/kill-switch', { enabled: true });
    await until(async () => ((await state()).attack.running ? null : 1), 15000, 'rendición tras rebotes');
    const s = await state();
    assert.equal(s.attack.running, false);
    assert.ok(s.attack.blocked >= BOT_GIVEUP_STREAK); // 20 seguidos como mínimo
    const giveup = (await events()).find((e) => e.message.startsWith('El atacante dejó de intentar'));
    assert.ok(giveup, 'evento de rendición en timeline');
    assert.match(giveup.message,
      /^El atacante dejó de intentar \(20 rebotes consecutivos\) · \d+ bloqueados en total$/);
  });
});
