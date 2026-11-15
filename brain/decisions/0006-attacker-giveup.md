# D-0006: Rendición del atacante + escenarios finitos

Date: 2026-11-15
Reversibility: easy

## Context
Feedback del Negocio en la review G3 (V1 aprobada con ajustes — este es el ajuste): el bot
atacante era un loop sin fin. Con el escenario 2 "sigue enviando peticiones que dan error,
no frenan ni hay botón para frenar", y con la amenaza principal "aunque hagas kill switch y
cambio de key, sigue tirando peticiones sin parar". La ausencia de fin quitaba narrativa y
dejaba basura de requests corriendo durante la demo. Refina la línea "No se detiene solo"
de D-0004 (bot), que queda acotada abajo.

## Decision
1. **Ráfaga finita del escenario 2 (`SCENARIO_BURST = 10`)**: `POST /api/lab/scenario/scopeless-key`
   responde 202 con `requests_planned: 10`; el bot lanza exactamente 10 requests y se detiene
   solo. Evento de cierre en timeline: `Escenario 2 completado · 10 intentos · 10 rechazados
   (403 insufficient_scope) · 0 escrituras`.
2. **Rendición del bot general (`BOT_GIVEUP_STREAK = 20`)**: tras 20 rebotes consecutivos
   (401/403/429 — cualquier respuesta no-2xx) el bot se detiene solo y emite
   `El atacante dejó de intentar (20 rebotes consecutivos) · N bloqueados en total`.
   La racha se resetea con cualquier 2xx: durante el ataque exitoso (201s) NUNCA se rinde —
   la AC1 de N-0002 ("no se detiene solo") queda intacta para la fase de ataque.
3. **Panel explícito**: mientras corre con rebotes, estado visible "El atacante sigue
   probando — todo rebota (N bloqueados)" + nota pedagógica (el atacante no sabe que su
   key murió — sigue probando y rebota; es intencional). El botón de detener queda
   habilitado mientras `attack.running` (ataque o escenario). Textos del escenario aclaran
   la ráfaga de 10.

Constantes exportadas desde `src/attacker.js`. 20 rebotes a 4 req/s ≈ 5 s de feed —
suficiente para la demo del acto 5.

## Alternatives considered
- Dejar el loop infinito (status quo): rechazado — feedback explícito del Negocio (UX).
- Botón/endpoint "detener escenario" separado: innecesario — el botón de detener existente
  ya cubre cualquier corrida vía `attack.running`; la ráfaga además se frena sola.
- Rendirse solo con 401/403 (excluir 429 de la racha): rechazado — el contrato G3 fija
  401/403/4 como rebote. Nota operativa: con rate limit ON y ventana saturada, el re-ataque
  puede rendirse con pocos rebotes auditados (el 429 corta antes de la auth y no audita);
  re-aplicar rate limit limpia ventanas y restaura el relato "todo rebote queda auditado".
- Rendición por tiempo: peor que por racha — la racha codifica "nada de lo que probé
  funcionó", que es la semántica pedagógica.

## Consecuencias
- `test/e2e.test.js` acto 5 se actualizó: el re-ataque ahora termina por rendición (el test
  asumía el loop infinito); re-aplica rate limit antes (ventanas limpias → rebotes auditados).
- D-0004 queda refindada en su línea del bot: "no se detiene solo" vale mientras la API
  responda 2xx; con todo rebotando, se rinde a los 20 consecutivos.
- Los tests existentes que frenan al bot manualmente antes del rebote 20 no cambian.
