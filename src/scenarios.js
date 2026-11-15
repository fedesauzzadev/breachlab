'use strict';
// S09 (N-0007): los 3 vectores de filtración del lab como casos CONCRETOS — no un
// framework: tres literales + getters. Cada vector define su key falsa (FAKE BY DESIGN,
// prefijo sk_breachlab_demo_, allowlist de gitleaks), la URL de su evidencia (read-only)
// y su narración del acto 1. El ciclo (ataque → detección → matafuegos → hardening) es
// el motor existente: el vector solo cambia cómo "salió" la key.
// Base histórica: repo-sim/config.json (S01, ADR D-0003 §6). Los artefactos nuevos viven
// servidos al público en public/leak/ — que es exactamente el vector que narran.
const { readFileSync } = require('node:fs');
const path = require('node:path');

const repoKey = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'repo-sim', 'config.json'), 'utf8')).api_key;

const SCENARIOS = {
  // Vector base (S01..S08): config versionada en el repo simulado.
  'repo-config': {
    name: 'Base · config versionada en el repo',
    origin: 'La API key vive en texto plano en un archivo de config commiteado al repo: cualquiera con acceso de lectura tiene una credencial válida, para siempre.',
    key: repoKey,
    dbLabel: 'leaked-repo-config',
    leakUrl: '/leak/config.json',
    leakKind: 'json',
    narration: null, // la base no cambia el relato del acto 1 (tests S01..S08 intactos)
  },
  // S09 vector (a): la key impresa en un log de errores expuesto.
  'server-log': {
    name: 'Log de errores del server',
    origin: 'Un crash imprimió el entorno completo — key incluida — en el log de errores, y ese log quedó accesible desde afuera. El atacante no rompió nada: leyó el error.',
    key: 'sk_breachlab_demo_LOG_c41d7e', // FAKE BY DESIGN
    dbLabel: 'leaked-server-log',
    leakUrl: '/leak/error.log',
    leakKind: 'text',
    narration: 'Vector: la key salió impresa en un stack trace del server (dump de entorno incluido) y el log quedó expuesto — evidencia en /leak/error.log. La bomba ya está plantada.',
  },
  // S09 vector (b): la key hardcodeada en el JS servido a cada navegador.
  'frontend-bundle': {
    name: 'Bundle del frontend',
    origin: 'El frontend viejo tenía la key hardcodeada en el JavaScript que se sirve a CADA visitante: abrir DevTools era suficiente. Lo que se envía al navegador es público.',
    key: 'sk_breachlab_demo_BNDL_9f2a6b', // FAKE BY DESIGN
    dbLabel: 'leaked-frontend-bundle',
    leakUrl: '/leak/legacy-bundle.js',
    leakKind: 'js',
    narration: 'Vector: la key estaba hardcodeada en el bundle JS servido a cada navegador — evidencia en /leak/legacy-bundle.js, visible con DevTools. La bomba ya está plantada.',
  },
};

const scenarioList = () => Object.entries(SCENARIOS).map(([id, s]) => ({
  id, name: s.name, origin: s.origin, leak_url: s.leakUrl, leak_kind: s.leakKind,
}));

module.exports = { SCENARIOS, scenarioList };
