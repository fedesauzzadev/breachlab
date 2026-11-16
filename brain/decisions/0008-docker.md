# D-0008: Docker — bind 0.0.0.0 DENTRO del contenedor, aislamiento loopback preservado por el port binding del compose

Date: 2026-11-15
Reversibility: easy

## Context
El Negocio pidió correr BreachLab con Docker (visitante sin Node 24). D-0003 fija el
aislamiento por bind: el server escucha SOLO en 127.0.0.1. Tensión: Docker no puede
reacher el loopback de un contenedor desde afuera — si el proceso bindea 127.0.0.1
dentro del contenedor, el port publishing no funciona y el lab queda inalcanzable.

## Decision
1. **`HOST` env en server.js (default `127.0.0.1`).** El Dockerfile setea
   `ENV HOST=0.0.0.0` — único lugar donde existe. Sin el env, comportamiento idéntico
   al de siempre (cero cambio en el camino Node; D-0003 intacto).
2. **El aislamiento a nivel host lo sostiene el compose**: `ports: "127.0.0.1:3000:3000"`
   hace que docker-proxy publique SOLO en el loopback del host. Verificado con netstat
   durante un run vivo: único listener `TCP 127.0.0.1:3000 LISTENING`
   (com.docker.backend.exe), nada en 0.0.0.0 — evidencia
   `brain/evidence/docker-deploy.txt`.
3. **El bot atacante no se toca**: URL constante `http://127.0.0.1:PORT/api`
   (src/attacker.js) sigue siendo loopback — dentro del contenedor, server y bot son el
   mismo proceso en el mismo namespace de red: el bot alcanza al server por su loopback
   interno aunque el server bindee 0.0.0.0. El relato HTTP real se preserva.
4. **Imagen mínima**: `node:24-alpine`, `npm ci --omit=dev` cacheado por capa, COPY
   selectivo (server.js, src, public, repo-sim, docs), usuario no-root `node` con
   `data/` pre-creada y escribible (createLab re-seedea al arrancar). Sin volúmenes:
   data efímera por diseño (supuesto #3 de la spec). `.dockerignore` excluye
   node_modules/data/.git/brain/factory/test/docs/screenshots.
5. De paso se fixeó `PORT=0`: `parseInt('0') || 3000` comía el 0 (falsy) → puerto fijo
   3000 → EADDRINUSE entre procesos de test consecutivos. Ahora todo entero es honrado
   (`Number.isInteger`); sin PORT o basura → 3000 como siempre.

## Alternatives considered
- Publicar `"3000:3000"` (0.0.0.0 en el host): rejected — rompe D-0003 a nivel host;
  el lab quedaría alcanzable desde la red local. El prefijo 127.0.0.1 del mapping es la
  frontera, no negociable.
- `network_mode: host`: rejected — solo Linux, y además el bind 0.0.0.0 del proceso
  quedaría expuesto directamente en las interfaces del host.
- Volumen persistente para data/: rejected — flexibilidad no pedida; el lab re-seedea
  al arrancar por diseño, data efímera es el comportamiento correcto.
- Flag/arg CLI en vez de env (p.ej. `--host`): rejected — env es lo idiomático para
  contenedores y el diff es una línea.

## Consecuencias
- Imagen 255MB (`node:24-alpine` + express + assets), build ~5 s con cache de capas.
- CI agrega job `docker-build` (solo build, sin registry/push — no hay registry).
- Dos tests nuevos (test/docker.test.js): proceso real `node server.js` con
  HOST=0.0.0.0 arranca y sirve /api/health exacto; sin HOST, bind default 127.0.0.1.
  Suite 59/59.
- README EN/ES documentan el comando Docker y POR DÓNDE vive el aislamiento en ese modo
  (el port binding) — el lector de seguridad no tiene que inferirlo.
