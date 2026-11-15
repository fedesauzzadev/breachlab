# Shared Registry

> Reusable code and abstraction candidates. Consult this BEFORE writing anything new.

## In use
| What | Where | Used by | Notes |
|------|-------|---------|-------|

## Candidates (seen 2x — abstract on 3rd)
| What | Occurrences | Notes |
|------|--------------|-------|
| `maskKey()` (src/lab.js) | 2 (apikey.js reject, labroutes state/audit) | Enmascarado de keys "4+…+4". 3ra aparición → extraer a módulo propio |
| Constantes de semántica (DETECTION_*, BOT_INTERVAL_MS) | 2 (middleware + e2e tests las importan) | Ya exportadas — NO abstraer más, es el contrato D-0004 |
