# Brain Index

> Entry map. Always read this first. Keep under 150 lines — if it grows, summarize or split.

## Project at a glance
BreachLab: lab interactivo 100% local para porfolio personal — representa un incidente real de API key filtrada (ataque → detección → matafuegos → hardening) y su mitigación. Spec: `factory/spec.md`.

## Active slice
S01 "Sandbox vivo" (N-0001 parte 1) — **implemented** (2026-11-14): API loopback viva (health, entries c/key, timeline, leak servido) + seed 12 legit + 8/8 tests verdes. Evidencia: `brain/evidence/S01-*.txt`. Falta verificación independiente. S02 cierra N-0001 (panel + READMEs + gitleaks). Plan técnico: `factory/plan.md` (G1 cerrado). Ejecución MVP: S01..S06 (S01..S04 = slice-1 del PO; S05..S06 = slice-2).

## Nodes
| ID | Title | Type | Size | Status | Key links |
|----|-------|------|------|--------|-----------|
| N-0001 | H-01 Lab base: API vulnerable + panel con timeline en estado normal | feature | M | implemented (S01; S02 cierra) | H-01 · base de N-0002 · `server.js`/`src/lab.js`/`test/lab.test.js` |
| N-0002 | H-02 Modo ataque: bot con la key filtrada llena la DB | feature | M | planned | H-02 · depende N-0001 |
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
