# Brain Index

> Entry map. Always read this first. Keep under 150 lines - if it grows, summarize or split.

## Project at a glance
BreachLab: lab interactivo 100% local para porfolio personal - representa un incidente real de API key filtrada (ataque, deteccion, matafuegos, hardening) y su mitigacion. Spec: factory/spec.md.

## Active slice
**MVP/V0 build COMPLETO (S01..S06) + QA gate SHIP CERRADO (2026-11-15).** QA adversarial de fabrica dio **VEREDICTO SHIP** (`factory/qa-report.md`): 0 criticos, 0 altos, 2 medios (M-1: script `npm run test:coverage` del plan no existe - cobertura real medida 97.75% lineas, umbral 70% cumplido; M-2: arranque con data/breachlab.db corrupto crashea con stack crudo, sin reseed ni log claro, sin test), 4 bajos (L-3 innerHTML en panel mitigado por llhttp; L-4 precedencia rate-limit/sobre auth no documentada; L-5 gitleaks fuera de PATH - L-01; L-6 mojibake cosmetico). Medido por QA: suite 36/36 desde instalacion limpia, walkthrough 5 actos **14.5 s** (gate 300 s), deteccion hit 31 a t+8.5 s, p95 GET /api/lab/state 16.4 ms y POST /api/entries 22.8 ms, NFR-5 exacto (25 rafaga = 10x2xx + 15x429 + Retry-After 15/15), gitleaks 0 findings, npm audit 0, netstat durante ataque: solo loopback. N-0001..N-0004 = `verified` (QA independiente, evidencia brain/evidence/QA-NN.txt). Round dev recomendado NO bloqueante (~30 min): M-1 + M-2 + opcional L-3. Proximo: review G2 con el Negocio. Plan tecnico: factory/plan.md (G1 cerrado).

## Nodes
| ID | Title | Type | Size | Status | Key links |
|----|-------|------|------|--------|-----------|
| N-0001 | H-01 Lab base: API vulnerable + panel con timeline en estado normal | feature | M | verified (2026-11-15 QA: 2 comandos reales, seed 12, leak, aislamiento, gitleaks 0) | H-01 · base de N-0002 · `server.js`/`src/lab.js`/`public/*`/READMEs/`.gitleaks.toml` |
| N-0002 | H-02 Modo ataque: bot con la key filtrada llena la DB | feature | M | verified (2026-11-15 QA: alerta exacta hit 31 t+8.5s, contadores en vivo, persistencia) | H-02 · `src/apikey.js`·`src/attacker.js`·`src/entries.js`·`src/labroutes.js`·`public/panel.js` |
| N-0003 | H-03 Matafuegos: kill switch, rotacion de key, rate limit | feature | M | verified (2026-11-15 QA: 401/403/429 exactos, NFR-5 10+15, eventos por accion) | H-03 · `src/ratelimit.js`·`src/lab.js -> killSwitch/rotateKey`·`src/apikey.js -> apiKeyAuth`·`src/labroutes.js`·`public/panel.js` |
| N-0004 | H-04 Hardening: keys hasheadas, scopes, audit log, re-ataque rebota + postmortem EN | feature | L | verified (2026-11-15 QA: sha256+scope+audit, re-ataque 0 basura, postmortem 200) | H-04 · `src/lab.js -> hardenKeys`·`src/apikey.js -> apiKeyAuth/reject`·`src/labroutes.js -> /api/lab/hardening,/api/lab/audit`·`public/panel.js`·`docs/postmortem.md`·`test/e2e.test.js` |
| N-0005 | H-05 Modo guiado + reinicio del incidente | feature | S | planned | H-05 (V1) · depende N-0004 |
| N-0006 | H-06 Escenario 2: key valida sin scope | feature | S | planned | H-06 (V1) · depende N-0004 |
| N-0007 | H-07 Serie de labs: nuevos vectores de filtracion | feature | L | planned | H-07 (V2) · depende N-0005 |
| N-0008 | H-08 Export de evidencia del incidente | feature | S | planned | H-08 (V2) · depende N-0004 |

## Open risks / blockers
- R1: la demo percibida como riesgo real - sandbox + escaneo de secrets como AC (N-0001). Ver factory/spec.md seccion Riesgos.
- R2: narrativa confusa - el modo guiado (N-0005) queda V1; el MVP depende del timeline siempre visible. QA: walkthrough 14.5 s, narrativa fluida.
- Stack resuelto: D-0002 (Node 24 + Express + node:sqlite, 1 dep) + D-0003 (arquitectura sandbox) + D-0004 (semantica del incidente). Se presenta al Negocio en G2.
- Deuda post-gate (no bloquea SHIP, factory/qa-report.md): M-1 script cobertura + M-2 reseed DB corrupta (~30 min dev).

## Decisions
| ID | Titulo | Reversibilidad |
|----|--------|----------------|
| D-0001 | Supuestos del init-brain no-interactivo | easy |
| D-0002 | Stack: Node 24 + Express + node:sqlite + vanilla, sin build step | medium |
| D-0003 | Simulacion: un proceso, ataque por loopback HTTP real, aislamiento por bind | medium |
| D-0004 | Semantica observable del incidente: codigos, umbrales y numeros | easy |

## Registry highlights
- (vacio - proyecto nuevo, sin shared code todavia)
