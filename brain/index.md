# Brain Index

> Entry map. Always read this first. Keep under 150 lines — if it grows, summarize or split.

## Project at a glance
BreachLab: lab interactivo 100% local para porfolio personal — representa un incidente real de API key filtrada (ataque → detección → matafuegos → hardening) y su mitigación. Spec: `factory/spec.md`.

## Active slice
**MVP/V0 build COMPLETO** (S01..S06, 2026-11-15). S06 "Postmortem + cierre" cerró N-0004 AC4: `docs/postmortem.md` (EN, formato profesional: Summary · Impact · Timeline 5 actos T+relativos · Root Cause · What Went Well/Wrong · Rapid Response · Long-term Fixes · Lessons Learned · nota de simulación con keys 100% falsas; números reales D-0004) servido por `GET /docs/postmortem.md`, linkeado desde panel y ambos READMEs; `test/e2e.test.js` regresión e2e de los 5 actos en un flujo (timing desde constantes importables, detección ~8 s reales, suite ~19 s); CHANGELOG 0.1.0 + LICENSE MIT + versión package.json (ya estaba). Verificación dev: `npm ci && npm test` instalación limpia → **36/36 pass**; walkthrough 5 actos contra `npm start` → 19 s (detección 8.0 s, basura congelada 30, re-ataque 0 basura nueva + audit); gitleaks 0 findings — `brain/evidence/S06-*.txt`. **Pendiente: verificación independiente (QA verifier) de N-0001..N-0004 y gate SHIP** (5 actos ≤5 min por tercero, npm audit, aislamiento). Plan técnico: `factory/plan.md` (G1 cerrado).

## Nodes
| ID | Title | Type | Size | Status | Key links |
|----|-------|------|------|--------|-----------|
| N-0001 | H-01 Lab base: API vulnerable + panel con timeline en estado normal | feature | M | implemented (S01+S02: TODAS las AC cubiertas; falta verificación independiente) | H-01 · base de N-0002 · `server.js`/`src/lab.js`/`public/*`/READMEs/`.gitleaks.toml` |
| N-0002 | H-02 Modo ataque: bot con la key filtrada llena la DB | feature | M | implemented (S03: TODAS las AC cubiertas + tests 18/18 + evidencia funcional/aislamiento; falta verificación independiente) | H-02 · `src/apikey.js`·`src/attacker.js`·`src/entries.js`·`src/labroutes.js`·`public/panel.js` |
| N-0003 | H-03 Matafuegos: kill switch, rotación de key, rate limit | feature | M | implemented (S04: TODAS las AC cubiertas + tests 24/24 + evidencia funcional/secrets; falta verificación independiente) | H-03 · `src/ratelimit.js`·`src/lab.js -> killSwitch/rotateKey`·`src/apikey.js -> apiKeyAuth`·`src/labroutes.js`·`public/panel.js` |
| N-0004 | H-04 Hardening: keys hasheadas, scopes, audit log, re-ataque rebota + postmortem EN | feature | L | implemented (S05+S06: TODAS las AC AC1..AC5 cubiertas — AC4 postmortem EN en S06 + e2e 5 actos; tests 36/36 + evidencia; falta verificación independiente) | H-04 · `src/lab.js -> hardenKeys`·`src/apikey.js -> apiKeyAuth/reject`·`src/labroutes.js -> /api/lab/hardening,/api/lab/audit`·`public/panel.js`·`docs/postmortem.md`·`test/e2e.test.js` |
| N-0005 | H-05 Modo guiado + reinicio del incidente | feature | S | planned | H-05 (V1) · depende N-0004 |
| N-0006 | H-06 Escenario 2: key válida sin scope | feature | S | planned | H-06 (V1) · depende N-0004 |
| N-0007 | H-07 Serie de labs: nuevos vectores de filtración | feature | L | planned | H-07 (V2) · depende N-0005 |
| N-0008 | H-08 Export de evidencia del incidente | feature | S | planned | H-08 (V2) · depende N-0004 |

## Open risks / blockers
- R1: la demo percibida como riesgo real → sandbox + escaneo de secrets como AC (N-0001). Ver `factory/spec.md` §Riesgos.
- R2: narrativa confusa → el modo guiado (N-0005) queda V1; el MVP depende del timeline siempre visible.
- ~~Stack sin decidir~~ → RESUELTO: D-0002 (Node 24 + Express + node:sqlite, 1 dep) + D-0003 (arquitectura sandbox) + D-0004 (semántica del incidente). Se presenta al Negocio en G2.

## Decisions
| ID | Título | Reversibilidad |
|----|--------|----------------|
| D-0001 | Supuestos del init-brain no-interactivo | easy |
| D-0002 | Stack: Node 24 + Express + node:sqlite + vanilla, sin build step | medium |
| D-0003 | Simulación: un proceso, ataque por loopback HTTP real, aislamiento por bind | medium |
| D-0004 | Semántica observable del incidente: códigos, umbrales y números | easy |

## Registry highlights
- (vacío — proyecto nuevo, sin shared code todavía)
