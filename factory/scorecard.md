# Scorecard — Reviews G2 (MVP V0) + G3 (V1/V2)

Fecha: 2026-11-15 · Veredictos QA: **SHIP** (V0) · **SHIP** (V1) · V2 build verified (QA de incremento pendiente si se pide)
Negocio: **G2 aprobado** (demo en vivo) · **G3: V1 con ajustes → aplicados** (rendición del atacante + escenarios finitos) · **V2 aprobada** · **Publicación pública aprobada**

## Entregas
- Historias: **8/8** (H-01..H-08) · Nodos N-0001..N-0008: **verified**
- Slices: S01..S06 (V0) + S07 (CI+pub) + S08 (V1) + S09a/S09b (V2, split anti-monster) + rework QA V0 + rework QA V1 + fix feedback G3
- Publicado: **github.com/fedesauzzadev/breachlab** (público, CI en cada push)

## AC
- 8/8 historias con AC completas auditadas (V0/V1 por QA adversarial; V2 por dev con evidencia + suite)

## Tests
- **52/52 verdes** · cobertura ~98% · p95 16–23 ms · walkthrough 5 actos ~15 s (rendición del atacante incluida)

## QA
- V0: 0 crit / 0 high / 2 med resueltos / 3 low abiertos (L-4 L-5 L-6)
- V1: 0 crit / 2 med resueltos (M-3 race TOCTOU con test de socket crudo, M-4 docs) / L-7 resuelto / L-8 L-9 abiertos
- V2: **0 crit / 0 high** (`factory/qa-report-v2.md`, 2026-11-15) — fuzz 69 checks, traversal /leak/ seguro, export gigante OK · nuevos menores L-10 (escape `|` en export markdown) y L-11 (respuesta de switch concurrente)
- Rounds de rework: 2 + 1 fix de feedback directo del Negocio

## Bloqueos
- 0 escalados · 1 sesión muerta por usage limit (recuperada) · L-03 (DB compartida demo/smoke) resuelto estructuralmente con BREACHLAB_DB

## Riesgo residual
- Verificación de cierre de deuda (2026-11-15): browser real verificado (brain/evidence/browser-e2e.txt: clicks → detección → rendición renderizados) · CI 3-OS verde (run 43748655542: Linux/macOS/Windows) · QA formal V2 SHIP (factory/qa-report-v2.md)
- Deuda menor declarada: L-4 L-5 L-6 L-8 L-9 L-10 L-11 (ninguna toca AC; L-10/L-11 del delta V2)

## Estado final
Roadmap V0/V1/V2 completo, publicado y verificado en 3 OS + browser real. Cierre de proyecto: 2026-11-15.

