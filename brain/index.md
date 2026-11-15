# Brain Index

> Entry map. Always read this first. Keep under 150 lines - if it grows, summarize or split.

## Project at a glance
BreachLab: lab interactivo 100% local para porfolio personal - representa un incidente real de API key filtrada (ataque, deteccion, matafuegos, hardening) y su mitigacion. Spec: factory/spec.md.

## Active slice
**S09 — V2: serie de labs + export de evidencia (N-0007, N-0008)** — planned. Contexto: **V1 completa y verificada** (S08 done, 2026-11-15): modo guiado con hitos automáticos vía `/api/lab/state` (`milestones`), `POST /api/lab/reset` (reinicio del incidente sin reiniciar el proceso) y escenario 2 "key válida sin scope" (`POST /api/lab/scenario/scopeless-key`). **QA V1 veredicto SHIP** (`factory/qa-report-v1.md`, 0 críticos) + **rework post-QA cerrado** (2026-11-15, d7a30da): M-3 TOCTOU del reset → epoch check (409 stale_write, race imposible), M-4 DoD → v0.2.0 + CHANGELOG + READMEs, L-7 → content-type exigido en /api/lab; suite **43/43** (evidencia `brain/evidence/rework-QA-v1-race.txt`, `rework-QA-v1-suite.txt`). MVP V0 **aprobado por el Negocio en G2** (2026-11-15); QA gate SHIP cerrado (`factory/qa-report.md`, `factory/scorecard.md`) con rework a1d0e97 (M-1 cobertura 97.82%, M-2 reseed DB corrupta, L-3). **S07 done** (2026-11-15, e0594ea→441be28): CI `.github/workflows/ci.yml` (2 jobs: test Node 24 + gitleaks-action@v3 con `GITLEAKS_CONFIG=.gitleaks.toml` — v2 roto desde 2026-09-16, ver evidence), README EN/ES pulidos para porfolio (badges comentados hasta el push), `docs/PUBLISHING.md` (guía del gate humano), evidencia `brain/evidence/S07-ci-publishing-prep.txt`. **PENDIENTE explícito**: primer run real de Actions (post-push, gate humano D-0005) y descomentar badges. Plan: factory/plan.md (G1 cerrado). Deuda menor abierta: L-4 (doc precedencia), L-5 (PATH gitleaks — workaround evidenciado en S07), L-6 (mojibake cosmético en nodos N-0002..N-0004), L-8 (timeline congelado tras reset externo sin rearmar cursores), L-9 (downgrade de acto por flood GET, pre-existing S03).

## Nodes
| ID | Title | Type | Size | Status | Key links |
|----|-------|------|------|--------|-----------|
| N-0001 | H-01 Lab base: API vulnerable + panel con timeline en estado normal | feature | M | verified (2026-11-15 QA: 2 comandos reales, seed 12, leak, aislamiento, gitleaks 0) | H-01 · base de N-0002 · `server.js`/`src/lab.js`/`public/*`/READMEs/`.gitleaks.toml` |
| N-0002 | H-02 Modo ataque: bot con la key filtrada llena la DB | feature | M | verified (2026-11-15 QA: alerta exacta hit 31 t+8.5s, contadores en vivo, persistencia) | H-02 · `src/apikey.js`·`src/attacker.js`·`src/entries.js`·`src/labroutes.js`·`public/panel.js` |
| N-0003 | H-03 Matafuegos: kill switch, rotacion de key, rate limit | feature | M | verified (2026-11-15 QA: 401/403/429 exactos, NFR-5 10+15, eventos por accion) | H-03 · `src/ratelimit.js`·`src/lab.js -> killSwitch/rotateKey`·`src/apikey.js -> apiKeyAuth`·`src/labroutes.js`·`public/panel.js` |
| N-0004 | H-04 Hardening: keys hasheadas, scopes, audit log, re-ataque rebota + postmortem EN | feature | L | verified (2026-11-15 QA: sha256+scope+audit, re-ataque 0 basura, postmortem 200) | H-04 · `src/lab.js -> hardenKeys`·`src/apikey.js -> apiKeyAuth/reject`·`src/labroutes.js -> /api/lab/hardening,/api/lab/audit`·`public/panel.js`·`docs/postmortem.md`·`test/e2e.test.js` |
| N-0005 | H-05 Modo guiado + reinicio del incidente | feature | S | verified (2026-11-15 S08: milestones vía /state, reset sin restart, 42/42) | H-05 (V1 ✓) · `src/lab.js -> seed/reset`·`src/labroutes.js -> /api/lab/reset, milestones`·`src/apikey.js -> apiKeyAuth.reset`·`public/panel.js -> renderGuided` |
| N-0006 | H-06 Escenario 2: key valida sin scope | feature | S | verified (2026-11-15 S08: 403 insufficient_scope auditado, GET 200, DB limpia) | H-06 (V1 ✓) · `src/labroutes.js -> /api/lab/scenario/scopeless-key`·`src/attacker.js -> start(key)`·`public/panel.js` |
| N-0007 | H-07 Serie de labs: nuevos vectores de filtracion | feature | L | planned | H-07 (V2) · depende N-0005 |
| N-0008 | H-08 Export de evidencia del incidente | feature | S | planned | H-08 (V2) · depende N-0004 |

## Open risks / blockers
- R1: la demo percibida como riesgo real - sandbox + escaneo de secrets como AC (N-0001). Ver factory/spec.md seccion Riesgos.
- R2: narrativa confusa - RESUELTO en V1: modo guiado con hitos automáticos (N-0005) + reinicio del incidente. QA V0: walkthrough 14.5 s, narrativa fluida.
- Stack resuelto: D-0002 (Node 24 + Express + node:sqlite, 1 dep) + D-0003 (arquitectura sandbox) + D-0004 (semantica del incidente). Presentado al Negocio en G2 (sin disenso, aprobado).
- Riesgo publicacion: push a GitHub es gate humano (D-0005) - el Negocio decide publico/privado y pushea con su cuenta.

## Decisions
| ID | Titulo | Reversibilidad |
|----|--------|----------------|
| D-0001 | Supuestos del init-brain no-interactivo | easy |
| D-0002 | Stack: Node 24 + Express + node:sqlite + vanilla, sin build step | medium |
| D-0003 | Simulacion: un proceso, ataque por loopback HTTP real, aislamiento por bind | medium |
| D-0004 | Semantica observable del incidente: codigos, umbrales y numeros | easy |
| D-0005 | G2 aprobado + incrementos: CI Actions, identidad gh, publicacion prep, renumeracion S07/S08/S09 | easy |

## Registry highlights
- `maskKey()` (src/lab.js): candidato 2/3 - ver brain/shared/registry.md antes de reusar/enmascarar keys.
