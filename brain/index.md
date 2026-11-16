# Brain Index

> Entry map. Always read this first. Keep under 150 lines - if it grows, summarize or split.

## Project at a glance
BreachLab: lab interactivo 100% local para porfolio personal - representa un incidente real de API key filtrada (ataque, deteccion, matafuegos, hardening) y su mitigacion. Spec: factory/spec.md.

## Active slice
**DOCKER v0.4.0 DONE (2026-11-15, N-0009 verified, ADR D-0008)** - `docker compose up --build` → health exacto; netstat host durante run vivo: único listener `127.0.0.1:3000` (docker-proxy), NADA en 0.0.0.0 → D-0003 preservado por el port binding del compose. Imagen `breachlab:0.4.0` 255MB, no-root, data efímera. Suite **59/59** (2 tests nuevos: proceso real HOST=0.0.0.0 / default). Fix colateral: `PORT=0` ya no se come el 0 (falsy). CI: job `docker-build` (build only). Evidencia: `brain/evidence/docker-deploy.txt`.

**v0.4.1 DONE (2026-11-15)** - dedupe tests 21.6%→4.2% (`test/helpers.js` canónico, 11 suites migradas; debt-closure y docker mantienen setup propio por diseño) + sección Arquitectura en READMEs EN/ES. Suite 60/60, src <1% dup. Evidencia: `brain/evidence/dedupe-arch-v041.txt`. Commit pendiente de push (orquestador).
## Project history (V0+V1+V2 cerrados)
**PROYECTO COMPLETO (V0+V1+V2), PUBLICADO Y CERRADO** — https://github.com/fedesauzzadev/breachlab (público, aprobado por el Negocio en G3; CI tests+cobertura+gitleaks en cada push). Estado final: suite **52/52** · cobertura ~98% · roadmap PO agotado (8/8 historias, N-0001..N-0008 verified). Hits del cierre: fix de feedback G3 (D-0006: rendición del atacante 20 rebotes + escenarios finitos 10), rework QA V0 (a1d0e97) y V1 (d7a30da: race TOCTOU del reset), `BREACHLAB_DB` env para DB por proceso (fix estructural L-03), fix test flaky en CI lento (9c65563). Deuda menor abierta (no toca AC): L-4 L-5 L-6 L-8 L-9 L-10 (escape `|` en export) L-11 (respuesta switch concurrente). QA formal V2: **SHIP** (`factory/qa-report-v2.md`). **Debt closure v0.3.1 (2026-11-15, ADR D-0007)**: L-6 (re-encode nodos N-0001..4 + validador kit VALID), L-8 (epoch en /state + panel se rearma solo), L-9 (detector solo cuenta POST — flood GET inerte), L-10 (export escapa `\|`), L-11 (switch responde scenarioId efectivo) — CERRADOS, suite 57/57 (`brain/evidence/debt-closure-*.txt`). Restan SOLO L-4 (doc, orquestador) y L-5 (PATH gitleaks, orquestador). Verificación de cierre: browser real (evidence/browser-e2e.txt) + CI 3-OS verde (run 43748655542). Próximo trabajo = nuevo intake del Negocio. **S07 done** (2026-11-15, e0594ea→441be28): CI `.github/workflows/ci.yml` (2 jobs: test Node 24 + gitleaks-action@v3 con `GITLEAKS_CONFIG=.gitleaks.toml` — v2 roto desde 2026-09-16, ver evidence), README EN/ES pulidos para porfolio (badges comentados hasta el push), `docs/PUBLISHING.md` (guía del gate humano), evidencia `brain/evidence/S07-ci-publishing-prep.txt`. **PENDIENTE explícito**: primer run real de Actions (post-push, gate humano D-0005) y descomentar badges. Plan: factory/plan.md (G1 cerrado). Deuda menor abierta: L-4 (doc precedencia), L-5 (PATH gitleaks — workaround evidenciado en S07), L-6 (mojibake cosmético en nodos N-0002..N-0004), L-8 (timeline congelado tras reset externo sin rearmar cursores), L-9 (downgrade de acto por flood GET, pre-existing S03). **Fix G3 cerrado (2026-11-15, ADR D-0006)**: ajuste post-aprobación V1 pedido por el Negocio — escenario 2 = ráfaga finita de 10 con auto-stop + evento de cierre; bot general se rinde tras 20 rebotes consecutivos (racha resetea con 2xx — la AC1 de N-0002 queda intacta para la fase de ataque, ver nota en el nodo); panel explícito mientras todo rebota. Suite 47/47 (evidencia `brain/evidence/fix-g3-ux-suite.txt`, `fix-g3-ux-walkthrough.txt`).

