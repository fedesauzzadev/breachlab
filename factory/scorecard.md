# Scorecard — Review G2 (MVP V0)

Fecha: 2026-11-15 · Veredicto QA: **SHIP** · Negocio: **APROBADO** (vio la demo corriendo en browser)

## Entregas
- Historias entregadas / planificadas: **4/4** (H-01..H-04) · Nodos: N-0001..N-0004 **verified** (QA independiente, level full)
- Slices: S01..S06 + rework QA (1 round)

## AC
- Cumplidas / totales: **28/28** (7 por historia — auditadas por QA contra evidencia)

## Tests
- **37/37 verdes**, 0 rojas (instalación limpia `npm ci && npm test`)
- Cobertura: **97.82% líneas** (umbral 70%)
- p95 medido: **16.4 ms** GET /api/lab/state · **22.8 ms** POST /api/entries (umbral 200 ms)
- Walkthrough 5 actos: **14.5 s** (gate 300 s)

## QA
- Hallazgos: **0 critical · 0 high · 2 medium (RESUELTOS en a1d0e97) · 3 low** (L-3 resuelto; L-4 doc, L-5 PATH, L-6 cosmético — deuda menor registrada)
- Rounds de rework: 1 (3/3 hallazgos del rework cerrados, suite +1 test → 37)

## Bloqueos
- Escalados: 0 · Resueltos in-situ: 3 menores (glob tests Windows, gitleaks PATH ×2, quoting PowerShell)
- 1 sesión de build muerta por usage limit (S06) — recuperada por auditoría+re-verificación; lección L-02

## Riesgo residual
- Browser real del visitante no testeado con clicks (verificado por composición HTTP 1:1 + estructura DOM por curl). Sandbox aislado verificado por netstat+grep. Portabilidad Linux/Mac no verificada en máquina real.

## Próximo (aprobado en G2)
S07 CI + identidad + publicación prep → S08 V1 (guiado + reinicio + escenario scope) → S09 V2 (serie + export)
