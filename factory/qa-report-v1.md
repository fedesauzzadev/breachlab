# QA Report - BreachLab DELTA V1 / S08 (gate incremento, review G3)

QA adversarial de fabrica - 2026-11-15 - Build: commit e027e82 (S08, working tree limpio) - Node v24.19.0 - Windows
Alcance: DELTA V1 unicamente (modo guiado + hitos, POST /api/lab/reset, escenario scopeless-key, wiring S08). El gate SHIP del MVP/V0 ya esta cerrado en factory/qa-report.md y NO se repite; L-4/L-5/L-6 siguen abiertos y se re-verificaron solo lo pertinente.
Metodo: suite desde instalacion limpia + fuzz propio de los endpoints nuevos + ataques de concurrencia contra el reset (socket crudo + spray) + interacciones de estado + regresion MVP + NFRs afectados.
Evidencias: brain/evidence/QA-v1-suite.txt, QA-v1-fuzz.txt, QA-v1-reset-race.txt, QA-v1-perf-assets.txt, QA-v1-nfr.txt. QA NO modifico codigo de producto.

## Resumen ejecutivo

VERDICTO: SHIP. 0 criticos, 2 medios, 3 bajos nuevos. El delta hace lo que prometen N-0005/N-0006 en todos los caminos del producto: hitos avanzando acto a acto, reset que restaura el seed exacto SIN reiniciar el proceso (verificado 5 corridas: ataque plano x3, incidente completo endurecido, y escenario 2 con bot corriendo), escenario 2 rebotando 403 insufficient_scope con audit y DB limpia, e interacciones rotacion/doble-disparo sin estados rotos. La suite da 42/42 desde instalacion limpia (98.05% lineas) y la regresion del MVP esta intacta. El hallazgo mas serio (M-3) es una carrera TOCTOU del reset que NO es alcanzable por el flujo del producto (bot frenado + panel no escribe entries): exige un cliente loopback adversarial con socket crudo; el estado resultante queda valido pero con una fila extra disfrazada de legit. Fix estimado ~5 lineas para el proximo round.

## 1. Suite completa (instalacion limpia)

Comando: Remove node_modules -> npm ci -> npm test -> npm run test:coverage -> npm audit --omit=dev.
- npm ci: found 0 vulnerabilities.
- npm test: tests 42, pass 42, fail 0, duration 20173 ms (37 previos V0 intactos + 5 nuevos/subtests s08).
- cobertura: all files 98.05% lineas / 93.37% branch / 96.36% funcs (umbral plan >=70%: VERDE; script M-1 resuelto sigue funcionando).
- npm audit --omit=dev: 0 vulnerabilidades.
Evidencia: QA-v1-suite.txt. VERDE.

## 2. Fuzz / edges del delta

Comando: probe node propio contra npm start (PORT=3199) - cuerpos JSON invalidos, metodos, traversal, unicode, 10KB, sin content-type. Evidencia: QA-v1-fuzz.txt + QA-v1-reset-race.txt.
- /api/lab/reset con body basura (campo extra, array, string, numero, boolean, null, JSON roto, 10KB, unicode hostil, deep): 100% -> 400 invalid_request. Metodos GET/PUT/PATCH/DELETE -> 404. Query hostil ignorado. Proceso vivo.
- /api/lab/scenario/scopeless-key: mismo fuzz -> 400; sin hardening -> 400; escenario desconocido y path traversal %-encoded -> 404 not_found.
- EXCEPCION (L-7): reset sin content-type (raw 'garbage-not-json') o con text/plain -> 200: el reset destructivo se ejecuta tratando el body como vacio. Patron heredado de rotate-key (S04), pero el reset es nuevo y destructivo.
- Reset DURANTE ataque activo (bot corriendo, sin hardening) x3: LIMPIO inmediato y estable a +2s (act1, 12/0, 6 eventos seed, audit 0, flags/milestones/storage/mask en seed). El settle de 350 ms frena al bot y cubre sus POST en vuelo.
- Reset DURANTE hardening + escenario 2 con bot corriendo: LIMPIO inmediato y a +2.5s. El bot no sigue con key muerta: attacker.reset() lo frena antes del re-seed y fire() descarta respuestas tardias (running false). Sin saturacion de audit/timeline.
- M-3 (Medio) TOCTOU del reset, DOS reproducciones:
  (a) deterministica: socket crudo TCP manda POST /api/entries con headers completos (x-api-key del leak, content-length exacto) y solo 10 bytes del body. apikey autentica AL LLEGAR HEADERS (corre antes de express.json del router entries); POST /api/lab/reset completa 200; al completar el body el insert aterriza en la DB re-seedeada -> HTTP/1.1 201 Created, fila {"id":13,"kind":"legit","title":"QA-RACE-TRICKLE"}, health queda en 13 entries con act=1 (contrato: 12).
  (b) probabilistica: spray de 120 POSTs validos cada 8 ms alrededor del reset -> 5 markers emitidos ANTES de la respuesta del reset sobreviven como kind=legit (~5% de la rafaga pre-respuesta, por cola de procesamiento).
  Causa: la autenticacion y el insert no son atomicos respecto del reset; el settle de 350 ms solo cubre POSTs del bot ya emitidos, no clientes con body retrasado. Impacto real acotado: consola del lab sin auth por diseño (loopback), el flujo del producto nunca dispara esto (bot frenado, panel no emite POSTs de entries), y el estado resultante es valido (una fila extra). Fix sugerido ~5 lineas: epoch/generacion - el middleware estampa req.authEpoch=lab.state.epoch y el handler de entries rechaza (p.ej. 409) si difiere del actual; +1 test con socket crudo.