## Nodes
| ID | Title | Type | Size | Status | Key links |
|----|-------|------|------|--------|-----------|
| N-0001 | H-01 Lab base: API vulnerable + panel con timeline en estado normal | feature | M | verified (2026-11-15 QA: 2 comandos reales, seed 12, leak, aislamiento, gitleaks 0) | H-01 · base de N-0002 · `server.js`/`src/lab.js`/`public/*`/READMEs/`.gitleaks.toml` |
| N-0002 | H-02 Modo ataque: bot con la key filtrada llena la DB | feature | M | verified (2026-11-15 QA: alerta exacta hit 31 t+8.5s, contadores en vivo, persistencia) | H-02 · `src/apikey.js`·`src/attacker.js`·`src/entries.js`·`src/labroutes.js`·`public/panel.js` |
| N-0003 | H-03 Matafuegos: kill switch, rotacion de key, rate limit | feature | M | verified (2026-11-15 QA: 401/403/429 exactos, NFR-5 10+15, eventos por accion) | H-03 · `src/ratelimit.js`·`src/lab.js -> killSwitch/rotateKey`·`src/apikey.js -> apiKeyAuth`·`src/labroutes.js`·`public/panel.js` |
| N-0004 | H-04 Hardening: keys hasheadas, scopes, audit log, re-ataque rebota + postmortem EN | feature | L | verified (2026-11-15 QA: sha256+scope+audit, re-ataque 0 basura, postmortem 200) | H-04 · `src/lab.js -> hardenKeys`·`src/apikey.js -> apiKeyAuth/reject`·`src/labroutes.js -> /api/lab/hardening,/api/lab/audit`·`public/panel.js`·`docs/postmortem.md`·`test/e2e.test.js` |
| N-0005 | H-05 Modo guiado + reinicio del incidente | feature | S | verified (2026-11-15 S08: milestones vía /state, reset sin restart, 42/42) | H-05 (V1 ✓) · `src/lab.js -> seed/reset`·`src/labroutes.js -> /api/lab/reset, milestones`·`src/apikey.js -> apiKeyAuth.reset`·`public/panel.js -> renderGuided` |
| N-0006 | H-06 Escenario 2: key valida sin scope | feature | S | verified (2026-11-15 S08: 403 insufficient_scope auditado, GET 200, DB limpia) | H-06 (V1 ✓) · `src/labroutes.js -> /api/lab/scenario/scopeless-key`·`src/attacker.js -> start(key)`·`public/panel.js` |
| N-0007 | H-07 Serie de labs: nuevos vectores de filtracion | feature | L | verified (2026-11-15 S09a: ciclo completo x2 vectores por test + walkthrough, 51/51) | H-07 (V2 ✓) · `src/scenarios.js`·`src/lab.js -> useScenario/leakKey`·`src/labroutes.js -> /scenarios,/scenarios/:id,scenario`·`public/leak/*`·`public/panel.js` |
| N-0008 | H-08 Export de evidencia del incidente | feature | S | verified (2026-11-15 S09b: attachment markdown, todo evento/rebote presente, 52/52) | H-08 (V2 ✓) · `src/labroutes.js -> GET /api/lab/export`·`public/panel.js -> export-btn`·`test/s09b.test.js` |
| N-0009 | Docker + docker compose (HOST env, aislamiento loopback preservado) | feature | S | verified (2026-11-15: compose up→health exacto, netstat host SOLO 127.0.0.1, 59/59) | D-0008 · `server.js -> HOST`·`Dockerfile`·`docker-compose.yml`·`.dockerignore`·`test/docker.test.js`·READMEs Docker |

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
| D-0006 | Rendicion del atacante (20 rebotes consecutivos) + escenarios finitos (rafaga 10) — feedback G3 | easy |
| D-0007 | Cierre de deuda menor V2: detector cuenta solo escrituras (L-9), rearme por epoch (L-8), export escapa pipes (L-10), switch responde efectivo (L-11) | easy |
| D-0008 | Docker: HOST env para bind 0.0.0.0 SOLO en contenedor; aislamiento D-0003 preservado por port binding 127.0.0.1:3000:3000 del compose | easy |

## Registry highlights
- `maskKey()` (src/lab.js): candidato 2/3 - ver brain/shared/registry.md antes de reusar/enmascarar keys.
