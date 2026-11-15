'use strict';
// S06 — e2e regression of the WHOLE MVP story (plan §4 S06): the 5 acts in ONE flow
// against an ephemeral loopback server — normal → attack → detect → firewall →
// hardening → re-attack bounces. If any slice regresses, this test sees it.
// Timing: real bot at 4 req/s with real thresholds (>30 req/10 s → alert at hit 31,
// ~8 s of wall clock) — budgets derive from the importable constants, never hardcoded.
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

test('the full incident in 5 acts (e2e regression)', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-e2e-'));
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
    body: JSON.stringify(body ?? {}),
  });
  const labpost = (p, body) => post(p, body, null);
  const get = (p, key) => fetch(base + p, {
    headers: key ? { 'x-api-key': key } : {},
  }).then((r) => r.json());
  const state = () => get('/api/lab/state');
  const audit = async () => (await get('/api/lab/audit')).attempts;
  const until = async (fn, ms, what) => {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(100); }
    assert.ok(false, `timeout esperando ${what}`);
  };
  let frozen = 0; // garbage count at containment — act 5 proves it never grows again

  await t.test('act 1 — normal: seed intact, leak readable, leaked key WORKS', async () => {
    const h = await get('/api/health');
    assert.deepEqual(h, { status: 'ok', db_entries: SEED_LEGIT_ENTRIES, act: 1 });
    const { entries } = await get('/api/entries', KEY); // GET exige key (§2.4)
    assert.equal(entries.length, SEED_LEGIT_ENTRIES);
    assert.ok(entries.every((e) => e.kind === 'legit'));
    const cfg = await get('/leak/config.json'); // the "versioned" leak, world-readable
    assert.equal(cfg.api_key, KEY);
    const s = await state();
    assert.deepEqual(s.db, { legit: SEED_LEGIT_ENTRIES, garbage: 0 });
    assert.equal(s.keys.storage, 'plaintext');
    // (el GET /api/entries con KEY de arriba ya probó que la key filtrada FUNCIONA)
  });

  await t.test('acts 2→3 — attack: garbage grows, then detection (>30/10 s → critical alert)', async () => {
    const started = Date.now();
    assert.equal((await labpost('/api/lab/attack', { action: 'start' })).status, 202);
    // Budget: window + (hits+2) bot ticks + slack — real clock ≈ 8 s at 4 req/s.
    const s3 = await until(async () => ((await state()).act === 3 ? await state() : null),
      DETECTION_WINDOW_MS + (DETECTION_MAX_REQUESTS + 2) * BOT_INTERVAL_MS + 5000, 'acto 3 (detección)');
    const secs = (Date.now() - started) / 1000;
    assert.ok(secs < 20, `detección tardó ${secs.toFixed(1)} s — presupuesto excedido`);
    // El GET autenticado del acto 1 suma 1 hit al detector: la alerta dispara en el
    // POST #30 del bot y la escritura #30 puede seguir in-flight → tolerar ±1.
    assert.ok(s3.db.garbage >= DETECTION_MAX_REQUESTS - 1); // ~30 basuras reales al detectar
    assert.equal(s3.db.legit, SEED_LEGIT_ENTRIES); // legit rows untouched
    assert.equal(s3.attack.blocked, 0); // pre-containment: 100% of attacker writes SUCCEED
    assert.ok(s3.attack.recent.length > 0 && s3.attack.recent.every((r) => r.status === 201));
    const alert = (await get('/api/lab/timeline')).events.find((e) => e.kind === 'alert');
    assert.ok(alert, 'sin evento alert en el timeline');
    assert.equal(alert.severity, 'critical');
    assert.ok(alert.message.includes('anomalous volume') && alert.message.includes(maskKey(KEY)));
    assert.ok(!Number.isNaN(Date.parse(alert.ts)));
  });

  await t.test('act 4 — matafuegos: kill switch 403, rotation, rate limit 429 — garbage freezes', async () => {
    const kill = await labpost('/api/lab/firewall/kill-switch', { enabled: true });
    const rot = await labpost('/api/lab/firewall/rotate-key', {});
    const rate = await labpost('/api/lab/firewall/rate-limit', { enabled: true });
    assert.deepEqual([kill.status, rot.status, rate.status], [200, 200, 200]);
    // Direct probes right after rate-limit ON (fresh window → limiter passes → auth decides):
    const dead = await post('/api/entries', { title: 'x', body: 'y' }); // leaked key
    assert.equal(dead.status, 403); // key_disabled — kill switch
    assert.equal((await dead.json()).error, 'key_disabled');
    const unknown = await post('/api/entries', { title: 'x', body: 'y' }, 'sk_breachlab_demo_UNKNOWN_0000');
    assert.equal(unknown.status, 401); // invalid_api_key — the 401 path, live
    // Bot keeps firing: feed turns 100% non-2xx with real 429s from the limiter.
    const s4 = await until(async () => {
      const s = await state();
      return s.act === 4 && s.attack.recent.length > 0
        && s.attack.recent.every((r) => r.status !== 201 && r.status !== 200)
        && s.attack.recent.some((r) => r.status === 429) ? s : null;
    }, 12000, 'acto 4: feed sin 2xx y con 429');
    frozen = s4.db.garbage;
    assert.ok(frozen > 0);
    assert.deepEqual(s4.flags, { killswitch: true, ratelimit: true, hardening: false, rotated: true });
    assert.notEqual(s4.keys.current_masked, s4.keys.leaked_masked); // new key ≠ leaked key
  });

  await t.test('act 5 — hardening + re-attack: bounces audited, 0 new garbage, attacker gives up', async () => {
    await labpost('/api/lab/attack', { action: 'stop' });
    // The act-4 burst saturated the leaked key's limiter window: unaudited 429s would
    // dominate the re-attack. Re-applying rate limit clears the buckets (defender action,
    // BEFORE hardening so the act stays 5) — bounces reach auth, get audited, and the
    // bot gives up after 20 in a row (ADR D-0006).
    await labpost('/api/lab/firewall/rate-limit', { enabled: true });
    const hard = await labpost('/api/lab/hardening', { enabled: true });
    assert.equal(hard.status, 200);
    assert.deepEqual(await audit(), []); // act-4 rejections pre-hardening left no trace (§2.4)
    const rows = lab.db.prepare('SELECT key_plain, key_hash, scope FROM api_keys').all();
    assert.ok(rows.length >= 2 && rows.every((r) => r.key_plain === null && r.key_hash)); // cero plaintext
    assert.equal(rows.filter((r) => r.scope === 'write:entries').length, 1); // solo la vigente

    await labpost('/api/lab/attack', { action: 'start' }); // RE-ATTACK with the leaked key
    const s5 = await until(async () => {
      const s = await state();
      return !s.attack.running && (await audit()).length >= 3 ? s : null;
    }, 20000, 'rendición del re-ataque (20 rebotes consecutivos)');

    assert.equal(s5.db.garbage, frozen); // zero new garbage — the hardening proof
    assert.equal(s5.db.legit, SEED_LEGIT_ENTRIES);
    assert.equal(s5.act, 5);
    assert.equal(s5.keys.storage, 'sha256');
    assert.ok(s5.attack.recent.every((r) => [401, 403, 429].includes(r.status)));
    const giveup = (await get('/api/lab/timeline')).events
      .find((e) => e.message.startsWith('El atacante dejó de intentar'));
    assert.ok(giveup, 'evento de rendición en timeline (ADR D-0006)');
    const audited = await audit();
    assert.ok(audited.length >= 3); // a row per blocked attempt that reached auth
    for (const r of audited) {
      assert.deepEqual(
        { key: r.key_masked, endpoint: r.endpoint, status: r.status, reason: r.reason },
        { key: maskKey(KEY), endpoint: '/api/entries', status: 403, reason: 'key_disabled' });
      assert.ok(!Number.isNaN(Date.parse(r.ts)));
    }
    assert.equal((await get('/api/health')).act, 5); // system recovered, hardened
  });
});
