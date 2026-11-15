# Plan Técnico — BreachLab

TL: fábrica NSDD · Fecha: 2026-11-14 · Entradas: `factory/intake.md`, `factory/spec.md`, `factory/backlog.md`, `factory/roadmap.md`, `brain/nodes/N-0001..N-0004.md`, `references/security.md`.

**Estado: G1 CERRADO** — plan ejecutable por `factory/dev` sin decisiones abiertas. Ver checklist G1 al final.

---

## 1. Stack (decisión del TL — ADR D-0002)

El intake **sugiere** Node.js + Express + SQLite. Evaluado costo/velocidad/mantenibilidad → **se acepta la sugerencia con un ajuste**: SQLite vía `node:sqlite` (módulo nativo de Node, estable desde Node 24), no `better-sqlite3`.

| Capa | Elección | Por qué |
|---|---|---|
| Runtime | Node.js ≥ 24 LTS (`engines` en package.json) | Ya registrado como supuesto (D-0001). Verificado local: v24.19.0. |
| HTTP | **Express** (única dependencia de runtime) | Estándar de la industria, pedagógico para mostrar middleware (auth, rate limit), sugerido por el intake. |
| DB | **`node:sqlite`** (`DatabaseSync`) | Cero dependencias nativas → `npm install` nunca compila nada → el objetivo "2 comandos sin fricción" queda blindado (riesgo R4). File-based, portable Win/Linux/Mac. |
| Panel | HTML/CSS/JS vanilla servido por Express (sin build step, sin framework) | La UI es un panel de observación con polling; React/Vite agregarían ~400 paquetes para cero valor del MVP. |
| Tests | `node:test` + `fetch` nativo (cero devDependencies) | Suite de integración HTTP real contra servidor efímero en loopback. |
| Secrets scan | **gitleaks 8.30.1** (instalado y verificado vía winget en la máquina de fábrica; `brew install gitleaks` en Mac/Linux) | Estándar de facto, standalone, config versionada en el repo (`.gitleaks.toml`). |

Total de dependencias: **1 runtime (express), 0 dev**. Detalle y alternativas descartadas: `brain/decisions/0002-stack.md`.

## 2. Arquitectura

### 2.1 Vista de componentes y data flow de la simulación

Todo vive en **un solo proceso Node**. El bot atacante es in-process y ataca por **HTTP real a loopback** — así los 401/403/429 que ve el visitante son respuestas HTTP reales producidas por los middlewares, no efectos simulados en la UI.

```
┌─────────────────── proceso único: node server.js (bind 127.0.0.1:3000) ───────────────────┐
│                                                                                            │
│  PANEL DEFENSOR              API VÍCTIMA (Express)           SQLite ./data/breachlab.db   │
│  public/index.html   ──1s──▶ /api/lab/state · timeline       tablas: entries · events ·   │
│  public/panel.js     ─POST─▶ /api/lab/{attack,firewall,                audit · api_keys  │
│        │                      hardening}                                   ▲                │
│        │ leak view           /api/health · /api/entries (x-api-key)       │               │
│        ▼                            ▲                                      │               │
│  repo-sim/config.json  ────────────┘ middleware chain:                     │               │
│  (config "versionada" con        rateLimit → apikey → contador → handler ──┘               │
│   la key falsa = el leak)                                                                   │
│                                                                                             │
│  BOT ATACANTE src/attacker.js: setInterval 250ms ── HTTP ──▶ 127.0.0.1:3000/api/entries    │
│  header x-api-key: sk_breachlab_demo_LEAKED_7f3a9c (la key del repo-sim, falsa)            │
└────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ nada de esto sale de la máquina: bind loopback + URL del bot constante hardcodeada
```

Flujo del incidente: visitante pulsa "Simular ataque" → `POST /api/lab/attack` → bot arranca → cada request pasa por `rateLimit? → apikey → detector` → 201 escribe basura en `entries` (kind=garbage) → contador por key cruza umbral → evento `alert` severity critical en `events` → panel (polling 1s) pinta alerta roja y contadores creciendo → visitante aplica matafuegos → middlewares cambian de comportamiento → el feed del panel muestra los códigos 401/403/429 reales.

### 2.2 Aislamiento del sandbox (ADR D-0003)

