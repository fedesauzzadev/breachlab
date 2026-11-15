# Learnings — BreachLab

## L-01 — gitleaks no persiste en PATH entre sesiones
- Qué pasó: TL lo instaló vía winget (verificado); en sesiones posteriores (dev S04, dev S05, orquestador) `gitleaks` no está en PATH y `npm run scan:secrets` falla con "no se reconoce como comando".
- Intentos: correr directo (falla), reinstall winget (dev S04, funciona esa sesión), ubicar el binario.
- Resolución: invocar por ruta absoluta: `C:\Users\hp\AppData\Local\Microsoft\WinGet\Packages\Gitleaks.Gitleaks_Microsoft.Winget.Source_8wekyb3d8bbwe\gitleaks.exe` (verificado 2026-11-14: 0 findings en 195 KB).
- UPDATE 2026-11-15 (cierre deuda): el directorio de gitleaks YA ESTÁ en el PATH de usuario (lo agregó la instalación winget) — las sesiones abiertas ANTES de instalar no lo heredan, las nuevas sí. Diagnóstico correcto: "no está en PATH" era "esta sesión no lo tiene". Verificar con `gitleaks version` en sesión nueva antes de asumir reinstall.

## L-02 — Sesión de build muerta por límite de uso: commit incremental salva
- Qué pasó: la primera sesión de S06 murió por usage limit habiendo construido el slice SIN commitear ni actualizar brain; el working tree quedó con cambios no trazables.
- Intentos: re-lanzar subagent (falló por límite); al día siguiente, dev nuevo auditó el diff huérfano contra las AC.
- Resolución: auditoría + re-verificación completa desde cero (instalación limpia, suite, walkthrough) + cierre de nodo + commit. Recuperación barata SOLO porque el brain tenía el estado exacto del proyecto.
- Lección: commit incremental al terminar cada unidad de trabajo verificable, no al final del slice. Un diff huérfano sin brain habría sido rehacerlo de cero.

## L-03 — Server de demo compite con smoke tests por la DB
- Qué pasó: el server de demo del Negocio (puerto 3000) bloqueaba la DB cuando el rework S08 quiso correr smokes; un server huérfano de corrida previa hizo fallar el primer arranque.
- Intentos: arranque directo (falla por lock), localizar proceso.
- Resolución: matar el huérfano, smoke con puerto propio, demo renacida después.
- Lección: verificación funcional siempre con PORT efímero/propio; el server de demo es desechable y se reinicia al final, no se protege durante builds.
- UPDATE 2026-11-15 (post-V2): L-03 mató la demo del Negocio OTRA VEZ (smoke de S09 compartió data/breachlab.db → lock → demo murió). Fix estructural aplicado: `server.js` acepta `BREACHLAB_DB` (env) para DB propia por proceso — TODO smoke/walkthrough DEBE setear `BREACHLAB_DB` a un tmp propio. Regla fábrica: jamás correr un proceso del repo contra data/breachlab.db salvo la demo.

## L-04 — git stash/pop con autocrlf=true convierte LF→CRLF y rompe el validador del brain
- Qué pasó: durante debt-closure v0.3.1 se corrió `git stash` + `stash pop` para validar el estado de HEAD; el pop reescribió los archivos modificados con CRLF (autocrlf=true). El frontmatter de brain/nodes/*.md con `\r` hace que validate-brain.mjs reporte "acceptance_criteria empty" en nodos sanos.
- Intentos: re-correr el validador (mismo error), inspeccionar bytes (CR count > 0 confirmó la conversión).
- Resolución: normalizar los archivos afectados de vuelta a LF con un script node antes de re-validar. El commit no se ve afectado (autocrlf normaliza a LF en el blob).
- Lección: en esta máquina, jamás usar stash para comparar contra HEAD; usar `git show HEAD:<path>` a un tmp. Si un archivo del brain falla el validador con "empty", chequear CR (\r) antes que el contenido.
