# Brain Index

> Entry map. Always read this first. Keep under 150 lines — if it grows, summarize or split.

## Project at a glance
BreachLab: lab interactivo 100% local para porfolio personal — representa un incidente real de API key filtrada (ataque → detección → matafuegos → hardening) y su mitigación. Spec: `factory/spec.md`.

## Active slice
S05 "Hardening" (N-0004 parte A) — **próximo a construir**. S04 (2026-11-14) implementó N-0003 completo: middleware fixed-window por key (ratelimit.js, defaults 10/10s, montado primero en la cadena §2.1), kill switch → key del leak `disabled` → 403 key_disabled, rotación → vieja `revoked` → 401 + nueva `sk_breachlab_demo_ROTATED_*` (solo máscara visible), tres botones en el panel con indicadores y key vigente, evento `action` por matafuego y acto 4 (contained) con detección previa. 24/24 tests verde (NFR-5 exacto: 25 ráfaga → 10×2xx + 15×429 + Retry-After), evidencia funcional + gitleaks 0 en `brain/evidence/S04-matafuegos.txt`. N-0003 `implemented` a la espera de verificación independiente — **cierra slice-1 del PO (N-0001..N-0003)**. S05: hash sha256 + scope write:entries + audit log + re-ataque → edits en apikey/lab/labroutes/panel + test/hardening.test.js. Plan técnico: `factory/plan.md` (G1 cerrado). Ejecución MVP: S01..S06 (S05..S06 = slice-2 del PO).

## Nodes
| ID | Title | Type | Size | Status | Key links |
|----|-------|------|------|--------|-----------|
| N-0001 | H-01 Lab base: API vulnerable + panel con timeline en estado normal | feature | M | implemented (S01+S02: TODAS las AC cubiertas; falta verificación independiente) | H-01 · base de N-0002 · `server.js`/`src/lab.js`/`public/*`/READMEs/`.gitleaks.toml` |
| N-0002 | H-02 Modo ataque: bot con la key filtrada llena la DB | feature | M | implemented (S03: TODAS las AC cubiertas + tests 18/18 + evidencia funcional/aislamiento; falta verificación independiente) | H-02 · `src/apikey.js`·`src/attacker.js`·`src/entries.js`·`src/labroutes.js`·`public/panel.js` |
| N-0003 | H-03 Matafuegos: kill switch, rotación de key, rate limit | feature | M | implemented (S04: TODAS las AC cubiertas + tests 24/24 + evidencia funcional/secrets; falta verificación independiente) | H-03 · `src/ratelimit.js`·`src/lab.js -> killSwitch/rotateKey`·`src/apikey.js -> apiKeyAuth`·`src/labroutes.js`·`public/panel.js` |
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