- Escenario scopeless disparado dos veces (stop entre disparos): 202 ambas, keys distintas, ambas conviven activas en audit; post-reset LIMPIO. Sanas.
- Milestones tras reset: cursores rearmados - los 5 hitos vuelven a false y avanzan de nuevo en la re-demo (suite + P5). El timeline re-narrado contiene exactamente los 6 eventos seed (system + 5 traffic), sin alertas/audit/flags residuos.
- Key sin scope tras rotacion (interaccion): rotar con el escenario corriendo revoca tambien la key del escenario -> el bot pasa de 403 insufficient_scope a 401 invalid_api_key, auditado, garbage=0, sin crash. Consistente con "rotacion revoca TODAS las active".

## 3. Regresion del MVP (5 actos tras el wiring S08)

- Suite: los 37 tests V0 (lab, attack, firewall, hardening, e2e de los 5 actos incluido re-ataque 100% rebotado) pasan intactos tras attacker.start(key) y el 4to parametro de server.js.
- Walk HTTP real: ataque -> deteccion (act 3) -> kill/rotate/rate -> hardening (act 5, milestones 4 true) -> escenario/re-ataque rebotado. /leak/config.json 200, /docs/postmortem.md 200, bot normal escribe basura (reqs=11/garbage=11), POST /api/entries con key original 201.
- Re-jugable: tras reset el bot re-numera desde SPAM-1 y la basura vuelve a crecer.
Evidencia: QA-v1-reset-race.txt, QA-v1-perf-assets.txt. VERDE.

## 4. NFRs afectados

- NFR-1 (validacion endpoints nuevos): VERDE con excepcion L-7 (bodies no-JSON aceptados como vacios en reset/escenario; 100% de JSON invalido -> 400; proceso vivo).
- NFR-2 (secrets): gitleaks por ruta absoluta (L-05): scanned ~319387 bytes, no leaks found, exit 0. Prefijo sk_breachlab_demo_ cubre las keys SCOPELESS del escenario (solo existen en memoria/DB gitignored). VERDE.
- NFR-3 (aislamiento): grep de clientes HTTP server-side: unico fetch de producto sigue siendo src/attacker.js:47 con URL loopback constante; el delta no agrego IO saliente; bind 127.0.0.1 intacto. VERDE.
- NFR-7 colateral: p95 GET /api/lab/state (ahora con milestones) = 17.2 ms / 60 samples (umbral 200 ms). VERDE.

## 5. Consistencia de narrativa tras reset

Verificado 5 resets en 3 escenarios distintos (P4 x3 ataque plano, P5 incidente completo + escenario corriendo, P3 doble escenario): timeline queda en exactamente los 6 eventos seed, audit 0, flags false, milestones todos false, storage plaintext, key original activa con su mask, act 1, health 12. Sin residuos de audit viejo ni alertas. Dos fugas de narrativa acotadas:
- L-8: los ids del timeline/audit vuelven a 1; un consumidor con cursor pre-reset que no rearme (reset disparado fuera del panel, p.ej. curl u otra tab) ve el timeline congelado (?since=6 -> 0 eventos). El panel rearma SOLO en su propio click de reset.
- M-3 (ya descripto): escritura pre-reset que aterriza post-reseed aparece como fila legit extra - rompe el "12 exactos" del acto 1.

