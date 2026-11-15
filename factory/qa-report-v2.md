# QA Report - BreachLab DELTA V2 / S09 (cierre de deuda de proceso: V2 salio sin round de QA)

QA adversarial de fabrica - 2026-11-15 - Build: HEAD 595d327 (rango declarado 71530ef..078e851 + 595d327 CI matriz; el working tree esta limpio en 595d327 y sobre el se QA-eo) - Node v24.19.0 - Windows
Alcance: DELTA V2 unicamente: serie de labs S09a (GET /api/lab/scenarios + POST /api/lab/scenarios/:id, 3 vectores, public/leak/*, selector/visor en panel) y S09b (GET /api/lab/export + boton export), mas el soporte del incremento (BREACHLAB_DB, docs 0.3.0, CI 3 OS). Los gates V0 (factory/qa-report.md) y V1 (factory/qa-report-v1.md) estan cerrados y NO se repiten.
Metodo: instalacion limpia + suite + fuzz propio de los endpoints nuevos (ids malformados, traversal %-encoded y crudo, unicode hostil, bodies no-JSON, 10KB) + interacciones de estado (switch en ataque, switch con hardening, carreras de switches concurrentes x6) + edges del export (acto 1, timeline gigante 507 eventos, doble export concurrente, export durante ataque, inyeccion markdown via audit) + regresion V0/V1 + NFRs afectados.
Regla L-03 respetada: TODO server levantado por QA uso BREACHLAB_DB propia en tmp; data/breachlab.db (demo viva) quedo INTACTA (mtime identico antes/despues del round completo).
Evidencias: brain/evidence/QA-v2-suite.txt, QA-v2-fuzz.txt, QA-v2-regression.txt. QA NO modifico codigo de producto y NO commiteo nada (reporte en working tree).

## Resumen ejecutivo

VEREDICTO: SHIP. 0 criticos, 0 mayores, 2 menores nuevos. El delta cumple las AC de N-0007 y N-0008 en todos los caminos del producto: catalogo de 3 vectores elegible, seleccion = reset + re-seed con la key del vector nuevo (0 keys colgadas, storage vuelve a plaintext, timeline re-narrado), switch bloqueado durante ataque/burst (400), ataque siempre usa la key del vector activo, y el export entrega un markdown attachment con TODO el timeline y TODO el audit en acto 1 y con incidente. La suite da 52/52 desde instalacion limpia (98.24% lineas, 0 vulns, 0 secrets, aislamiento intacto, CI verde en 3 OS sobre el HEAD verificado) y la regresion V0/V1 (ciclo base 5 actos + escenario scopeless + reset re-jugable) esta intacta. Los 2 hallazgos nuevos son menores y ninguno es alcanzable por el flujo del producto: inyeccion de pipes en celdas del export via audit (requiere cliente loopback adversarial deliberado; rompe solo la estructura visual de la tabla) y respuesta enganosa en carreras de switches concurrentes (estado interno consistente 6/6). Hallazgos abiertos L-4/L-5/L-6/L-8/L-9 re-verificados: siguen abiertos, sin cambios de severidad (L-8 se amplia cosmeticamente al switch de vector).

## 1. Suite completa (instalacion limpia)

Comando: borrar node_modules -> npm ci -> npm test -> npm run test:coverage -> npm audit --omit=dev.
- npm ci: ok, found 0 vulnerabilities.
- npm test: tests 52, pass 52, fail 0, duration 25405 ms (47 preexistentes + 4 s09a + 1 s09b; incluye el test de la race M-3).
- cobertura: 98.24% lineas / 90.56% branch / 96.97% funcs (umbral plan >=70%: VERDE; server.js 82.50% = bootstrap require.main no cubierto por tests efimeros).
- npm audit --omit=dev: 0 vulnerabilidades.
Evidencia: QA-v2-suite.txt. VERDE.

## 2. Fuzz / edges del delta

Comando: probe node propio contra buildApp en proceso (DB tmp propia). Evidencia: QA-v2-fuzz.txt.

### 2.1 POST /api/lab/scenarios/:id (69 checks de frontera)
- Catalogo GET /api/lab/scenarios: 200, 3 vectores completos (id/name/origin/leak_url/leak_kind), current correcto.
- Ids inexistentes/malformados (nope, slash-prefijo/sufijo, %00, ..%2F..%2Fserver.js, %2e%2e%2f, mayusculas, espacio, 10KB, unicode cirilico, null/0/true/{}): 16/16 -> 404 not_found. Metodos GET/PUT/PATCH/DELETE -> 404. Proceso vivo al final.
- Bodies no validos (campo extra, array, string, numero, boolean, null literal, JSON roto, 10KB basura, deep nest, sin content-type, text/plain): 11/11 -> 400 invalid_request; solo {} (y body vacio con CT json, misma semantica que V1) -> 200. Estado tras switch: server-log acto 1, 12/0.
- NFR-1 VERDE en los endpoints nuevos.

### 2.2 Cambiar de escenario DURANTE ataque activo / burst
- Bot corriendo (acto 2/3): switch -> 400 "detenga el ataque antes de cambiar de vector"; el vector activo NO cambia y el seed queda intacto.
- Burst del escenario scopeless en vuelo (running true): switch -> 400 igual. Tras el burst: 0 basura, 10 filas audit (insufficient_scope).

### 2.3 Cambiar escenario con hardening activo (keys colgadas / storage)
- Estado pre-switch verificado en DB: leaked key en sha256 disabled + rotated activa con scope + scopeless revocada; storage sha256.
- Switch a server-log -> 200: flags TODAS en false, storage plaintext, act 1, timeline re-sembrado con 7 eventos (system + narracion warning + 5 traffic), audit 0, entries 12/0.
- api_keys queda EXACTAMENTE 1 fila (leaked-server-log, plain, active): CERO keys del vector viejo colgadas. leaked_masked pasa a la mascara del vector nuevo.
- Ataque post-switch escribe basura con la key del vector NUEVO (wiring leakKey correcto); vuelta a repo-config re-narra sin narracion (6 eventos).

### 2.4 Export (edges)
- Acto 1 sin incidente: 200 text/markdown, attachment con filename breachlab-evidence-<ts>.md, audit vacio narrado ("Sin intentos bloqueados registrados"), nota FAKE BY DESIGN. HEAD con query basura -> 200; POST -> 404/400.
- HALLAZGO L-10 (Menor) - inyeccion markdown via celdas del audit: con hardening activo, un POST rechazado deja en audit.endpoint el originalUrl CRUD0 (query string incluida) y en key_masked la mascara de la key presentada; ambos entran sin escapar a la tabla del export. Repro: POST /api/entries?x=|FAKE|COL|CELDA| con la key del leak -> 403 auditado -> el export contiene la fila "| 1 | <ts> | sk_b...3a9c | POST | /api/entries?x=|FAKE|COL|CELDA| | 403 | insufficient_scope |" (la celda inyectada parte la tabla); idem x-api-key "|AB|CD|" -> mascara "|AB|...|CD|". Los MENSAJES del timeline NO son inyectables (strings fijas del server; verificado). Impacto acotado: requiere cliente loopback adversarial deliberado (el bot de la demo nunca manda queries ni keys con pipes); rompe solo la estructura visual de la tabla del archivo de evidencia, no hay fuga ni crash. Fix sugerido (1 linea x celda): escapar "|" en endpoint/key_masked/reason al armar las filas.
- Timeline gigante: 500 rotate-key (13431 ms) -> 507 eventos -> export 69858 bytes en 23/16/14 ms (3 corridas), header "## Timeline (507 eventos)" exacto, 200. Sin cuello ni truncado.
- Doble export concurrente: ambos 200, mismo largo de body. Export con ataque corriendo: 200 sin crash.

### 2.5 Artefactos /leak/* (path traversal)
- /leak/error.log y /leak/legacy-bundle.js: 200 con SU key falsa (el vector funciona).
- Socket crudo (sin normalizacion del cliente): /leak/../server.js, /leak/..%2Fserver.js, /leak/%2e%2e%2f%2e%2e%2fserver.js, /leak/..%5C..%5Cserver.js (backslash Windows), /leak/error.log/../../server.js, /leak/../src/scenarios.js: 7/7 -> 404 JSON not_found, CERO contenido de server.js/src servido. /leak/ (dir listing) -> 404. /data/breachlab.db -> 404. /leak/nonexistent.log -> 404. Express static resuelve dentro de public/ y no sirve dot-traversal.
- Nota de transparencia: el log del probe registra lineas RAW ... TIMEOUT duplicadas 4s despues de cada respuesta 404 - es un double-resolve del timer de MI probe, no un hang del server (las respuestas reales son los 404 inmediatos).

### 2.6 Carrera de switches concurrentes
- HALLAZGO L-11 (Menor) - respuesta enganosa: 6/6 carreras de POST /scenarios/A + /scenarios/B simultaneos devuelven AMBAS 200 {scenario:X, reset:true}, pero la respuesta del perdedor nombra un vector que NO es el activo (useScenario del ganador corre durante el settle de 350ms del perdedor). El ESTADO interno quedo consistente 6/6: scenarioId siempre coincide con la key sembrada (label de api_keys), 12/0 entries, 7 eventos, health 12. Un consumidor programatico concurrente (curl x2, no el panel) podria creer que activo un vector que no esta activo. Fix sugerido (~2 lineas): responder con lab.state.scenarioId leido DESPUES del fullReset.

## 3. Regresion V0/V1 tras S09 (wiring useScenario/leakKey)

Evidencia: QA-v2-regression.txt + suite (52/52 incluyen los 37 V0 y los 5 V1).
- Vector base repo-config, ciclo completo real: ataque -> deteccion acto 3 (alerta) -> kill/rotate/rate-limit -> hardening acto 5 (storage sha256, hitos 1-4 true) -> re-ataque: hito 5 reattack_bounced, 0 basura nueva, rebotes 403 key_disabled auditados. /leak/config.json 200 con la key base. Export con los 12 eventos del timeline presentes + audit + postmortem.
- Nota (confirmacion de L-4, no hallazgo nuevo): con rate-limit activo parte de los rebotes del re-ataque se ven 429 ANTES de la auth y no llegan al audit (10 auditados de 20 rebotes) - precedencia rateLimit->apikey documentada en el plan 2.1, ya registrada como L-4 en V0.
- Escenario scopeless (V1): 202, burst no agrega basura (1 -> 1), 10 rebotes 403 insufficient_scope auditados, bot se frena solo.
- Reset: seed exacto acto 1 (12/0, 6 eventos, audit 0, plaintext) y demo re-jugable (la basura vuelve a crecer).
REGRESION: OK (14/14 checks del probe + 52/52 de suite).

## 4. NFRs afectados

- NFR-1 (validacion endpoints nuevos): VERDE. 27 inputs invalidos en /scenarios/:id + bodies -> 100% 400/404; proceso vivo; unico 200 extra = body vacio con CT json (semantica {} heredada de V1, valida).
- NFR-2 (secrets): VERDE con L-05 igual que V1. gitleaks por ruta absoluta: ~410092 bytes, no leaks found, exit 0. npm run scan:secrets sigue fallando en esta maquina (gitleaks fuera de PATH).
- NFR-3 (aislamiento): VERDE. Unico fetch de producto en src/attacker.js:59 (loopback constante); /export lee docs/postmortem.md con readFileSync local; public/leak/legacy-bundle.js tiene fetch CLIENT-SIDE de navegador simulado (nunca cargado por el panel - el visor lo muestra como texto). Bind 127.0.0.1 intacto.
- NFR-7 colateral: VERDE. p95 /api/lab/state 20.9 ms / 60 samples (umbral 200 ms); /api/lab/scenarios 16.2 ms; /api/lab/export 17.2 ms.
- Fix L-03 estructural (BREACHLAB_DB): VERDE. Smoke con DB propia en tmp: server sano, health 12/act1, export 200; data/breachlab.db intacta (mtime identico) tras TODO el round.

## 5. DoD

- Version 0.3.0 en package.json (+ repository field del repo publicado).
- CHANGELOG 0.3.0 con S09a/S09b descritos con honesty total (lo que dice = lo que QA verifico). Archivo UTF-8 real (26 em-dash, 0 replacement; mojibake de consola = L-06).
- README EN/ES: seccion v0.3.0 (serie de labs + export) verificado funcionalmente por este round; v0.2.0 sigue mencionada.
- LICENSE MIT intacto; 0 TODO/FIXME reales (1 match = palabra inglesa "todo" en prosa del CHANGELOG).
- CI: GitHub API run #7 sobre head_sha 595d327 (HEAD bajo QA) conclusion success - matriz ubuntu/macos/windows Node 24 verde sobre el commit exacto verificado.

## Hallazgos por severidad

Criticos: 0. Mayores: 0.

MENORES (nuevos):
- L-10 - Export markdown inyectable via celdas del audit: audit.endpoint lleva el originalUrl crudo (query incluida) y key_masked la mascara de la key presentada; ambos entran sin escapar a la tabla del export y un "|" parte la fila. Repro completo en QA-v2-fuzz.txt P4 (fila rota capturada). Requiere cliente loopback adversarial; los mensajes del timeline NO son inyectables. Fix: escape de "|" en las celdas del export.
- L-11 - Carrera de switches: la respuesta 200 del switch perdedor nombra un vector distinto al activo (estado interno consistente 6/6). Solo alcanzable con clientes concurrentes programaticos (el panel serializa). Fix: responder con scenarioId post-fullReset.

Abiertos de V0/V1 (re-verificados hoy):
- L-4 - SIGUE (documental): precedencia rateLimit->apikey; re-confirmado en vivo hoy (re-ataque con rate-limit: 10 de 20 rebotes auditados, los 429 no auditan).
- L-5 - SIGUE: gitleaks fuera de PATH en esta maquina; scan:secrets falla, ruta absoluta exit 0 / 0 findings.
- L-6 - SIGUE (cosmetico): mojibake de display en consola PowerShell; archivos UTF-8 correctos (verificado CHANGELOG byte a byte).
- L-8 - SIGUE y se AMPLIA (cosmetico->igual severidad): el cambio de vector TAMBIEN rearma ids a 1; el panel solo rearma cursores en su propio click (reset-btn / scenario-select). Un switch o reset disparado por curl u otra pestana congela el timeline/audit de la pestana que no disparo hasta superar el cursor viejo. Sin fix de epoch en /state todavia.
- L-9 - SIGUE (pre-existing S03, fuera del delta): recordHit degrada act 5->3 ante flood manual de GETs validos (codigo de apikey.js sin cambio en el delta).

## Veredicto por nodo

- N-0007 (serie de labs): PASS. AC1 (elegir escenario desde el panel): catalogo API + selector sincronizado por polling (verificado API + codigo del panel: sync scenario-select/origin por /state, clearIncident rearma cursores en el click propio). AC2 (ciclo completo por vector con narracion propia): suite x2 vectores + probe (seed con SU key, evidencia /leak/ 200, narracion warning acto 1, matafuegos/hardening sobre la key del vector, re-ataque rebota, 0 keys colgadas tras switch con hardening, base intacta). QA mantiene verified.
- N-0008 (export de evidencia): PASS. AC1 (boton -> archivo local legible timeline+audit+resumen, sin salir del sandbox): attachment text/markdown verificado en acto 1 y con incidente, doble export, durante ataque, gigante (507 ev / 69858 B / <25 ms). AC2 (tercero reconstruye sin correr la demo): suite aserta TODO evento y TODO rebote; probe re-verifica presencia completa + resumen verbatim. Salvedad L-10 (celdas inyectables por cliente adversarial; no afecta la presencia de datos). QA mantiene verified.

## Veredicto final: SHIP (para V2)

- Suite 52/52 desde instalacion limpia, cobertura 98.24%, 0 vulns, 0 secrets, aislamiento intacto, p95 < 21 ms, CI 3 OS verde sobre el HEAD verificado.
- Los 3 vectores y el export cumplen sus AC en todos los caminos del producto; la regresion V0/V1 esta intacta.
- 0 criticos, 0 mayores. L-10 y L-11 no son alcanzables por el flujo del producto (panel/bot), dejan estado valido y tienen fix de 1-3 lineas; deberian entrar al primer round de dev post-review junto con L-8.
- Deuda de proceso saldada: V2 tiene ahora su round formal de QA.

Riesgo residual (BAJO): (1) un cliente loopback adversarial puede romper visualmente la tabla del export via audit (L-10); (2) switches concurrentes programaticos reciben respuestas que no reflejan el vector activo (L-11); (3) switches/resets externos al panel congelan timeline/audit de pestanas no iniciadoras (L-8).
