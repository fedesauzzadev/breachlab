# QA Report - BreachLab MVP/V0 (gate SHIP, review G2)

QA adversarial de fabrica - 2026-11-15 - Build: HEAD b0b3de4 (S01..S06 cerrado) - Node v24.19.0 - Windows
Metodo: suite completa desde instalacion limpia + fuzzing/bordes + matriz auth + NFRs medidos + walkthrough cronometrado.
Evidencias nuevas: brain/evidence/QA-suite.txt, QA-fuzz.txt, QA-perf.txt, QA-scope.txt, QA-secrets.txt, QA-isolation.txt, QA-audit.txt, QA-crash.txt, QA-coverage.txt, QA-dod.txt, QA-walkthrough.txt. QA NO modifico codigo de producto.

## Resumen ejecutivo

VERDICTO: SHIP. 0 hallazgos criticos, 0 altos, 2 medios, 4 bajos. El producto hace lo que el spec dice: los 5 actos corren en 14.5 s (gate 5 min), la suite da 36/36 desde instalacion limpia, el sandbox esta cerrado a loopback (0 sockets externos durante ataque activo), 0 secrets reales y 0 vulnerabilidades en dependencias. Dos medios son desvios de NFR con mitigacion real medida (cobertura: el comando del plan no existe pero la cobertura real es 97.75 por ciento; DB corrupta: crash ruidoso sin reseed) - ninguno bloqueante, ambos con fix de menos de 30 min para el proximo round de dev.

## Resultados por NFR (comando corrido + resultado numerico)

NFR-1 Validacion en fronteras - fuzz propio (QA-fuzz.txt): 59 expectativas. Payloads basura, tipos incorrectos, campos extra, title 10 KB, body 200 KB, JSON malformado, CT erroneos, raw sockets (garbage request, header 16 KB, unicode crudo, body truncado, URL 9 KB), querystrings hostiles. RESULTADO: 100 por ciento de invalidos dio 400 invalid_request; bordes 80/280 chars aceptan 201 y 81/281 rechazan 400; proceso VIVO al final (health ok, 0 stderr). 4 FAIL iniciales eran precedencia legitima de rate-limit sobre auth (re-verificado en server fresco: 11/11). VERDE.

NFR-2 Cero secrets - gitleaks 8.30.1 por ruta absoluta (L-01), comando detect con .gitleaks.toml: 249.02 KB escaneados, 0 leaks, exit 0. Allowlist unica prefijo sk_breachlab_demo_ documentada FAKE BY DESIGN. VERDE.

NFR-3 Aislamiento - netstat -ano DURANTE ataque activo: listener SOLO 127.0.0.1:3989, todas las ESTABLISHED son loopback contra loopback, 0 sockets no-loopback. Grep de clientes HTTP: unico fetch del codigo server-side es src/attacker.js linea 43 con HOST constante 127.0.0.1 (los fetch de panel.js son same-origin del browser). server.js linea 19 bind hardcoded. VERDE.

NFR-4 Auth exacta - matriz en server fresco (QA-perf.txt, QA-scope.txt): sin key 401 / key mala 401 / revocada 401 / kill switch 403 key_disabled / sin scope 403 insufficient_scope (GET queda 200) / rate 429. 7 bodies de error 4xx-5xx capturados con 0 internals; headers sin x-powered-by ni versiones. VERDE.

NFR-5 Rate limit con numeros - rafaga de 25 con RL 10/10s (QA-fuzz.txt): 2xx=10 exacto / 429=15 / otros=0 / Retry-After presente 15/15 (valor 1 s o mas). VERDE.

NFR-6 Timeouts IO saliente - codigo + corrida: src/attacker.js linea 47 usa AbortSignal.timeout(2000); el bot cuenta timeout como bloqueo y no cuelga. VERDE.

NFR-7 p95 API local - 50 samples por endpoint en loopback (QA-perf.txt): GET /api/lab/state p95 = 16.4 ms (mean 12.6, max 17.2); POST /api/entries p95 = 22.8 ms (mean 15.5, max 26.4). Umbral 200 ms cumplido con margen ~10x. VERDE.

NFR-8 Dependencias - npm audit --omit=dev: 0 vulnerabilidades. 1 dependencia runtime (express 5.1.0), lockfile commiteado. VERDE.

NFR-9 Suite limpia + cobertura - npm ci && npm test: 36/36 pass, 0 fail, exit 0 (19.3 s). PERO npm run test:coverage devuelve Missing script (hallazgo M-1). Cobertura REAL medida por QA con node --test --experimental-test-coverage: 97.75 por ciento lineas en all files (src/ 100 por ciento lineas, server.js 83.33 por ciento) - umbral 70 por ciento cumplido con holgura. AMARILLO.

