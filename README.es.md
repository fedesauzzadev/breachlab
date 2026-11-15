# BreachLab

Sandbox interactiva, 100% local, que recrea de punta a punta un incidente clásico de seguridad: una **API key filtrada en un archivo de config versionado**, explotada por un atacante que inunda la base de datos, detectada por monitoreo de anomalías, contenida con kill switch / rotación de key / rate limit, y finalmente endurecida (keys hasheadas, scopes, audit log).

Todo el incidente se observa desde la **consola del defensor** — un panel web con timeline en vivo de lo que ve la API.

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

**Leé el relato completo después de la demo: [postmortem del incidente](docs/postmortem.md)** (EN) — cronología, impacto, causa raíz, respuesta rápida y mitigaciones estructurales, redactado como reporte profesional.

## Nota de seguridad (leé esto)

- **Todas las keys de este repo son falsas.** Usan el prefijo `sk_breachlab_demo_` y son *FAKE BY DESIGN* — jamás hay un secret real de terceros. El repo trae un gate de secrets (`npm run scan:secrets`) que debe dar **0 findings**.
- **Solo loopback.** El server bindea exclusivamente `127.0.0.1` y hace cero llamadas a hosts externos. Lo "vulnerable por diseño" aplica *solo dentro de la sandbox*.

## Troubleshooting

| Problema | Solución |
|---|---|
| Error al arrancar / falta `node:sqlite` | Necesitás Node ≥ 24. Verificá con `node --version`. |
| Puerto 3000 ocupado | `PORT=3001 npm start` (Windows PowerShell: `$env:PORT=3001; npm start`). |

---

[Read this in English](README.md)
