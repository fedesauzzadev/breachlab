# Roadmap — BreachLab

Fuente: `factory/spec.md` + `factory/backlog.md`. El MVP (V0) es indivisible en valor: la historia del incidente completa. V1 y V2 son ampliaciones.

## V0 — MVP: la historia completa del incidente (H-01..H-04)

**Valor de negocio**: el entregable vendible por sí solo — un reclutador vive los 5 actos (normal → ataque → detección → matafuegos → hardening → rebote) en <5 min, con 2 comandos y cero setup. Es la pieza central del porfolio.

- Entregable: lab local (API vulnerable + panel + bot + timeline), matafuegos, hardening con re-ataque, README bilingüe + postmortem EN.
- **Dependencias**: ninguna (proyecto nuevo).
- **Riesgos**: R1 percibido como riesgo real (mitiga: sandbox + escaneo de secrets como AC), R2 narrativa confusa (mitiga: actos con nombre + timeline siempre visible; el modo guiado queda para V1).
- Slices de build: slice-1 (N-0001..N-0003: incidente en vivo hasta matafuegos) → slice-2 (N-0004: hardening + postmortem, cierre del ciclo).

## V1 — Narración sin fricción + defensa en profundidad (H-05, H-06)

**Valor de negocio**: el dueño narra en entrevistas con cero fricción (guiado + reinicio re-jugable) y la demo gana profundidad técnica (por qué los scopes importan, no solo rotar keys).

- Entregable: modo guiado paso a paso, "Reiniciar incidente", escenario "key válida sin scope" con narración de mínimo privilegio.
- **Dependencias**: V0 completo y verificado.
- **Riesgos**: R2 residual (si el guiado sale confuso empeora); scope del escenario 2 mal contado puede diluir la historia principal → se mantiene como escenario opcional, no reemplaza al principal.
- Slice: slice-3 (N-0005, N-0006).

## V2+ — Serie de labs + evidencia compartible (H-07, H-08) — hipótesis futura, sin compromiso

**Valor de negocio**: BreachLab pasa de demo única a serie de labs (nuevos vectores: key en cliente, key en logs) y la evidencia del incidente se comparte sin correr nada.

- Entregable: selector de escenarios, vector nuevo con ciclo completo, export local de evidencia.
- **Dependencias**: H-07 → V1 (selección + reinicio); H-08 → H-04 (audit log + postmortem).
- **Riesgos**: cada vector nuevo es costo de mantenimiento permanente; solo se agrega si hay demanda real (feedback de entrevistas).
- Slice: slice-4 (N-0007, N-0008).
