# Backlog — BreachLab

Fuente: `factory/spec.md` · AC completos (dado/cuando/entonces) en los nodos `brain/nodes/N-XXXX.md` — la tabla usa la versión corta.

| ID | Historia | Criterios de aceptación observables | Valor | Tamaño |
|----|----------|-------------------------------------|-------|--------|
| H-01 | Como visitante del porfolio quiero abrir un lab local que muestre la API en operación normal —con su key ya "filtrada" visible— para tener el contexto del incidente antes de que estalle | - [ ] 2 comandos → panel en localhost, sin config extra ni env vars<br>- [ ] Estado normal visible: health OK, DB con seed (cantidad fija), 0 eventos de seguridad<br>- [ ] Timeline con eventos normales cronológicos con hora<br>- [ ] El leak es visible: dónde se filtró la key (config versionada simulada) con key falsa<br>- [ ] Cero llamadas de red a hosts externos en cualquier corrida<br>- [ ] Escaneo de secrets: 0 reales, solo keys falsas documentadas<br>- [ ] README.md (EN) y README.es.md (ES) explican qué es y cómo correr en ≤2 comandos | Alto | M |
| H-02 | Como visitante quiero disparar el ataque simulado y ver la DB llenarse de basura con alertas en vivo para entender el impacto real de una key filtrada | - [ ] "Simular ataque" → bot in-process consume endpoints con la key filtrada, no se detiene solo<br>- [ ] Panel en vivo: crecen requests anómalos y registros basura en DB<br>- [ ] Al cruzar el umbral de anomalía → alerta roja en timeline con hora y motivo<br>- [ ] Detener manualmente → bot se detiene y la basura queda persistida (estado degradado) | Alto | M |
| H-03 | Como visitante quiero aplicar matafuegos (kill switch, rotación, rate limit) y ver su efecto inmediato para aprender cómo se corta un incidente en caliente | - [ ] Kill switch → el bot deja de consumir (contadores dejan de crecer) + evento en timeline<br>- [ ] Rotación de key → la key anterior muere: requests con ella reciben 401 (visible en feed)<br>- [ ] Rate limit → ráfagas reciben 429, throughput acotado al límite (visible en feed)<br>- [ ] Cada matafuego queda registrado en timeline con su efecto | Alto | M |
| H-04 | Como visitante quiero activar hardening, ver el re-ataque rebotar y leer el postmortem para entender la mitigación firme a futuro | - [ ] Activar hardening → DB muestra la key como hash (no texto plano) y los endpoints exigen scope<br>- [ ] Re-ataque con la key vieja → todos los intentos rebotan (401/403), 0 registros basura nuevos<br>- [ ] Audit log: cada intento bloqueado con hora, key enmascarada, endpoint y motivo<br>- [ ] Postmortem EN legible: cronología completa, impacto y mitigaciones por fase<br>- [ ] Estado final refleja recuperación: sin crecimiento de basura, alertas resueltas | Alto | L |

=== CORTE MVP ===

| ID | Historia | Criterios de aceptación observables | Valor | Tamaño |
|----|----------|-------------------------------------|-------|--------|
| H-05 | Como dueño del porfolio quiero un modo guiado y un reinicio del incidente para narrar la demo sin fricción en una entrevista | - [ ] Modo guiado: pasos numerados con el siguiente resaltado<br>- [ ] Completar un paso → el resaltado avanza y confirma el paso hecho<br>- [ ] "Reiniciar incidente" → seed restaurado y timeline limpio sin reiniciar el proceso | Medio | S |
| H-06 | Como visitante quiero un segundo escenario (key válida sin scope) para ver defensa en profundidad más allá de rotar keys | - [ ] Escenario "key válida sin scope": key auténtica sin permisos de escritura → intentos de escritura reciben 403<br>- [ ] Audit log registra los rechazos con motivo "scope insuficiente"; DB queda limpia<br>- [ ] El panel conecta el resultado con el principio de mínimo privilegio | Medio | S |
| H-07 | Como dueño quiero más vectores de filtración como escenarios elegibles para que BreachLab crezca de demo a serie de labs | - [ ] El visitante puede elegir el escenario desde el panel<br>- [ ] Cada escenario nuevo corre el ciclo completo (ataque→detección→respuesta→hardening) con narración propia | Medio | L |
| H-08 | Como visitante quiero exportar la evidencia del incidente para compartir la cronología sin que el otro corra nada | - [ ] "Exportar evidencia" → archivo local legible (timeline + audit log + resumen del postmortem), sin salir del sandbox<br>- [ ] Un tercero que abre el archivo reconstruye la cronología sin correr la demo | Bajo | S |

## Dependencias

- H-01 → ninguna (fundación).
- H-02 → H-01 (necesita API viva, panel y key "filtrada").
- H-03 → H-02 (los matafuegos actúan sobre un ataque en curso).
- H-04 → H-03 (el hardening se activa con el incidente contenido).
- H-05, H-06 → V0 completo (H-01..H-04).
- H-07 → H-05 (los escenarios nuevos necesitan selección/reinicio).
- H-08 → H-04 (necesita audit log y postmortem).
