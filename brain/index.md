# Brain Index

> Entry map. Always read this first. Keep under 150 lines — if it grows, summarize or split.

## Project at a glance
BreachLab: lab interactivo 100% local para porfolio personal — representa un incidente real de API key filtrada (ataque → detección → matafuegos → hardening) y su mitigación. Spec: `factory/spec.md`.

## Active slice
S04 "Matafuegos" (N-0003) — **próximo a construir**. S03 (2026-11-14) implementó N-0002 completo: bot in-process 4 rps con la key del artefacto repo-sim (attacker.js), middleware x-api-key vulnerable + detector >30/10 s con cooldown 15 s (apikey.js), router /api/entries con validación estricta (entries.js), consola /api/lab/* con state/attack (labroutes.js) y panel con contadores en vivo + feed de códigos + alerta roja. 18/18 tests verde, evidencia funcional y de aislamiento en `brain/evidence/S03-attack-detection.txt`. N-0002 queda `implemented` a la espera de verificación independiente. S04: kill switch · rotación · rate limit → src/ratelimit.js + edits en lab/apikey/labroutes/panel + test/firewall.test.js. Plan técnico: `factory/plan.md` (G1 cerrado). Ejecución MVP: S01..S06 (S01..S04 = slice-1 del PO; S05..S06 = slice-2).

## Nodes
| ID | Title | Type | Size | Status | Key links |
|----|-------|------|------|--------|-----------|
| N-0001 | H-01 Lab base: API vulnerable + panel con timeline en estado normal | feature | M | implemented (S01+S02: TODAS las AC cubiertas; falta verificación independiente) | H-01 · base de N-0002 · `server.js`/`src/lab.js`/`public/*`/READMEs/`.gitleaks.toml` |
| N-0002 | H-02 Modo ataque: bot con la key filtrada llena la DB | feature | M | implemented (S03: TODAS las AC cubiertas + tests 18/18 + evidencia funcional/aislamiento; falta verificación independiente) | H-02 · `src/apikey.js`·`src/attacker.js`·`src/entries.js`·`src/labroutes.js`·`public/panel.js` |
| N-0003 | H-03 Matafuegos: kill switch, rotación de key, rate limit | feature | M | planned | H-03 · depende N-0002 |
| N-0004 | H-04 Hardening: keys hasheadas, scopes, audit log, re-ataque rebota + postmortem EN | feature | L | planned | H-04 · depende N-0003 · cierra MVP |
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
