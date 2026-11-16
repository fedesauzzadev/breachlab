# BreachLab

<!-- BADGES (descomentar tras el primer push — ver docs/PUBLISHING.md):
[![CI](https://github.com/fedesauzzadev/breachlab/actions/workflows/ci.yml/badge.svg)](https://github.com/fedesauzzadev/breachlab/actions/workflows/ci.yml)
[![gitleaks](https://img.shields.io/badge/protected%20by-gitleaks-blue)](https://github.com/gitleaks/gitleaks-action)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
-->

Sandbox interactiva, 100% local, que recrea de punta a punta un incidente clásico de seguridad: una **API key filtrada en un archivo de config versionado**, explotada por un atacante que inunda la base de datos, detectada por monitoreo de anomalías, contenida con kill switch / rotación de key / rate limit, y finalmente endurecida (keys hasheadas, scopes, audit log).

**Por qué existe:** una demostración profesional de respuesta a incidentes. No es un tutorial ni un CTF — es una pieza de porfolio que muestra cómo una credencial filtrada se explota, se detecta, se contiene y se corrige estructuralmente, observada en vivo desde la consola del defensor.

Un solo proceso Node.js, bindeado a `127.0.0.1`. Nada sale de tu máquina.

## Correrlo (2 comandos)

```bash
npm install
npm start
```

Abrí **http://127.0.0.1:3000** — sin configuración, sin variables de entorno, sin build step. Requiere [Node.js ≥ 24](https://nodejs.org) (módulo nativo `node:sqlite`).

## Correrlo con Docker

¿No tenés Node 24 a mano? La misma experiencia, un comando:

```bash
docker compose up --build
```

Abrí **http://127.0.0.1:3000**. Paralo con `Ctrl+C` (o `docker compose down` para desarmarlo del todo).

**Nota de seguridad:** el aislamiento loopback (el server jamás escucha en `0.0.0.0` cuando lo corrés con Node) se preserva **a nivel host mediante el port binding del compose** `"127.0.0.1:3000:3000"` — Docker publica el puerto *solo* en el loopback del host, así que nada es alcanzable desde otras máquinas. Dentro del contenedor el server sí debe bindear `0.0.0.0` (Docker no puede alcanzar el loopback de un contenedor desde afuera — para eso está el `ENV HOST=0.0.0.0` del Dockerfile), y el bot atacante sigue golpeando el `127.0.0.1` interno del contenedor: mismo proceso, mismo relato HTTP real. La carpeta `data/` es efímera por diseño — el lab se re-seedea en cada arranque.

## Qué vas a ver — el incidente en 5 actos

| Acto | La historia |
|------|-------------|
| **1 · Normal** | La API sirve tráfico legítimo; el timeline muestra requests normales. El leak ya está latiendo en una config "versionada" — pulsá "Ver el leak" para encontrarlo. |
| **2 · Ataque** | Un bot golpea la API **con la key filtrada** y llena la DB de basura. |
| **3 · Detección** | El volumen cruza el umbral de anomalía → alerta roja con hora, key enmascarada y motivo. |
| **4 · Contención** | Contraatacás: kill switch, rotación de key, rate limit. El feed muestra respuestas 403/401/429 reales. |
| **5 · Hardening** | Las keys pasan a hashes sha256, se exigen scopes, cada intento bloqueado queda en el audit log. El re-ataque rebota. |

Manejas toda la respuesta desde el panel; los 401/403/429 que ves son respuestas HTTP reales producidas por los middlewares — no efectos de UI.

## Demo — el incidente en cinco capturas

Capturas reales de la consola del defensor, el mismo flujo que ves con `npm start`:

**Acto 1 · Normal** — la API sirve tráfico legítimo. La bomba ya está plantada: la key está filtrada en una config "versionada".
![Acto 1 — operación normal, seed, timeline limpio](docs/screenshots/acto1-normal.png)

**Acto 2 · Ataque** — el bot interno dispara con la key filtrada; los requests anómalos y la basura en DB crecen en vivo.
![Acto 2 — ataque en curso, contadores creciendo](docs/screenshots/acto2-ataque.png)

**Acto 3 · Detección** — el volumen cruza el umbral: alerta critical con hora, key enmascarada y motivo.
![Acto 3 — alerta roja en el timeline](docs/screenshots/acto3-deteccion.png)

**Acto 4 · Contención** — kill switch + rotación + rate limit. El feed muestra 403/401/429 reales; el atacante se rinde tras 20 rebotes consecutivos.
![Acto 4 — matafuegos, feed lleno de requests rebotadas](docs/screenshots/acto4-matafuegos.png)

**Acto 5 · Hardening** — keys como hashes sha256, scopes exigidos, cada intento bloqueado auditado. El re-ataque rebota, cero basura nueva.
![Acto 5 — sistema endurecido con audit log](docs/screenshots/acto5-hardening.png)

**Nuevo en v0.3.0:** BreachLab es ahora una **serie de labs** — elegí cómo se filtró la
key (config versionada · log de errores del server expuesto · bundle del frontend
legacy) y rejugá el mismo incidente en 5 actos sobre ese vector, cada uno con su
evidencia de leak y su narración. Después **exportá la evidencia**: un archivo markdown
con el timeline completo, el audit log y el resumen del postmortem, generado
server-side y descargado localmente — un tercero reconstruye el incidente sin correr
nada. **v0.2.0:** modo guiado con hitos automáticos (la forma recomendada de narrar la
demo frente a reclutadores), reinicio del incidente al instante y un segundo escenario
que cuenta la historia del mínimo privilegio.

**Leé el relato completo después de la demo: [postmortem del incidente](docs/postmortem.md)** (EN) — cronología, impacto, causa raíz, respuesta rápida y mitigaciones estructurales, redactado como reporte profesional.

## Nota de seguridad (leé esto)

- **Todas las keys de este repo son falsas.** Usan el prefijo `sk_breachlab_demo_` y son *FAKE BY DESIGN* — jamás hay un secret real de terceros. El repo trae un gate de secrets (`npm run scan:secrets`) que debe dar **0 findings**.
- **Solo loopback.** El server bindea exclusivamente `127.0.0.1` y hace cero llamadas a hosts externos. Lo "vulnerable por diseño" aplica *solo dentro de la sandbox*.

## Stack técnico (deliberadamente mínimo)

| Capa | Elección |
|---|---|
| Runtime | Node.js ≥ 24 — `node:sqlite` nativo, cero compilación nativa |
| HTTP | **Express — la única dependencia de runtime** |
| UI | HTML/CSS/JS vanilla servido por Express — cero build step |
| Tests | `node:test` + `fetch` nativo — cero devDependencies |
| CI | GitHub Actions: tests + cobertura + gitleaks en cada push/PR |

## Desarrollo

```bash
npm ci                 # install reproducible desde package-lock.json
npm test               # suite: unit + integración HTTP en loopback
npm run test:coverage  # reporte de cobertura de líneas de src/
npm run scan:secrets   # gitleaks — debe dar 0 findings
```

## Troubleshooting

| Problema | Solución |
|---|---|
| Error al arrancar / falta `node:sqlite` | Necesitás Node ≥ 24. Verificá con `node --version`. |
| Puerto 3000 ocupado | `PORT=3001 npm start` (Windows PowerShell: `$env:PORT=3001; npm start`). |

## Licencia

[MIT](LICENSE) — libre de usar, estudiar y forkear.

---

[Read this in English](README.md)
