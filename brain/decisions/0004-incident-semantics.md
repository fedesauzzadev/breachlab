# D-0004: Semántica observable del incidente — códigos, umbrales y números del lab

Date: 2026-11-14
Reversibility: easy

## Context
Las AC de N-0002..N-0004 exigen efectos observables distinguibles por matafuego y una detección por umbral, pero los valores exactos quedaban abiertos ("el valor exacto lo decide el builder"). Para que factory/dev no tome decisiones de producto y QA tenga números contra los que testear, se fijan acá.

## Decision
**Códigos y mensajes** (la distinción entre palancas ES el relato):

| Situación | Status | `error` en body |
|---|---|---|
| Sin `x-api-key` o key revocada/inválida (post-rotación) | 401 | `invalid_api_key` |
| Key deshabilitada por kill switch | 403 | `key_disabled` |
| Key válida sin scope requerido (hardening) | 403 | `insufficient_scope` |
| Rate limit excedido | 429 | `rate_limited` + header `Retry-After` |
| Body inválido (frontera de confianza) | 400 | `invalid_request` + details |

**Números del lab:**

- Bot: ráfaga fija **4 req/s** (interval 250 ms), payload `SPAM-<n>`, target POST /api/entries. No se detiene solo.
- Detección: **>30 requests de una misma key en ventana móvil de 10 s** → 1 evento `alert` severity critical con hora, key enmascarada y motivo. **Cooldown 15 s** entre alertas.
- Rate limit (default al activar): **10 requests / 10 s por key**.
- Seed: **12 entries legítimas** (cantidad fija documentada) + eventos `traffic` iniciales; 0 eventos de seguridad.
- Enmascarado de keys: primeros 4 + `…` + últimos 4 chars visibles como máximo (p.ej. `sk_b…a9c`), idéntico en timeline y audit log.
- Hardening: `key_plain → sha256` (plain a NULL), scope `write:entries` exclusivo de la key legítima vigente. El re-ataque usa SIEMPRE la key filtrada original: si fue rotada → 401; si no → 403 por scope. Ambos caminos rebotan y auditan.
- Key falsa del leak: prefijo propio `sk_breachlab_demo_` (allowlist en `.gitleaks.toml`).
- Puertos/actos: default `127.0.0.1:3000`; actos 1..5 según estado (`normal · attack · detected · contained · hardened`).

## Alternatives considered
- Kill switch como 401 en vez de 403: rejected — el visitante no distinguiría kill switch de rotación; 403 (identidad válida, acceso cortado) vs 401 (identidad muerta) es la diferencia pedagógica.
- Umbral por throughput absoluto del server: rejected — más código y frágil; ventana por key es el modelo realista de "una identidad consumiendo de más".
- Alerta por cada request sobre el umbral: rejected — spam en timeline; cooldown 15 s mantiene la señal.
- Valores configurables desde el panel: rejected — flexibilidad no pedida; constantes en `src/lab.js`.

## Consecuencias
- QA testea contra números exactos (p.ej. "25 ráfagas con rate limit → exactamente 10 con 2xx").
- Si el Negocio quiere otra narrativa de tiempos, cambiar constantes es un diff trivial (reversibilidad easy).
