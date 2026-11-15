# D-0002: Stack — Node 24 + Express + node:sqlite + frontend vanilla, sin build step

Date: 2026-11-14
Reversibility: medium

## Context
El intake SUGIERE Node.js + Express + SQLite (no lo impone). La regla de fábrica: sugerido → el TL evalúa costo/velocidad/mantenibilidad y puede contraproponer. Objetivos que condicionan la elección: correr con 2 comandos en Windows + portable Linux/Mac, cero red externa, cero secrets, riesgo R4 (la demo debe seguir corriendo años con mantenimiento ~cero). Node LTS ya es supuesto registrado (D-0001).

## Decision
Aceptar la sugerencia con un ajuste en la capa de datos:

1. **Node.js ≥ 24 LTS** con `engines` en package.json (verificado local: v24.19.0).
2. **Express** como única dependencia de runtime.
3. **SQLite vía `node:sqlite`** (módulo nativo, `DatabaseSync`), file-based en `data/breachlab.db`.
4. **Panel en HTML/CSS/JS vanilla** servido por Express, polling 1 s, sin framework ni build step.
5. **Tests con `node:test` + `fetch` nativo** (0 devDependencies). Servidor efímero en puerto 0 para integración HTTP.
6. **gitleaks 8.30.1** para el gate de secrets (instalado vía winget en la máquina de fábrica; brew/scoop documentados). Config `.gitleaks.toml` versionada.

Justificación clave: `node:sqlite` elimina addons nativos → `npm install` nunca compila nada → el objetivo "2 comandos sin fricción" queda blindado y la superficie de rotura futura es mínima (1 dep). Express se mantiene porque la demo ES una API HTTP: el patrón middleware es el vehículo pedagógico del lab (auth, rate limit, kill switch como middlewares reales).

## Alternatives considered
- `better-sqlite3`: rejected — addon nativo; si no hay prebuild para la versión exacta de Node, requiere toolchain de compilación en Windows → rompe "2 comandos" exactamente donde más duele (máquina ajena).
- `sql.js` (WASM): rejected — persistencia manual del archivo, más código, sin ganancia.
- Frontend React/Vite: rejected — ~400 paquetes y un build step para un panel de observación con polling; costo de mantenimiento asimétrico al valor.
- Panel con SSE/WebSocket en vez de polling: rejected — polling 1 s percibido como "en vivo" para contadores que crecen cada 250 ms; SSE agrega reconexión/complejidad sin valor observable.
- `supertest`/`jest`/`vitest`: rejected — `node:test` + `fetch` nativo cubren integración HTTP real con 0 deps.
- Escáner de secrets casero (regex): rejected — una demo de seguridad con un detector de secrets débil es una ironía profesional; gitleaks es el estándar.

## Consecuencias
- Requiere Node ≥ 24 en la máquina que corre la demo (README + engines + check al boot con mensaje claro).
- Presentar en G2: la decisión coincide con la sugerencia del Negocio (ajuste interno del driver SQLite) — sin fricción esperada.
