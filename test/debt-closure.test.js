'use strict';
// Debt closure (v0.3.1, ADR D-0007): tests de los fixes L-9, L-10 y L-11 (+ lado
// servidor de L-8: epoch en /state). Cada lab corre con su propia DB en tmp (L-03).
const { mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp } = require('../server');
const { createLab, maskKey } = require('../src/lab');
const { createAttacker } = require('../src/attacker');
const { SCENARIOS } = require('../src/scenarios');

const newApp = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-debt-'));
  const lab = createLab({ file: path.join(dir, 'test.db') });
  const attacker = createAttacker({ lab });
  const server = buildApp(lab, attacker).listen(0, '127.0.0.1');
  return { lab, server, ready: new Promise((r) => server.on('listening', r)) };
};

const http = (server) => {
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    get: (p) => fetch(base + p),
    post: (p, body, headers = {}) => fetch(base + p, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body ?? {}),
    }),
  };
};

// Cuenta los "|" NO escapados de una fila markdown (los "\|" de celda no son separadores).
const unescapedPipes = (line) => (line.match(/(?<!\\)\|/g) || []).length;

test('L-9: el detector sigue disparando con escrituras (35 POST → alerta + acto 3)', async (t) => {
  const { lab, server, ready } = newApp();
  await ready;
  t.after(() => { server.close(); lab.db.close(); });
  const { get, post } = http(server);
  const key = lab.leakKey();
  for (let i = 0; i < 35; i++) {
    const res = await post('/api/entries', { title: `W-${i}`, body: `W-${i}` }, { 'x-api-key': key });
    assert.equal(res.status, 201);
  }
  const s = await (await get('/api/lab/state')).json();
  assert.equal(s.act, 3);
  const alerts = (await (await get('/api/lab/timeline')).json()).events.filter((e) => e.kind === 'alert');
  assert.equal(alerts.length, 1); // cooldown 15 s: una sola alerta
  assert.match(alerts[0].message, /anomalous volume/);
});

test('L-9: flood de 40 GETs legítimos en hardening NO degrada el acto ni dispara alerta', async (t) => {
  const { lab, server, ready } = newApp();
  await ready;
  t.after(() => { server.close(); lab.db.close(); });
  const { get, post } = http(server);
  const key = lab.leakKey();
  // Acto 5 directo: hardening migra la key a sha256 (activa, sin scope — GET no lo exige).
  assert.equal((await post('/api/lab/hardening', { enabled: true })).status, 200);
  let s = await (await get('/api/lab/state')).json();
  assert.equal(s.act, 5);
  for (let i = 0; i < 40; i++) { // pre-fix: hit 31 → alerta + acto 5→3 (repro QA V1)
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/entries`,
      { headers: { 'x-api-key': key } });
    assert.equal(res.status, 200);
  }
  s = await (await get('/api/lab/state')).json();
  assert.equal(s.act, 5); // sigue endurecido: el GET no mueve el acto
  const events = (await (await get('/api/lab/timeline')).json()).events;
  assert.equal(events.filter((e) => e.kind === 'alert').length, 0);
});

test('L-10: el export escapa "|" en las celdas — la tabla no se rompe con pipes inyectados', async (t) => {
  const { lab, server, ready } = newApp();
  await ready;
  t.after(() => { server.close(); lab.db.close(); });
  const { get, post } = http(server);
  const key = lab.leakKey();
  assert.equal((await post('/api/lab/hardening', { enabled: true })).status, 200);
  // Repro QA V2 P4: pipes en la query (→ celda endpoint) y en title/body del payload.
  const piped = await post('/api/entries?x=|FAKE|COL|CELDA|',
    { title: '|T|IT|LE|', body: '|B|O|DY|' }, { 'x-api-key': key });
  assert.equal(piped.status, 403); // sin scope → auditado con el originalUrl crudo
  // Pipes en la key presentada (→ celda key_masked).
  const fakeKey = '|AB|sk_breachlab_demo_PIPES_|CD|';
  assert.equal((await post('/api/entries', {}, { 'x-api-key': fakeKey })).status, 401);
  const md = await (await get('/api/lab/export')).text();
  // Las celdas inyectadas llegan escapadas — la fila sigue siendo UNA fila.
  assert.ok(md.includes('| POST | /api/entries?x=\\|FAKE\\|COL\\|CELDA\\| | 403 | insufficient_scope |'));
  assert.ok(md.includes(`| ${maskKey(fakeKey).replaceAll('|', '\\|')} |`));
  // Integridad estructural: timeline 5 columnas (6 pipes) · audit 7 columnas (8 pipes).
  const rows = md.split('\n').filter((l) => l.startsWith('|'));
  assert.ok(rows.length > 2);
  for (const l of rows) {
    const n = unescapedPipes(l);
    assert.ok(n === 6 || n === 8, `fila de tabla rota (${n} pipes): ${l}`);
  }
});

test('L-11: switches concurrentes — ambas respuestas nombran el vector EFECTIVO', async (t) => {
  const { lab, server, ready } = newApp();
  await ready;
  t.after(() => { server.close(); lab.db.close(); });
  const { get, post } = http(server);
  const pairs = [['repo-config', 'server-log'], ['server-log', 'frontend-bundle'],
    ['frontend-bundle', 'repo-config']];
  for (const [a, b] of pairs) {
    const [ra, rb] = await Promise.all([post(`/api/lab/scenarios/${a}`, {}), post(`/api/lab/scenarios/${b}`, {})]);
    for (const r of [ra, rb]) {
      assert.equal(r.status, 200); // sin ataque corriendo: ningún 400 esperable
      const body = await r.json();
      const winner = (await (await get('/api/lab/scenarios')).json()).current;
      // La respuesta refleja el estado final — nunca un nombre huérfano (QA V2 2.6).
      assert.equal(body.scenario, winner);
      const s = await (await get('/api/lab/state')).json();
      assert.equal(s.scenario.id, winner);
      assert.deepEqual(s.db, { legit: 12, garbage: 0 }); // seed exacto del ganador
      const keysInDb = lab.db.prepare('SELECT label FROM api_keys').all();
      assert.deepEqual(keysInDb.map((k) => k.label), [SCENARIOS[winner].dbLabel]);
      assert.equal(s.keys.leaked_masked, maskKey(SCENARIOS[winner].key));
    }
  }
});

test('L-8 (servidor): /state expone epoch y cada reset/switch la incrementa', async (t) => {
  const { lab, server, ready } = newApp();
  await ready;
  t.after(() => { server.close(); lab.db.close(); });
  const { get, post } = http(server);
  assert.equal((await (await get('/api/lab/state')).json()).epoch, 0);
  await post('/api/lab/reset', {});
  assert.equal((await (await get('/api/lab/state')).json()).epoch, 1);
  await post('/api/lab/scenarios/server-log', {});
  assert.equal((await (await get('/api/lab/state')).json()).epoch, 2);
});
