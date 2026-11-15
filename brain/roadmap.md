# Roadmap

> Vertical slices: each one works end-to-end before the next starts.
> Fuente de valor/dependencias: `factory/roadmap.md` (V0/V1/V2 del PO, intacto) y `factory/backlog.md` (H-01..H-08).
> Partición ejecutiva del TL (límites brain ≤300 líneas/8 archivos por slice): los slice-1/slice-2 del PO se ejecutan como S01..S04 y S05..S06. Detalle: `factory/plan.md` §4.

## Current slice
S09 — V2: serie de labs + export de evidencia (N-0007, N-0008). V1 completa (S08 done).

## Slice backlog
| # | Slice | Depends on | Status | Nodes | Cierra |
|---|-------|------------|--------|-------|--------|
| S01 | Sandbox vivo: API loopback + estado normal + leak servido | — | done ✓ | N-0001 (parte 1) | — |
| S02 | Panel del defensor + READMEs + gate de secrets | S01 | done ✓ | N-0001 (cierre) | N-0001 |
| S03 | Modo ataque + detección por umbral | S02 | done ✓ | N-0002 | N-0002 |
| S04 | Matafuegos: kill switch · rotación · rate limit | S03 | done ✓ | N-0003 | N-0003 |
| S05 | Hardening: hash + scopes + audit log + re-ataque rebota | S04 | done ✓ | N-0004 (AC1-3, AC5) | — |
| S06 | Postmortem EN + regresión e2e + DoD vendible | S05 | done ✓ | N-0004 (AC4) | N-0004, MVP/V0 |
| S07 | CI GitHub Actions + identidad git (gh) + publicación prep (D-0005) | S06 | done ✓ | — | — |
| S08 | V1: modo guiado + reinicio + escenario scope | S07 | done ✓ | N-0005, N-0006 | N-0005, N-0006, V1 |
| S09 | V2: serie de labs + export de evidencia | S08 | planned | N-0007, N-0008 | V2 |

> Mapping V0/V1/V2 del PO: V0 = S01..S06 ✓ · V1 = S08 (H-05, H-06) ✓ · V2 = S09 (H-07, H-08). S07 es incremento de infra ordenado en G2.

## Done
- S01..S06 + rework QA — MVP V0 completo, QA SHIP, G2 aprobado (2026-11-15).
- S08 — V1 completa (2026-11-15): modo guiado (milestones automáticos), reinicio del incidente sin restart, escenario 2 key-sin-scope. Suite 42/42, gitleaks 0, evidencia brain/evidence/S08-v1-narracion.txt.