NFR-10 Crash-coherencia - arranque con data/breachlab.db corrupto (29 bytes basura, QA-crash.txt): el proceso muere con stack crudo ERR_SQLITE_ERROR 26 file is not a database en src/lab.js:48. NO es crash silencioso (causa identificable), pero sin reseed ni log claro accionable, y la suite no tiene test del caso (hallazgo M-2). Ningun input HTTP puede corromper la DB (todo pasa por prepared statements). ROJO a letra del plan.

## Walkthrough funcional cronometrado (los 5 actos)

Evidencia QA-walkthrough.txt - ejecutado por HTTP replicando 1:1 los fetch de los botones del panel (mismos endpoints y bodies que public/panel.js; estructura del panel verificada: GET / devuelve 200 HTML 5.7 KB con 15/15 IDs referenciados, GET /panel.js devuelve 200 JS). npm start en puerto default 3000 verificado aparte (health ok, seed 12).

- Acto 1 normal: health ok, 12 legit, timeline 6 eventos con 0 de seguridad, leak servido con key falsa. t+0.0 s
- Acto 2 ataque: requests 7 / garbage 7 a t+2 s, creciendo en vivo. t+0.0 s
- Acto 3 deteccion: alerta critical 31 requests en 10 s, key sk_b...3a9c, con hora. Dispara en hit 31, t+8.5 s.
- Acto 4 matafuegos: kill 403, rotate 401, rate 429; feed 201x14 + 403x6; evento timeline por accion. t+8.5 s
- Acto 5 hardening: storage sha256, basura congelada 30, re-ataque +15 requests con 15 blocked y 0 basura nueva, audit fila por rebote, postmortem 200 (6.8 KB, Timeline + Root Cause). t+14.5 s
- TOTAL: 14.5 s contra gate de 300 s. VERDE con margen enorme.

## Checklist references/security.md - OK / FALLA / N-A

Seguridad:
- Toda entrada externa validada (tipo/rango/tamano/formato) con codigo correcto: OK (QA-fuzz.txt: 100 por ciento 400s; limite 100 kb; 413/415 mapeados a 400; llhttp rechaza HTTP malformado crudo con 400 sin crashear)
- Cero secrets en codigo/tests/logs/commits: OK (gitleaks 0 findings; keys 100 por ciento falsas con prefijo propio; logs solo startup + err.message server-side)
- Dependencias sin vulns criticas/altas, lockfile commiteado: OK (npm audit --omit=dev: 0)
- Errores no filtran internals: OK (7 bodies 4xx-5xx capturados con 0 stack/rutas/versiones; x-powered-by disabled; 404/500 genericos)
- Inyeccion (queries/comandos/shell por concatenacion): OK (100 por ciento prepared statements verificado en lab.js, apikey.js, entries.js, labroutes.js)
- Auth: hash + rate limiting en endpoints sensibles: OK con nota (no hay usuarios/passwords, bcrypt N-A; API keys plaintext-then-sha256 ES el arco pedagogico del producto; rate limit presente como palanca; expiracion de tokens fuera de alcance MVP, la rotacion es la mitigacion que se ensena)

Resiliencia:
- IO externa con timeout explicito: OK (bot: AbortSignal.timeout(2000))
- Errores manejados con codigos correctos y sin estados corruptos: OK (handler central; reseed por arranque)
- Retry con backoff / fallback de dependencias opcionales: N-A (no hay retries ni deps opcionales, por diseno)
- Crash-coherencia ante input malformado: OK para HTTP (proceso vivo tras bombardeo completo); FALLA parcial para DB corrupta al arranque (M-2)

Performance:
- p95 del flujo principal MEDIDO vs objetivo: OK (16.4 / 22.8 ms vs 200 ms)
- Sin O(n2) evitable ni IO bloqueante en camino caliente: OK con nota (SQLite sync es local y acotado; GET /api/entries sin paginar: irrelevante a escala sandbox, el rate limit acota el crecimiento)
- Memoria estable en corrida repetida: OK (900 requests: banda 60-68 MB con GC activo, sin crecimiento monotonico - QA-perf.txt)

DoD vendible:
- README que es / para quien / instalar y probar en 5 min o menos: OK (EN + ES, 2 comandos exactos, verificados de verdad con npm start en puerto default)
- LICENSE: OK (MIT)
- Version semver + CHANGELOG: OK (0.1.0, Keep a Changelog)
- Suite verde desde instalacion limpia: OK (36/36, exit 0)
- Cero TODO/FIXME criticos: OK (grep case-sensitive: 0; los 4 matches case-insensitive eran la palabra todo en comentarios en espanol)
- El producto hace lo que el spec dice, cada AC con evidencia: OK (N-0001..N-0004 con verificacion independiente QA registrada en brain)

## Hallazgos por severidad

Criticos: 0. Altos: 0.

MEDIOS:

