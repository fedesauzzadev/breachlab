# Learnings — BreachLab

## L-01 — gitleaks no persiste en PATH entre sesiones
- Qué pasó: TL lo instaló vía winget (verificado); en sesiones posteriores (dev S04, dev S05, orquestador) `gitleaks` no está en PATH y `npm run scan:secrets` falla con "no se reconoce como comando".
- Intentos: correr directo (falla), reinstall winget (dev S04, funciona esa sesión), ubicar el binario.
- Resolución: invocar por ruta absoluta: `C:\Users\hp\AppData\Local\Microsoft\WinGet\Packages\Gitleaks.Gitleaks_Microsoft.Winget.Source_8wekyb3d8bbwe\gitleaks.exe` (verificado 2026-11-14: 0 findings en 195 KB).
- Lección: gates que dependen de tools externas deben anotar la ruta absoluta verificada en el repo (o agregarse al PATH de usuario). El script `scan:secrets` funciona donde gitleaks esté en PATH; en esta máquina, usar la ruta absoluta si falla.

## L-02 — Sesión de build muerta por límite de uso: commit incremental salva
- Qué pasó: la primera sesión de S06 murió por usage limit habiendo construido el slice SIN commitear ni actualizar brain; el working tree quedó con cambios no trazables.
- Intentos: re-lanzar subagent (falló por límite); al día siguiente, dev nuevo auditó el diff huérfano contra las AC.
- Resolución: auditoría + re-verificación completa desde cero (instalación limpia, suite, walkthrough) + cierre de nodo + commit. Recuperación barata SOLO porque el brain tenía el estado exacto del proyecto.
- Lección: commit incremental al terminar cada unidad de trabajo verificable, no al final del slice. Un diff huérfano sin brain habría sido rehacerlo de cero.