## 6. DoD

- README EN/ES: NO mienten (describen V0 correctamente y la demo corre igual), pero 0 menciones de modo guiado / reinicio / escenario 2 / V1.
- CHANGELOG.md: ultima entrada 0.1.0 (V0). SIN entrada S08/V1. package.json version 0.1.0 sin bump.
- -> M-4: para vender el incremento en G3 falta version (0.2.0) + entrada de changelog + mencion breve de las 3 features nuevas en los READMEs (~15 min de dev).
- LICENSE MIT intacto; 0 TODO/FIXME reales (4 matches = palabra "todo" en espanol).

## Hallazgos por severidad

Criticos: 0.

MEDIOS:
- M-3 - TOCTOU en POST /api/lab/reset: requests autenticados antes del reset aterrizan despues del re-seed (auth por headers, insert por body; el settle de 350 ms no cubre clientes de body lento/colado). Repro deterministica con socket crudo (201 Created + fila legit id 13 + health 13 en act 1) y probabilistica con spray (5/92 markers). No alcanzable por el flujo del producto; estado resultante valido pero incumple "seed restaurado exacto". Fix ~5 lineas (epoch check en el handler de entries) + test. Evidencia: QA-v1-reset-race.txt P6/P6b.
- M-4 - DoD del incremento: CHANGELOG sin entrada V1, version sin bump (0.1.0), READMEs sin mencionar modo guiado/reset/escenario 2. No mienten, pero el incremento no es vendible como version. Fix ~15 min.

BAJOS:
- L-7 - /api/lab/reset y /scenario/scopeless-key aceptan bodies sin content-type o text/plain como "vacio" (reset destructivo ejecuta 200 con body raw no-JSON). Patron heredado de rotate-key; NFR-1 a la letra pide validar tipo en todo POST. Fix: rechazar content-type != application/json.
- L-8 - Timeline/audit congelado para consumidores que no rearmen cursores tras un reset externo (ids vuelven a 1; ?since=6 -> 0). El panel rearma solo en su propio click. Fix opcional: epoch de reset en /state y rearme automatico del panel al verlo cambiar.
- L-9 - (pre-existing S03, fuera del delta) recordHit baja act de 5 a 3 ante flood de 35 GETs validos sin rate limit (verificado: act=5 -> 35 GETs -> act=3 + alerta post-hardening). Solo alcanzable con flood manual deliberado. Fix opcional: no degradar act si act >= 4.

Abiertos del V0 (re-verificados): L-4 documental sin cambio; L-5 gitleaks sigue fuera de PATH (gate corrido por ruta absoluta, exit 0); L-6 mojibake cosmetico sin cambio.

## Veredicto por nodo

- N-0005 (modo guiado + reset): PASS. AC1/AC2 verificadas (hitos por /state acto a acto + render del panel verificado en codigo/DOM ids 4/4, .next/.done sobre milestones puros); AC3 verificada 5 corridas (seed exacto, proceso vivo, mismo puerto) con la salvedad M-3 fuera del flujo del producto. QA marca verified.
- N-0006 (escenario key sin scope): PASS. AC1 (202 + 403 100% auditados insufficient_scope), AC2 (audit con motivo exacto, garbage 0), AC3 (narracion de minimo privilegio en panel, boton gated por hardening+ataque detenido). Interacciones rotacion/doble disparo/doble disparo sane. QA marca verified.

## Veredicto final: SHIP (para el incremento V1, gate G3)

- Suite 42/42 desde instalacion limpia, cobertura 98.05%, 0 vulns, 0 secrets, aislamiento intacto, p95 17.2 ms.
- Reset consistente en TODOS los caminos del producto (5/5 corridas limpias, incluido con bot de escenario activo); re-jugable de punta a punta.
- Escenario 2 cumple las 3 AC con audit y DB limpia; la narrativa guiada re-narra sin residuos.
- 0 criticos. M-3 (TOCTOU) no es alcanzable por la demo ni por el panel, deja estado valido, y tiene fix de ~5 lineas; M-4 es documental. Ninguno bloquea G3, ambos deberian entrar al primer round de dev post-review.

Riesgo residual (BAJO): (1) un cliente loopback adversarial puede inyectar una fila legit extra a traves de un reset concurrente (M-3); (2) el incremento V1 no existe para quien lea README/CHANGELOG (M-4); (3) reset externo al panel congela el timeline hasta superar el cursor viejo (L-8).
