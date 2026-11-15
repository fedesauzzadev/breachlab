# D-0005: G2 aprobado — incrementos ordenados por el Negocio

Date: 2026-11-15
Reversibility: easy

## Context
Review gate G2: el Negocio vio la demo corriendo (browser, servidor local) y aprobó el MVP V0 explícitamente ("Lo apruebo y me parece que va muy bien"). En la misma ronda ordenó incrementos nuevos.

## Decision
1. **V1 aprobado** (S07→ahora S08: modo guiado + reinicio + escenario key-sin-scope — N-0005, N-0006).
2. **CI GitHub Actions**: impuesto por el Negocio ("configuremos github actions") → se cumple como stack impuesto: workflow que corre install + tests + cobertura + secrets scan en cada push/PR.
3. **Identidad git desde el login de GitHub del Negocio** (gh CLI autenticado): user/email del perfil reemplazan el placeholder `breachlab@localhost`.
4. **Preparar publicación** (no publicar): README pulido para reclutadores + instrucciones de push; el push lo hace el Negocio con su cuenta.
5. Renumeración de roadmap: nuevo slice S07 (CI + identidad + publicación prep) se inserta antes de V1; V1 pasa a S08, V2 a S09.

## Alternatives considered
- Mantener numeración original y hacer CI "parte de V1": rechazado — CI no es valor de producto V1 y el Negocio lo pidió como ítem separado.
- Pushear directo con gh del agente: rechazado — publicación es gate humano (el Negocio decide repo público/privado y hace el push).