M-1 - NFR-9: el comando de cobertura del plan no existe. npm run test:coverage devuelve npm error Missing script (QA-coverage.txt). El plan (seccion 3 NFR-9 y seccion 5 tabla QA) lo fija como comando de gate con umbral 70 por ciento lineas. La cobertura REAL medida por QA es 97.75 por ciento lineas: el umbral se cumple de sobra, pero el comando documentado no corre y nadie lo detecto en 6 slices. Repro: npm run test:coverage. Fix sugerido (1 linea, cero deps): agregar script test:coverage = node --test --experimental-test-coverage en package.json. **RESUELTO 2026-11-15, commit a1d0e97**: script agregado y verificado — npm run test:coverage corre la suite 37/37 exit 0 y reporta 97.82 por ciento lineas all files (evidence brain/evidence/rework-QA-coverage.txt).

M-2 - NFR-10: arranque con DB corrupta no hace reseed ni da log claro. Repro: escribir 29 bytes de basura en data/breachlab.db y correr npm start: el proceso muere con stack crudo ERR_SQLITE_ERROR 26 file is not a database apuntando a src/lab.js:48 (QA-crash.txt). No es crash silencioso y ningun input HTTP puede corromper la DB, pero el plan exige reseed y log claro, no hay test del caso, y un visitante no puede diagnosticar borrar data/breachlab.db desde ese stack. Fix sugerido (~10 lineas + 1 test): try/catch alrededor del primer db.exec, cerrar, borrar el archivo, recrear con log [breachlab] DB corrupta - recreando. **RESUELTO 2026-11-15, commit a1d0e97**: openDb() en src/lab.js hace close + rmSync + reseed con log "[breachlab] DB corrupta, recreando… (file is not a database)"; test nuevo del caso (37/37) y smoke funcional con npm start + bytes basura → proceso vivo, health ok seed 12 (evidence rework-QA-suite.txt, rework-QA-smoke.txt).

BAJOS:

L-3 - Panel renderiza datos de requests con innerHTML (public/panel.js: audit li linea 106-108, timeline 56-57, feed 41-43). XSS almacenado teorico via endpoint y key_masked. Mitigado en la practica y VERIFICADO por QA: el parser HTTP de Node (llhttp) rechaza caracteres de tag crudos en la request line (probe con img-src-x-onerror devolvio 400, nunca llega a Express); originalUrl queda percent-encoded; la mascara 4+...+4 no puede formar un tag ejecutable. Riesgo residual ~nulo (loopback, sin cookies ni sesion). Fix barato de defense-in-depth: textContent en vez de innerHTML. **RESUELTO 2026-11-15, commit a1d0e97**: los 3 spots (feed, timeline, audit) renderizan con createElement/append/textContent; cero innerHTML con datos de requests en public/panel.js (sin test nuevo, como se acordó para defense-in-depth).

L-4 - Precedencia rate-limit sobre auth no esta explicitada en la tabla 2.5 del plan: con la ventana saturada, una key revocada o disabled recibe 429 (no 401/403). Consistente con la cadena documentada rateLimit-then-apikey (seccion 2.1) y con NFR-5. Documental, sin fix de codigo.

L-5 - npm run scan:secrets depende de gitleaks en PATH: en esta maquina falla (gitleaks no persiste, ya registrado en factory/learnings.md L-01); ejecutado por ruta absoluta da 0 findings. Solo afecta el gate de fabrica, nunca al visitante.

L-6 - Mojibake cosmetico en audit key_masked cuando la key presentada trae bytes no-UTF8 (k-ca...niAE). Solo visual, sandbox.

## Rounds de rework

Obligatorios para SHIP: 0 (no hay criticos ni altos).
Recomendado antes o inmediatamente despues de G2 (1 round dev, ~30 min): M-1 (1 linea) + M-2 (10 lineas + 1 test). Opcional: L-3 (textContent).

## Veredicto final: SHIP

- Suite 36/36 desde instalacion limpia; walkthrough completo 14.5 s contra gate 300 s; deteccion exacta en hit 31 (~8 s); re-ataque 100 por ciento rebotado con 0 basura y audit completo.
- Sandbox cerrado: listener solo 127.0.0.1, 0 sockets externos durante ataque, unico cliente saliente con URL loopback constante.
- 0 secrets reales (gitleaks), 0 vulns (npm audit), 0 internals en errores, validacion de frontera 100 por ciento bajo fuzz propio.
- NFRs: 8 VERDE, 1 AMARILLO (NFR-9: umbral cumplido, comando faltante), 1 ROJO a letra (NFR-10: crash ruidoso sin reseed, condicion no alcanzable por red).

Riesgo residual (BAJO): (1) visitante que corrompa manualmente data/ ve un stack crudo, recuperacion obvia para dev pero no para visitante (M-2); (2) superficie XSS teorica en panel cerrada por el parser HTTP de Node, no por sanitizacion propia del panel (L-3); (3) cobertura sin gate ejecutable hasta agregar el script (M-1). Ninguno afecta la demo, el aislamiento ni la narrativa de venta.

Nodos: N-0001, N-0002, N-0003, N-0004 pasan a verified (verificacion independiente QA con evidencia brain/evidence/QA-NN.txt).
