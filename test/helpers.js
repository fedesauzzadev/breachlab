'use strict';
// Helpers canónicos compartidos por las suites (dedupe v0.4.1): lab efímero en tmp
// (L-03) + server loopback (D-0003) + builders HTTP. Las diferencias que tenían
// las copias locales se resuelven con parámetros opcionales, sin tocar aserciones.
// La key sale del ARTEFACTO del leak (repo-sim/config.json), igual que en producto.
const { readFileSync, mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { buildApp } = require('../server');
const { createLab } = require('../src/lab');
const { createAttacker } = require('../src/attacker');

const KEY = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'repo-sim', 'config.json'), 'utf8')).api_key;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pollea fn cada 100 ms hasta que devuelva truthy; assert si vence el timeout.
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

// Server efímero bindeado EXCLUSIVAMENTE a 127.0.0.1 con DB propia en tmp y el bot
// in-process apuntando al puerto real. opts.key = default del builder post()
// (default null → POST sin x-api-key salvo key explícita en la llamada).
async function withServer(t, { key: defaultKey = null } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-'));
  const lab = createLab({ file: path.join(dir, 'test.db') });
  const attacker = createAttacker({ lab });
  const server = buildApp(lab, attacker).listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  attacker.setPort(server.address().port); // efímero: el host sigue siendo 127.0.0.1
  t.after(() => { attacker.stop(); server.close(); lab.db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body, key = defaultKey) => fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
  const get = (p, key) => fetch(base + p, { headers: key ? { 'x-api-key': key } : {} });
  const getJson = (p, key) => get(p, key).then((r) => r.json());
  const state = () => getJson('/api/lab/state');
  const timeline = async () => (await getJson('/api/lab/timeline')).events;
  const audit = async (since = 0) => (await getJson(`/api/lab/audit?since=${since}`)).attempts;
  const keysInDb = () => lab.db.prepare(
    'SELECT label, key_plain, key_hash, scope, status FROM api_keys ORDER BY id').all();
  return { base, server, lab, attacker, post, get, getJson, state, timeline, audit, keysInDb };
}

module.exports = { KEY, sleep, until, withServer };
