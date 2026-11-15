# D-0003: Arquitectura de la simulación — un proceso, ataque por loopback HTTP real, aislamiento por bind

Date: 2026-11-14
Reversibility: medium

## Context
Constraints no negociables (spec): simulación 100% local, cero llamadas a terceros, bot atacante in-process, API vulnerable POR DISEÑO pero no explotable fuera del sandbox. Además los 401/403/429 del relato deben ser REALES a los ojos del visitante (feed del panel), y la DB debe llenarse de basura de verdad.

## Decision
1. **Proceso único** (`node server.js`): API víctima + bot atacante + panel estático conviven. El bot es un `setInterval` que dispara HTTP contra la propia API.
2. **El bot ataca por HTTP real a loopback** (`http://127.0.0.1:3000`, constante hardcodeada en `src/attacker.js`, no configurable). Así los middlewares (auth, rate limit, kill switch, scopes) son el único camino de ejecución y los códigos que ve el panel son respuestas HTTP genuinas — no efectos pintados por la UI.
3. **Aislamiento por bind**: el server escucha SOLO en `127.0.0.1` (nunca `0.0.0.0`). La "vulnerabilidad" no es alcanzable desde otra máquina por construcción.
4. **Único cliente HTTP saliente del proceso = el bot** (con `AbortSignal.timeout(2000)`). Verificable por grep (NFR-3b) y netstat (NFR-3a).
5. **Estado del lab en memoria** (flags, contadores, umbrales) + **persistencia de la evidencia en SQLite** (entries, events, audit, api_keys). La DB se re-seedea al arrancar (supuesto #3 de la spec: no hay estado que preservar).
6. **El leak es un artefacto**: `repo-sim/config.json` (config "versionada" simulada) contiene la key falsa; se sirve read-only y el panel la muestra. El leak nunca vive en código.

## Alternatives considered
- Bot llamando handlers directos (sin HTTP): rejected — contaría la historia pero no la demostraría: los 401/429 serían simulados por la UI; se pierde el realismo pedagógico que es el producto.
- Proceso separado para el bot: rejected — complejidad de orquestación extra (2 comandos pasan a ser más, o un spawner) para cero valor observable; "in-process" es además constraint del Negocio.
- Worker thread para el bot: rejected — el loop de 4 req/s es trivial para el event loop; otro thread es flexibilidad no pedida.
- Escuchar en 0.0.0.0 "por si acaso": rejected — rompe el aislamiento por diseño; loopback es la frontera del sandbox.

## Consecuencias
- Bot y API comparten el event loop: a 4 req/s el impacto es despreciable (lo mide el test de p95, NFR-7).
- El ataque depende de que el server esté arriba: aceptable, viven juntos por diseño.
- Port del bot y del server deben coincidir: se resuelve con la misma constante leída del bootstrap (PORT env opt-in fluye a ambos).
