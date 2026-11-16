'use strict';
// S09b — N-0008: export de evidencia. GET /api/lab/export devuelve UN markdown legible
// (attachment) con el timeline COMPLETO, el audit log y el resumen del postmortem,
// generado server-side con el estado vivo: un tercero reconstruye la cronología del
// incidente sin correr la demo. Funciona también en acto 1 (sin incidente: audit vacío).
const test = require('node:test');
const assert = require('node:assert/strict');
const { BOT_INTERVAL_MS } = require('../src/attacker');
const { DETECTION_MAX_REQUESTS, DETECTION_WINDOW_MS } = require('../src/apikey');
const { sleep, until, withServer } = require('./helpers');

test('N-0008: export de evidencia — markdown attachment con timeline + audit + resumen del postmortem', async (t) => {
  const { base, post, getJson: get, state } = await withServer(t);

  // AC1, acto 1: export válido incluso sin incidente — audit vacío narrado, no roto.
  let res = await fetch(base + '/api/lab/export');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /^text\/markdown/);
  assert.match(res.headers.get('content-disposition') || '',
    /^attachment; filename="breachlab-evidence-[^"]+\.md"$/);
  let md = await res.text();
  assert.ok(md.includes('# BreachLab — Evidencia del incidente'));
  assert.ok(md.includes('Vector de filtración: Base'));
  assert.ok(md.includes('Sin intentos bloqueados registrados'));
  assert.ok(md.includes('FAKE BY DESIGN'));

  // Incidente real: ataque → detección → matafuegos → hardening → re-ataque auditado.
  await post('/api/lab/attack', { action: 'start' });
  await until(async () => ((await state()).act === 3 ? 1 : null),
    DETECTION_WINDOW_MS + (DETECTION_MAX_REQUESTS + 2) * BOT_INTERVAL_MS + 5000, 'detección');
  await post('/api/lab/attack', { action: 'stop' });
  await sleep(BOT_INTERVAL_MS + 150);
  await post('/api/lab/firewall/kill-switch', { enabled: true });
  await post('/api/lab/hardening', { enabled: true });
  await post('/api/lab/attack', { action: 'start' });
  await until(async () => (((await get('/api/lab/audit')).attempts.length >= 1) ? 1 : null),
    15_000, 'rebotes auditados');
  await post('/api/lab/attack', { action: 'stop' });

  res = await fetch(base + '/api/lab/export');
  md = await res.text();
  // AC2: cronología reconstruible sin correr la demo — TODO evento y TODO rebote presente.
  const events = (await get('/api/lab/timeline')).events;
  assert.ok(events.length >= 5);
  for (const e of events) assert.ok(md.includes(e.message), `evento fuera del export: ${e.message}`);
  assert.ok(md.includes(`## Timeline (${events.length} eventos)`));
  assert.ok(md.includes('Detección: anomalous volume'));
  const attempts = (await get('/api/lab/audit')).attempts;
  for (const x of attempts) {
    assert.ok(md.includes(x.key_masked) && md.includes(x.reason) && md.includes(x.endpoint));
  }
  assert.ok(md.includes(`## Audit log (${attempts.length} intentos bloqueados)`));
  // Resumen del postmortem: la sección Summary del doc real, verbatim.
  assert.ok(md.includes('## Resumen del postmortem'));
  assert.ok(md.includes('A long-lived API key was committed in plaintext'));
  // Estado vivo al export: contadores y storage reflejados.
  const s = await state();
  assert.ok(md.includes(`- Ataque: ${s.attack.requests} requests · ${s.attack.blocked} bloqueados`));
  assert.ok(md.includes('almacenamiento sha256'));
});
