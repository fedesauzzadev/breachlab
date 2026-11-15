# Learnings — BreachLab

## L-01 — gitleaks no persiste en PATH entre sesiones
- Qué pasó: TL lo instaló vía winget (verificado); en sesiones posteriores (dev S04, dev S05, orquestador) `gitleaks` no está en PATH y `npm run scan:secrets` falla con "no se reconoce como comando".
- Intentos: correr directo (falla), reinstall winget (dev S04, funciona esa sesión), ubicar el binario.
- Resolución: invocar por ruta absoluta: `C:\Users\hp\AppData\Local\Microsoft\WinGet\Packages\Gitleaks.Gitleaks_Microsoft.Winget.Source_8wekyb3d8bbwe\gitleaks.exe` (verificado 2026-11-14: 0 findings en 195 KB).
- Lección: gates que dependen de tools externas deben anotar la ruta absoluta verificada en el repo (o agregarse al PATH de usuario). El script `scan:secrets` funciona donde gitleaks esté en PATH; en esta máquina, usar la ruta absoluta si falla.
