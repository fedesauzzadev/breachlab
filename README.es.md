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

## Qué vas a ver — el incidente en 5 actos

| Acto | La historia |
|------|-------------|
| **1 · Normal** | La API sirve tráfico legítimo; el timeline muestra requests normales. El leak ya está latiendo en una config "versionada" — pulsá "Ver el leak" para encontrarlo. |
| **2 · Ataque** | Un bot golpea la API **con la key filtrada** y llena la DB de basura. |
| **3 · Detección** | El volumen cruza el umbral de anomalía → alerta roja con hora, key enmascarada y motivo. |
| **4 · Contención** | Contraatacás: kill switch, rotación de key, rate limit. El feed muestra respuestas 403/401/429 reales. |
| **5 · Hardening** | Las keys pasan a hashes sha256, se exigen scopes, cada intento bloqueado queda en el audit log. El re-ataque rebota. |

Manejas toda la respuesta desde el panel; los 401/403/429 que ves son respuestas HTTP reales producidas por los middlewares — no efectos de UI.

**Nuevo en v0.2.0:** el panel corre ahora en **modo guiado** — un checklist de 5 hitos que recorre el incidente acto por acto, la forma recomendada de correr esta demo frente a reclutadores. Un botón de **reset** restaura el seed exacto del acto 1 sin reiniciar el proceso (replay inmediato), y un **segundo escenario** (lab endurecido donde una key válida sin scope de escritura rebota `403` auditados) cuenta la historia del mínimo privilegio.

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
