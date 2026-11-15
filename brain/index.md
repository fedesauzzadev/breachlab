# Brain Index

> Entry map. Always read this first. Keep under 150 lines — if it grows, summarize or split.

## Project at a glance
BreachLab: lab interactivo 100% local para porfolio personal — representa un incidente real de API key filtrada (ataque → detección → matafuegos → hardening) y su mitigación. Spec: `factory/spec.md`.

## Active slice
S06 "Postmortem + cierre" (cierra N-0004 y el MVP) — **próximo a construir**. S05 (2026-11-14) implementó N-0004 parte A (AC1·AC2·AC3·AC5): botón "Activar hardening" → migración en DB `key_plain → sha256(key)` con plain a NULL (dump verificado: 0 filas con texto plano), scope `write:entries` SOLO para la vigente (el leak queda sin alcance → 403 insufficient_scope si no fue rotada; rotada → 401), middleware hardened compara sha256(presented) contra key_hash, tabla `audit` escrita SOLO con hardening activo (ts, key_masked, method, endpoint, status, reason) con GET /api/lab/audit?since=, re-ataque con la key filtrada 100% rebotado (19/19 401) con 0 basura nueva y fila audit por intento, acto 5 "Sistema endurecido", panel con sección Hardening + Audit log. Rotar post-hardening no reintroduce plain (key nace hasheada). 31/31 tests verde (+7 hardening), evidencia `brain/evidence/S05-hardening.txt`. N-0004 `implemented` parcial — **NO cerrado: AC4 (postmortem EN) queda para S06** junto a CHANGELOG/LICENSE/e2e 5 actos. Plan técnico: `factory/plan.md` (G1 cerrado). Ejecución MVP: S01..S06.

## Nodes
| ID | Title | Type | Size | Status | Key links |
|----|-------|------|------|--------|-----------|
| N-0001 | H-01 Lab base: API vulnerable + panel con timeline en estado normal | feature | M | implemented (S01+S02: TODAS las AC cubiertas; falta verificación independiente) | H-01 · base de N-0002 · `server.js`/`src/lab.js`/`public/*`/READMEs/`.gitleaks.toml` |
| N-0002 | H-02 Modo ataque: bot con la key filtrada llena la DB | feature | M | implemented (S03: TODAS las AC cubiertas + tests 18/18 + evidencia funcional/aislamiento; falta verificación independiente) | H-02 · `src/apikey.js`·`src/attacker.js`·`src/entries.js`·`src/labroutes.js`·`public/panel.js` |
| N-0003 | H-03 Matafuegos: kill switch, rotación de key, rate limit | feature | M | implemented (S04: TODAS las AC cubiertas + tests 24/24 + evidencia funcional/secrets; falta verificación independiente) | H-03 · `src/ratelimit.js`·`src/lab.js -> killSwitch/rotateKey`·`src/apikey.js -> apiKeyAuth`·`src/labroutes.js`·`public/panel.js` |
| N-0004 | H-04 Hardening: keys hasheadas, scopes, audit log, re-ataque rebota + postmortem EN | feature | L | implemented (S05 parte A: AC1·AC2·AC3·AC5 cubiertas + tests 31/31 + evidencia; AC4 postmortem → S06; falta verificación independiente) | H-04 · `src/lab.js -> hardenKeys`·`src/apikey.js -> apiKeyAuth/reject`·`src/labroutes.js -> /api/lab/hardening,/api/lab/audit`·`public/panel.js` |
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
