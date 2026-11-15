# Roadmap

> Vertical slices: each one works end-to-end before the next starts.
> Fuente de valor/dependencias: `factory/roadmap.md` (V0/V1/V2 del PO, intacto) y `factory/backlog.md` (H-01..H-08).
> Partición ejecutiva del TL (límites brain ≤300 líneas/8 archivos por slice): los slice-1/slice-2 del PO se ejecutan como S01..S04 y S05..S06. Detalle: `factory/plan.md` §4.

## Current slice
S01 — "Sandbox vivo" (N-0001 parte 1). Planned: pendiente de aprobación del Negocio en G2. Stack decidido (D-0002..D-0004).

## Slice backlog
| # | Slice | Depends on | Status | Nodes | Cierra |
|---|-------|------------|--------|-------|--------|
| S01 | Sandbox vivo: API loopback + estado normal + leak servido | — | planned | N-0001 (parte 1) | — |
| S02 | Panel del defensor + READMEs + gate de secrets | S01 | planned | N-0001 (cierre) | N-0001 |
| S03 | Modo ataque + detección por umbral | S02 | planned | N-0002 | N-0002 |
| S04 | Matafuegos: kill switch · rotación · rate limit | S03 | planned | N-0003 | N-0003 (= fin slice-1 PO) |
| S05 | Hardening: hash + scopes + audit log + re-ataque rebota | S04 | planned | N-0004 (AC1-3, AC5) | — |
| S06 | Postmortem EN + regresión e2e + DoD vendible | S05 | planned | N-0004 (AC4) | N-0004, MVP/V0 |
| S07 | Narración sin fricción: modo guiado + escenario scope (V1) | S06 | planned | N-0005, N-0006 | — |
| S08 | Serie de labs + export de evidencia (V2, hipótesis) | S07 (N-0007) / S06 (N-0008) | planned | N-0007, N-0008 | — |

> Mapping V0/V1/V2 del PO (intacto): V0 = S01..S06 (H-01..H-04) · V1 = S07 (H-05, H-06) · V2 = S08 (H-07, H-08).

## Done
-