1. **Bind exclusivo a `127.0.0.1`** — el server nunca escucha en 0.0.0.0; nada explotable desde otra máquina (constraint "vulnerable por diseño y AISLADA").
2. **Bot con URL constante hardcodeada** (`http://127.0.0.1:PORT/api`) — no configurable, no hay path de código que pueda apuntar afuera.
3. **Único cliente HTTP saliente del proceso es el bot** (verificable por grep: cero `fetch`/`net.connect` fuera de `src/attacker.js`; QA lo verifica, ver NFR-3).
4. Keys 100% falsas con prefijo propio `sk_breachlab_demo_` (allowlist explícita en `.gitleaks.toml`, marcadas FAKE BY DESIGN en el código y README).
5. `data/` (DB runtime) gitignored; se re-seedea al arrancar (supuesto #3 de la spec).

### 2.3 Estructura de carpetas

```
breachlab/
├── package.json            # scripts: start, test, scan:secrets
├── server.js               # bootstrap: express, static, routers, error handler, listen 127.0.0.1
├── src/
│   ├── lab.js              # node:sqlite: schema, seed (12 entries + 1 key), estado runtime (flags, contadores, umbral), eventos
│   ├── apikey.js           # middleware x-api-key: modo vulnerable (plaintext) vs hardened (sha256 + scope + kill switch)
│   ├── ratelimit.js        # middleware fixed-window por key (default 10 req / 10 s)
│   ├── attacker.js         # bot in-process (loop 250 ms, AbortSignal.timeout, URL loopback constante)
│   ├── entries.js          # router business GET/POST /api/entries (la "API víctima")
│   └── labroutes.js        # router /api/lab/*: state, timeline, attack, firewall/*, hardening, audit
├── public/
│   ├── index.html          # panel (UI ES, css embebido)
│   └── panel.js            # polling 1s, controles, feed de códigos
├── repo-sim/
│   └── config.json         # config "versionada" simulada CON la key falsa visible (el leak, servido read-only)
├── data/                   # runtime, gitignored (breachlab.db)
├── docs/
│   └── postmortem.md       # EN, cronología del incidente (S06)
├── test/                   # node:test: integración HTTP loopback efímero + unit
├── README.md · README.es.md · CHANGELOG.md · LICENSE · .gitleaks.toml · .gitignore
```

7 módulos de producto, ninguno > ~150 líneas. Sin capas extra: router → lab.js/db → respuesta. (Mínimo código que cumple; sin abstracciones tempranas.)

### 2.4 Contratos del MVP

**API víctima** (requiere header `x-api-key`):

| Método | Path | Request | Respuestas |
|---|---|---|---|
| GET | `/api/health` | — | 200 `{status:"ok", db_entries:N, act:1..5}` (sin key; es el health del panel) |
| GET | `/api/entries` | — | 200 `{entries:[{id,kind,title,body,created_at}], count}` |
| POST | `/api/entries` | `{title:1..80 chars, body:1..280 chars}` (sin campos extra) | 201 `{id}` · 400 `invalid_request` · 401 `invalid_api_key` (sin key / key muerta) · 403 `key_disabled` (kill switch) · 403 `insufficient_scope` (hardening) · 429 `rate_limited` + `Retry-After` |

**Consola del defensor** `/api/lab/*` (sin key — solo existe en loopback):

| Método | Path | Request | Respuesta |
|---|---|---|---|
| GET | `/api/lab/state` | — | 200: `{act, attack:{running,requests,blocked}, db:{legit,garbage}, flags:{killswitch,ratelimit,hardening,rotated}, keys:{leaked_masked,current_masked,storage:"plaintext"|"sha256"}, thresholds}` |
| GET | `/api/lab/timeline?since=<id>` | — | 200 `{events:[{id,ts,kind:traffic\|alert\|action\|system,severity,message}]}` |
| POST | `/api/lab/attack` | `{action:"start"\|"stop"}` | 202 `{running}` |
| POST | `/api/lab/firewall/kill-switch` | `{enabled:true}` | 200 `{killswitch:true}` + evento timeline |
| POST | `/api/lab/firewall/rotate-key` | `{}` | 200 `{new_key_masked}` + evento |
| POST | `/api/lab/firewall/rate-limit` | `{enabled:true, max?:1..1000, window_ms?:1000..600000}` (defaults 10/10000) | 200 + evento |
| POST | `/api/lab/hardening` | `{enabled:true}` | 200 + evento (S05) |
| GET | `/api/lab/audit?since=<id>` | — | 200 `{attempts:[{id,ts,key_masked,method,endpoint,status,reason}]}` (S05) |
| GET | `/leak/config.json` | — | 200 el archivo repo-sim servido read-only (la evidencia del leak) |

**Esquema SQLite** (todas las tablas con `id INTEGER PRIMARY KEY`):

- `entries(kind TEXT CHECK IN ('legit','garbage'), title TEXT, body TEXT, created_at TEXT ISO-8601)`
- `events(ts TEXT, kind TEXT, severity TEXT CHECK IN ('info','warning','critical','success'), message TEXT)`
- `audit(ts TEXT, key_masked TEXT, method TEXT, endpoint TEXT, status INTEGER, reason TEXT)` — solo se escribe con hardening activo
- `api_keys(label TEXT, key_plain TEXT NULL, key_hash TEXT NULL, scope TEXT NULL, status TEXT CHECK IN ('active','revoked','disabled'), created_at TEXT)` — exactamente 1 key en seed; `key_plain` es la mala práctica visible, hardening la migra a `key_hash`

### 2.5 Semántica del incidente (ADR D-0004 — números fijados, dev no decide)

| Palanca | Efecto observable | Código |
|---|---|---|
| **Bot** | ráfaga fija 4 req/s (interval 250 ms) contra POST /api/entries con payload basura `SPAM-<n>`; no se detiene solo | — |
| **Detección** | >30 requests de una misma key en ventana móvil de 10 s → 1 evento `alert` critical con hora, key enmascarada y motivo "anomalous volume". Cooldown 15 s entre alertas (no spamea el timeline) | — |
| **Kill switch** | la key comprometida pasa a `disabled`: cada request del bot | **403** `key_disabled` |
| **Rotación** | key vieja `revoked` → 401; se emite key nueva legítima (solo su máscara se muestra en el panel) | **401** `invalid_api_key` |
| **Rate limit** | 10 req / 10 s por key; exceso | **429** `rate_limited` + `Retry-After` |
| **Hardening** | `key_plain → sha256(key)` (columna plain en NULL), scope `write:entries` solo para la key legítima vigente; middleware pasa a comparar hash | POST sin scope → **403** `insufficient_scope`; key revocada → **401** |
| **Re-ataque** | bot re-disparado usa SIEMPRE la key filtrada original → rebota 401 (si fue rotada) o 403 (sin scope si no lo fue); 0 basura nueva; cada rebote → fila en `audit` con hora, key enmascarada, endpoint y motivo | 401/403 |
| **Actos (estado)** | 1 normal · 2 attack (corriendo sin alerta) · 3 detected (alerta disparada) · 4 contained (matafuegos aplicado tras detección) · 5 hardened | — |

> **Precedencia de middlewares (L-4):** la cadena es `rateLimit → apikey → handler` — con la ventana de rate limit saturada, un request mal autenticado recibe **429** (el rate limit lo sombra) en vez de su 401/403 teórico. Comportamiento intencional: throttlear antes de autenticar evita trabajo innecesario bajo flood. El detector de anomalía y la máquina de actos cuentan solo POST (D-0007/L-9): floods de GET no degradan el acto.

Seed fijo: 12 entries `legit` + eventos `traffic` iniciales en timeline + 0 eventos de seguridad (AC de N-0001).

## 3. NFRs medibles (base: `references/security.md`)

| # | NFR | Medición / comando | Umbral |
|---|-----|--------------------|--------|
| 1 | Validación en toda frontera: todo POST valida tipo/rango/size; rechazo sin crash | test fuzz en suite (payloads basura, tipos incorrectos, campos extra, body de 10 KB) | 100% → 400 `invalid_request`; proceso vivo al final |
| 2 | Cero secrets reales | `npm run scan:secrets` → `gitleaks detect --source . --no-git -c .gitleaks.toml` | **0 findings**; allowlist solo `sk_breachlab_demo_` documentada |
| 3 | Cero llamadas a hosts externos | (a) `netstat -ano` durante ataque: listener solo en `127.0.0.1:3000`, sin conexiones externas; (b) grep: `fetch|net\.connect|axios|http\.request` solo en `src/attacker.js` con URL constante loopback; (c) bind hardcoded `127.0.0.1` en `server.js` | (a)+(b)+(c) cumplidos, evidencia en `brain/evidence/` |
| 4 | Comportamiento auth exacto (tabla §2.5) | tests de integración por caso | sin key→401 · key revocada→401 · kill switch→403 · sin scope→403 · rate→429; body de error NUNCA contiene stack, rutas ni versiones |
| 5 | Rate limit con números | test: 25 requests en ráfaga con rate-limit activo | exactamente 10 con 2xx, ≥15 con 429 + `Retry-After` en la ventana |
| 6 | Timeouts en IO saliente (solo el bot) | código: `fetch(..., { signal: AbortSignal.timeout(2000) })` | presente y test verde (bot no cuelga si el server rechaza) |
| 7 | p95 API local | test de perf en suite: 50 samples de `GET /api/lab/state` y `POST /api/entries` en loopback | **p95 < 200 ms** (umbral API local de security.md) |
| 8 | Dependencias sanas | `npm audit --omit=dev` con lockfile commiteado | 0 vulns críticas/altas (con 1 dep, trivial de mantener) |
| 9 | Suite verde desde instalación limpia | `npm ci && npm test` | exit 0;覆盖率 `npm run test:coverage` reportada, ≥70% líneas en `src/` |
| 10 | Crash-coherencia | tests #1 + arranque con DB corrupta → reseed y log claro, no crash silencioso | proceso arranca o falla con mensaje accionable |

Errores: handler central en `server.js` → `500 {error:"internal_error"}` sin internals. Config por constantes del lab en `src/lab.js` (valores §2.5); único env opt-in: `PORT` (default 3000 — correr NO requiere ninguna variable, AC de N-0001 intacta).

## 4. Sprints — slices verticales (límite brain: ≤300 líneas / ≤8 archivos por slice)

Mapping: **slice-1 del PO (N-0001..N-0003) → S01..S04** · **slice-2 del PO (N-0004) → S05..S06**. Cada slice cruza DB→API→UI e incluye sus tests. Estimación al final de cada slice.

| Sprint | Nodo / historias | Entrega vertical (end-to-end) | Archivos (≈) | AC heredadas |
|---|---|---|---|---|
| **S01 Sandbox vivo** | N-0001 (parte 1) | `npm install && npm start` → API arriba solo en loopback: health OK, seed 12 legit en SQLite, timeline con eventos normales, leak servido desde repo-sim. Tests: seed fijo + endpoints. Funcional: curl → JSON correcto. | package.json · .gitignore · server.js · src/lab.js · repo-sim/config.json · test/lab.test.js = **6, ~300 lín** | AC1(parcial: sin READMEs aún)·AC2·AC3·AC4·AC5 |
| **S02 Panel + docs + secrets gate** — cierra N-0001 | N-0001 (cierre) | Panel en `http://127.0.0.1:3000` con acto 1 visible (estado normal, timeline, botón "ver el leak" que muestra repo-sim/config.json con la key falsa). README EN/ES con 2 comandos. `npm run scan:secrets` → 0 findings. | public/index.html · public/panel.js · README.md · README.es.md · .gitleaks.toml · server.js(edit) · package.json(edit) = **7, ~280 lín** | AC1·AC6·AC7 → **N-0001 done** |
| **S03 Ataque + detección** — cierra N-0002 | N-0002 | Botón "Simular ataque" → bot in-process consume POST /api/entries con la key filtrada; panel muestra en vivo requests anómalos + basura en DB; al cruzar umbral → alerta roja con hora y motivo; "Detener" → basura persistida. Tests: flujo completo + 401/400/201. | src/apikey.js · src/attacker.js · src/entries.js · src/labroutes.js · server.js(edit) · public/panel.js(edit) · test/attack.test.js = **7, ~300 lín** | AC1..AC4 → **N-0002 done** |
| **S04 Matafuegos** — cierra N-0003 | N-0003 | Tres botones independientes: kill switch (403 en feed, contadores frenan) · rotación (401 en feed, nueva key en panel) · rate limit (429 + throughput acotado). Cada acción → evento timeline con efecto. Tests: cada matafuegos por separado + combinados. | src/ratelimit.js · src/lab.js(edit) · src/apikey.js(edit) · src/labroutes.js(edit) · public/panel.js(edit) · test/firewall.test.js = **6, ~280 lín** | AC1..AC4 → **N-0003 done** — fin del slice-1 del PO |
| **S05 Hardening** — N-0004 parte A | N-0004 (AC1-3, AC5) | Botón "Activar hardening": DB muestra key como hash sha256 (plain→NULL), endpoints exigen scope, audit log con cada intento bloqueado (hora, key enmascarada, endpoint, motivo). Re-ataque con la key vieja: 100% rebota, 0 basura nueva. Panel refleja sistema recuperado. Tests: hash+scope+audit+re-ataque. | src/apikey.js(edit) · src/lab.js(edit: migración) · src/labroutes.js(edit: audit) · public/panel.js(edit) · test/hardening.test.js = **5, ~300 lín** | AC1·AC2·AC3·AC5 |
| **S06 Postmortem + cierre** — cierra N-0004 y el MVP | N-0004 (AC4) + DoD | docs/postmortem.md (EN: cronología 5 actos, impacto, mitigaciones por fase) linkeado desde panel y README. Test de regresión e2e de los 5 actos. CHANGELOG + LICENSE + versión. | docs/postmortem.md · README.md(edit) · README.es.md(edit) · CHANGELOG.md · LICENSE · public/panel.js(edit) · test/e2e.test.js = **7, ~250 lín** | AC4 → **N-0004 done, MVP/V0 completo** |

Orden estricto por dependencias (H-01→H-02→H-03→H-04). Regla anti-monster: si un slice rompe 300/8 en ejecución, el dev PARA y propone split (límite del brain, no negociable por inercia).

## 5. Estrategia QA

| Nivel | Qué | Comando | Umbral de aprobación |
|---|---|---|---|
| Automático (por slice) | Tests unit + integración HTTP (servidor efímero puerto 0 en loopback, `node:test`) | `npm ci && npm test` | exit 0; cada slice agrega tests que fallan sin su implementación |
| Automático (por slice) | Cobertura | `npm run test:coverage` | ≥70% líneas en `src/`, reporte en la review del slice |
| Automático (S02+) | Secrets | `npm run scan:secrets` | 0 findings |
| Automático (gate SHIP) | Deps | `npm audit --omit=dev` | 0 critical/high |
| Funcional (por slice) | La demo corre y hace lo que el spec dice | `npm start` + walkthrough del(os) acto(s) del slice; evidencia (output curl / captura) en `brain/evidence/` | cada AC del nodo con evidencia |
| Funcional (gate SHIP) | Los 5 actos ≤5 min siguiendo solo panel+README | walkthrough completo cronometrado | ≤5 min, 0 pasos que requieran conocimiento previo |
| Adversarial (factory/qa) | Fuzzing de payloads (basura, tipos, 10 KB, campos extra), headers malformados, flood con rate-limit activo, arranque con data/ corrupta | suite manual + tests existentes | 400/401/429 correctos, proceso vivo, sin fuga de internals |
| Red (gate SHIP) | Aislamiento | `netstat -ano` durante ataque + grep de clientes HTTP | listener solo 127.0.0.1; 0 sockets externos |

QA de cada slice reporta la checklist de `references/security.md` como OK/FALLA/N/A + evidencia.

## 6. Riesgos técnicos y mitigación

| # | Riesgo | Prob | Mitigación |
|---|---|---|---|
| T1 | Visitante sin Node ≥24 → `node:sqlite` inexistente | Baja (LTS actual; D-0001) | `engines` en package.json + check al boot con mensaje claro de versión requerida + prereq visible en ambos README |
| T2 | Puerto 3000 ocupado en la máquina del visitante | Media | `PORT` env opt-in documentado en README troubleshooting (correr por defecto NO requiere env) |
| T3 | S03/S05 (slices más cargados) rompen el límite 300/8 | Media | Ya partidos por diseño; si igual rompen, dev para y propone split — no se continúa por inercia |
| T4 | Timeline ruidoso arruina la narrativa (R2) | Media | Severidades + cooldown de alertas 15 s + eventos `traffic` solo del seed (el ruido del bot vive en contadores/feed, no en timeline) |
| T5 | Riesgo percibido como peligro real (R1) | Baja | NFR-2 (gitleaks 0) + NFR-3 (loopback + grep) como AC verificables; README explica el diseño del sandbox |
| T6 | Deprecación futura de deps (R4) | Baja | 1 dep runtime, módulos nativos de Node; `npm audit` en gate |
| T7 | gitleaks no disponible en máquina ajena (portabilidad del gate, no de la demo) | Baja | Instalación documentada (winget/brew/scoop); el visitante NUNCA corre el scan — es gate de fábrica |

## 7. Checklist G1 (cierre del TL)

- [x] Stack decidido con ADR (D-0002) — sugerencia del intake evaluada y aceptada con ajuste; se presenta en G2.
- [x] Arquitectura completa: componentes, data flow, carpetas, contratos (endpoints + schemas + códigos exactos).
- [x] Semántica del incidente con números fijados (D-0004): bot 4 rps, umbral 30/10 s, rate limit 10/10 s, cooldown 15 s, seed 12. El dev no decide valores de producto.
- [x] NFRs medibles con comando y umbral (NFR-1..10), alineados a `references/security.md`.
- [x] Slices S01..S06 verticales, cada uno ≤8 archivos / ~≤300 líneas estimadas, mapeados a H-01..H-04; H-04 (L) partido en S05+S06.
- [x] Estrategia QA con comandos npm exactos y umbrales.
- [x] Tooling verificado en la máquina: Node v24.19.0 ✓, gitleaks 8.30.1 instalado vía winget ✓.
- [x] Sin decisiones abiertas para `factory/dev`.
