'use strict';
// Docker slice — HOST env (ADR D-0008): el proceso REAL (node server.js) arranca con
// HOST=0.0.0.0 (el bind que exige el contenedor) y responde. Sin HOST, el bind default
// sigue siendo 127.0.0.1 → D-0003 intacto, cero cambio observable (AC1 del slice).
const { mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

// Spawnea node server.js como el contenedor (env + DB propia — L-03, no pisa la demo).
function startServer(t, host) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'breachlab-host-'));
  const env = { ...process.env, PORT: '0', BREACHLAB_DB: path.join(dir, 'test.db') };
  delete env.HOST; // default limpio: el proceso debe decidir solo
  if (host) env.HOST = host;
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  return child;
}

// Resuelve con la primera línea de log "[breachlab] http://HOST:PORT ..." (puerto real).
function waitForListen(child) {
  return new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const line = buf.split('\n').find((l) => l.startsWith('[breachlab] http://'));
      if (line) resolve(line);
    });
    child.on('exit', (code) => reject(new Error(`server salió antes de escuchar (code ${code})`)));
  });
}

test('HOST=0.0.0.0 (bind del contenedor): proceso real arranca y sirve /api/health', async (t) => {
  const line = await waitForListen(startServer(t, '0.0.0.0'));
  assert.ok(line.includes('http://0.0.0.0:'), `bind efectivo 0.0.0.0 — log: ${line.trim()}`);
  const port = Number.parseInt(line.match(/:(\d+)/)[1], 10);
  assert.ok(port > 0, 'PORT=0 → el log reporta el puerto efímero real');
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok', db_entries: 12, act: 1 });
});

test('sin HOST: bind default 127.0.0.1 (D-0003 intacto) y responde igual', async (t) => {
  const line = await waitForListen(startServer(t));
  assert.ok(line.includes('http://127.0.0.1:'), `bind default loopback — log: ${line.trim()}`);
  const port = Number.parseInt(line.match(/:(\d+)/)[1], 10);
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(res.status, 200);
});
