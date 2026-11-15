# Spec — BreachLab

Fecha: 2026-11-14 · PO: fábrica NSDD · Fuente: `factory/intake.md` (requerimiento literal + decisiones del Negocio)

## Visión

BreachLab es un lab interactivo 100% local que representa, en primera persona, un incidente de seguridad real: una API key filtrada que un atacante usa para consumir endpoints y llenar la base de datos de basura. El visitante lo vive en cinco actos — normal, ataque, detección, matafuegos, hardening — y termina viendo el ataque rebotar. Es la pieza central de un porfolio personal: una demostración profesional de respuesta rápida y endurecimiento firme, no un tutorial.

## Problema y usuarios

**Problema.** Los incidentes de seguridad se explican mal en abstracto: "se filtró una API key" no transmite qué pasa ni cómo se corta. El dueño del porfolio necesita demostrar criterio profesional de seguridad (detección, respuesta, hardening) de forma memorable y verificable.

**Usuarios.**
1. **Reclutador / peer** (audiencia principal): debe entender la historia en <5 minutos, sin setup previo, idealmente sin correr nada.
2. **Dueño del porfolio**: debe poder correr la demo y narrarla en una entrevista con la menor fricción posible.

## Historia del incidente simulado (el producto ES esta narrativa)

La demo cuenta un único incidente en cinco actos. Cada acto es un estado observable del lab:

1. **Normal.** La API víctima opera con tráfico legítimo; el panel muestra health OK, DB con datos de seed y un timeline de eventos normales. El visitante puede ver dónde se "filtró" la API key (archivo de configuración versionado simulado, con key falsa visible): la bomba ya está plantada.
2. **Ataque.** El visitante dispara el bot atacante (simulado dentro del proceso, nunca red externa). El bot usa la key filtrada para consumir endpoints en ráfaga y escribir registros basura. El panel muestra en vivo cómo crecen requests anómalos y basura en DB.
3. **Detección.** El volumen cruza el umbral de anomalía; el timeline registra alerta roja con hora y motivo. El visitante ve el sistema degradado en tiempo real.
4. **Matafuegos (respuesta rápida).** El visitante aplica, en caliente: **kill switch** (corta el acceso ya), **rotación de key** (la key vieja muere: 401), **rate limit** (las ráfagas reciben 429). Cada acción tiene efecto inmediato y visible, y queda registrada en el timeline.
5. **Hardening (firme a futuro).** Con el incidente contenido, el visitante activa el modo hardening: keys hasheadas en DB, scopes por endpoint, audit log de intentos. Re-dispara el ataque: rebota (401/403), la DB queda limpia, cada intento bloqueado queda auditado. Cierra leyendo el postmortem en inglés con la cronología completa.

## Alcance MVP (V0)

- Lab local con: API vulnerable por diseño, panel del defensor, bot atacante simulado, timeline cronológico.
- Los 5 actos completos: normal → ataque → detección → matafuegos (kill switch + rotación + rate limit) → hardening (hash + scopes + audit log) → re-ataque rebota.
- README bilingüe + postmortem en inglés.
- Corre con 2 comandos en Windows (máquina del Negocio), portable a Linux/Mac.

Detalle por historia: `factory/backlog.md` (H-01..H-04). Nodos: N-0001..N-0004.

## Fuera de alcance (explícito)

- Auth de usuarios real del porfolio (login/registro).
- Deploy a producción / hosting público.
- Métricas reales de negocio.
- i18n framework completo (ver estrategia bilingüe: cero infraestructura).
- Ataques con herramientas reales de pentesting o a hosts reales/terceros.
- Multiusuario / multi-tenant.
- Modo guiado y escenarios extra → V1/V2 (ver `factory/roadmap.md`).

## Constraints del sandbox (no negociables, del Negocio)

- Simulación 100% local: cero llamadas de red a terceros durante cualquier corrida.
- Keys 100% falsas; cero secrets reales en el repo (DoD).
- La API es vulnerable POR DISEÑO y aislada: la "vulnerabilidad" no debe ser explotable fuera del sandbox de la demo.
- El bot atacante vive dentro del proceso; no hay atacante externo.

## Estrategia bilingüe (propuesta PO — alcance chico, sin framework)

- **UI del panel: español**, con términos técnicos en inglés tal como los usa la industria (API key, kill switch, rate limit, hardening, audit log, scope). Textos fijos, sin capa de i18n.
- **Documentación: inglés.** `README.md` y el postmortem en EN (audiencia internacional del porfolio), con un `README.es.md` espejo breve y links cruzados ES↔EN.
- Justificación: el dueño narra en español en entrevistas; el reclutador global lee el inglés entero. Un idioma por superficie, costo de mantenimiento ~cero.

## Stack

Node.js + Express + SQLite es **SUGERENCIA** del intake. La decisión técnica es del Tech Lead, que puede contraproponer con ADR. La spec no fija stack: fija comportamiento observable.

## Supuestos asumidos (reversibles, registrados)

1. El visitante tiene Node.js LTS instalado (los "2 comandos" lo asumen).
2. UI en español + docs en inglés cubre a ambas audiencias (negocio decidió bilingüe de alcance chico).
3. La DB local puede resetearse entre corridas; no hay estado que preservar entre sesiones.
4. Un solo vector de filtración en MVP (key en config versionizada simulada); más vectores en V2.
5. El atacante simulado in-process basta; no se simulan atacantes humanos reales.

## Riesgos de negocio

| # | Riesgo | Impacto | Mitigación |
|---|--------|---------|------------|
| R1 | La demo se percibe (o es) un riesgo real → daña la imagen del porfolio | Alto | Constraints del sandbox como DoD + escaneo de secrets como AC (H-01) |
| R2 | Narrativa confusa → el reclutador abandona antes de 5 minutos | Alto | Actos con nombre claro + timeline siempre visible; modo guiado en V1 |
| R3 | Scope creep hacia auth/deploy/métricas/i18n full | Medio | Fuera de alcance explícito arriba; gate del PO |
| R4 | La demo deja de correr en el futuro (deps/Node deprecados) | Medio | Dependencias mínimas; SQLite file-based sin servicios |

## Métricas de éxito observables

1. En una máquina con Node LTS: 2 comandos (install + start) → panel accesible en localhost, sin config extra ni variables de entorno.
2. El ciclo completo del incidente (5 actos) se ejecuta en una sesión de ≤5 min siguiendo solo el panel y el README.
3. Cero requests a hosts externos durante toda la sesión (verificable inspeccionando la red del sandbox).
4. Escaneo de secrets sobre el repo: 0 secrets reales.
5. Con hardening activo, el re-ataque produce 0 escrituras maliciosas: todos los intentos rebotan (401/403) y quedan en el audit log.
