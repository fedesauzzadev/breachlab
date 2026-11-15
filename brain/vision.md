# Vision

## What this project is
BreachLab es un lab interactivo 100% local que simula un incidente de seguridad real en cinco actos (normal → ataque con API key filtrada → detección → matafuegos: kill switch/rotación/rate limit → hardening: hash/scopes/audit log). Es la pieza central de un porfolio personal: demostración profesional de respuesta a incidentes y endurecimiento, narrable en ≤5 minutos. Stack sugerido Node+Express+SQLite; la decisión final es del Tech Lead (ADR).

## What this project is NOT
- No es un producto con auth de usuarios, deploy público ni métricas de negocio.
- No es i18n framework completo (UI ES, docs EN).
- No usa ataques reales ni hosts reales: bot atacante simulado in-process, keys falsas.
- No es multiusuario/multi-tenant.

## Constraints
- 100% local: cero llamadas de red a terceros en cualquier corrida.
- Cero secrets reales en el repo (verificado por escaneo).
- API vulnerable POR DISEÑO, no explotable fuera del sandbox.
- Corre con 2 comandos en Windows (Node LTS), portable a Linux/Mac.
