# D-0007: Cierre de deuda menor V2 — semántica del detector, export a prueba de pipes y respuestas de switch honestas

Date: 2026-11-15
Reversibility: easy

## Context
QA V1/V2 dejó 5 hallazgos menores abiertos (L-6, L-8, L-9, L-10, L-11), ninguno
alcanzable por el flujo del producto (panel/bot) y todos con fix de pocas líneas. El
Negocio delegó ("cerrá todo") y este ADR registra las dos decisiones de PRODUCTO que
eso implicó (L-8 y L-9 eran opciones de comportamiento, no bugs unívocos); L-10 y L-11
son fixes mecánicos sin decisión semántica y L-6 es cosmética de archivos.

## Decision
1. **L-9 — el detector de anomalías cuenta SOLO intentos de escritura (POST).**
   `recordHit` corre únicamente si `req.method !== 'GET'` (src/apikey.js). Un flood de
   GETs legítimos ya no dispara la alerta ni degrada el acto (repro QA V1: acto 5→3 con
   35 GETs). Los GETs siguen autenticándose y respondiendo igual — solo dejan de
   alimentar la ventana móvil de detección. Fundamento pedagógico: el relato del
   incidente es sobre ESCRITURAS abusivas (la basura en la DB); leer mucho es ruido de
   un cliente legítimo, no el ataque que el lab narra.
2. **L-8 — el panel se rearma solo ante resets externos comparando `epoch`.** La epoch
   ya existía en el estado runtime (fix M-3 de QA V1); ahora sale en `GET /api/lab/state`
   (`state.epoch`) y `public/panel.js` la compara entre polls: si cambia (reset o cambio
   de vector disparado por curl u otra pestaña), rearma los cursores de timeline/audit
   (`since=0`) y limpia banner/feed — sin esperar su propio click.
3. **L-10 — el export markdown escapa `|` en toda celda con datos variables**
   (`\|`): `message` del timeline; `key_masked`, `endpoint` y `reason` del audit.
   Un loopback adversarial ya no puede partir las filas de la tabla de evidencia.
4. **L-11 — `POST /api/lab/scenarios/:id` responde el scenarioId EFECTIVO**
   post-reset (`lab.state.scenarioId` leído tras el `fullReset`), no el pedido: con
   switches concurrentes ambas respuestas nombran al ganador, nunca un vector huérfano.
5. **L-6 — re-encode de los nodos N-0001..N-0004**: el mojibake era UTF-8 interpretado
   como Windows-1252 (no latin1); reversa byte a byte con mapa cp1252 + validación
   (sin U+FFFD, solo caracteres razonables) antes de escribir. Una secuencia truncada
   en N-0002 ("2xx â el daño") se restauró a em-dash por contexto inequívoco.

## Alternatives considered
- L-9 "no degradar el acto si ya está en 4/5" (sugerencia original de QA V1): rejected —
  parchea el síntoma (post-hardening) y deja el falso positivo abierto en actos 1-4;
  contar solo escrituras elimina la clase entera de ruido.
- L-9 distinguir por endpoint además de por método: rejected — flexibilidad no pedida;
  el único endpoint de lectura del lab es GET /api/entries.
- L-8 rearme por omisión de ids (ver ids retroceder): rejected — frágil (un cursor en 0
  ya "ve" ids desde 1); la epoch ya existía y es explícita.
- L-10 sanitizar en la capa de audit (al escribir la fila): rejected — mutaría la
  evidencia cruda; escapar en la presentación del export preserva el dato original.

## Consecuencias
- Dos aceleradores de test que cruzaban el umbral con GETs pasaron a POSTs
  (test/attack.test.js AC3, test/firewall.test.js AC1) — el detector ya no los contaría.
- Suite 57/57 (52 + 5 nuevos en test/debt-closure.test.js: L-9×2, L-10, L-11, L-8).
- El validador del kit pasa VALID por primera vez desde V2 (el mojibake rompía el
  frontmatter de N-0001..4: "acceptance_criteria empty"); quedan solo WARNs de longitud
  pre-existentes.
- Todo revertible con diffs de 1-5 líneas por hallazgo (easy).
