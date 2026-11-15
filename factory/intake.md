# Intake — BreachLab

Fecha: 2026-11-14
Fuente: requerimiento literal del Negocio + ronda de opciones (pregunta única pre-coding).

## Requerimiento literal (sin interpretar)

> Necesito un proyecto para un porfolio personal de proyectos y trabajos. A raiz de un problema que me contaron de una empresa real, les consiguieron un apikey y a partir de esa api key les estuvieron consumiendo endpoints, generando cosas en base de datos. Al final no paso nada muy fuerte ni grave pero si fue una vulnerabilidad y podria haber sido catastrofico.
> Quisiera que el proyecto que vos elijas, sea un ejemplo, una demostracion profesional, de que pasa cuando tener una vulnerabilidad de sistema y como mitigarla, ya sea con un matafuegos rapido o con algun otro metodo de mitigacion de rapido actuar y seguridad firme a futuro. Dame opciones antes de arrancar a codificar de como lo harias, de que tematica y demás detalles

## Decisiones del Negocio (ronda de opciones 2026-11-14)

| Punto | Decisión |
|---|---|
| Temática | **BreachLab** — lab interactivo: API vulnerable + panel, modo ataque (bot consume endpoints con key filtrada, llena DB), modo respuesta (kill switch, rotación de key, rate limit), modo hardening (keys hasheadas, scopes, audit log, alertas), timeline del incidente estilo postmortem |
| Stack | Node.js + Express + SQLite (sugerido; TL puede contraproponer con ADR) |
| Carpeta destino | `C:\repos\breachlab` |
| Idioma | Bilingüe ES/EN — mantener alcance chico (ej: UI ES + README/postmortem EN, o al revés; NO i18n framework full) |

## Objetivo

Porfolio personal cuyo centro es una demostración profesional e interactiva de un incidente de seguridad real (API key filtrada → consumo abusivo de endpoints → escrituras maliciosas en DB) y su mitigación en dos capas: respuesta rápida (matafuegos) y hardening firme a futuro.

## Usuarios

1. Reclutadores / peers del dueño del porfolio (audiencia principal): deben entender la historia en <5 minutos sin setup previo.
2. El dueño: debe poder correrla y narrarla en una entrevista.

## Definición de éxito

- Con 2 comandos (`install` + `start`) la demo corre local, sin servicios externos ni keys reales.
- Un visitante puede: ver el estado normal → disparar el ataque → ver la DB llenarse de basura y las alertas → aplicar el matafuegos (kill switch / rotación / rate limit) → activar hardening → ver el ataque rebotar.
- README/postmortem bilingüe que un reclutador leería entero.

## Constraints

- Simulación 100% local y segura: keys falsas, API vulnerable POR DISEÑO y aislada, bot atacante simulado dentro del proceso. Cero llamadas a terceros.
- La "vulnerabilidad" no debe ser explotable fuera del sandbox de la demo.
- Sin secrets reales en el repo (DoD).
- OS destino: Windows (máquina del Negocio) + portable a Linux/Mac.

## Fuera de scope (hoy)

- Auth de usuarios real del porfolio, deploy a producción, métricas reales, i18n framework completo.
