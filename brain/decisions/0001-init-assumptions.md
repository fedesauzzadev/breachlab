# D-0001: Supuestos del init-brain no-interactivo

Date: 2026-11-14
Reversibility: easy

## Context
init-brain se ejecutó dentro del flujo automatizado de la fábrica (skill software-factory, Fase 0), sin usuario disponible para la ronda de preguntas. Por §2b del skill, los supuestos se registran acá como decisiones reversibles.

## Decision
- `language: es` — idioma del Negocio (decidió "bilingüe ES/EN" para contenido del producto; los archivos del brain van en español).
- `commands` vacíos — proyecto nuevo sin package.json todavía; se estampan al scaffold del slice 1 (`npm test` / `npm start` esperados).
- `models`: strong `zai-coding-plan/glm-5.3` (mayor razonamiento del plan), balanced `zai-coding-plan/glm-5.3-highspeed` (mid), fast `zai-coding-plan/glm-5.3-flash` (más rápido/barato). Clasificación por tier de capacidad, único provider del plan.
- `remote_url` = origin del clone del kit (`C:/Users/hp/Downloads/NSDD/brainloom-remote.git`).
- Proyecto NUEVO (sin código previo) → brain crece orgánicamente, no se corre `adopt`.

## Alternatives considered
- Preguntar al usuario: imposible — flujo no-interactivo dentro de la fábrica; el Negocio solo interviene en gates.
- Comandos pre-estampados por suposición: rechazado — comandos que no corren aún peores que vacíos.
