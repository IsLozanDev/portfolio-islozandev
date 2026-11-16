# TR-OBS negocio · Observabilidad de negocio (MOD-16)

Paquetes de contexto para la capa de negocio de TR-OBS. La base técnica (logs, trazas, métricas del outbox, Sentry, alerta de Grafana) ya está en `specs/21-obs-y-staging.md` y `libs/plataforma/observabilidad`. No son specs: `/spec` asigna el número.

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-106 | Registrar indicadores de negocio por minuto | Must | MVP | R3-10 (sprint 24) | `obs-indicadores-reglas.md` | Contexto listo |
| TR-RF-107 | Configurar reglas de alerta | Must | MVP | R3-10 (sprint 24) | `obs-indicadores-reglas.md` | Contexto listo |
| TR-RF-108 | Evaluar reglas y gestionar alertas | Must | MVP | R3-10 (sprint 24) | `obs-alertas-salud.md` | Contexto listo |
| TR-RF-109 | Ver salud por tenant y sucursal | Must | MVP | R3-10 (sprint 24) | `obs-alertas-salud.md` | Contexto listo |
| TR-RF-110 | Reconocer alerta y ver alertas del tenant | Should | MVP | Sin historia | `obs-alertas-salud.md` | Contexto listo; sin historia |

## Orden de construcción
1. `obs-indicadores-negocio` (106). Requiere 11 y 21; la primera fuente real son los eventos de SazónPOS (spec 25).
2. `obs-reglas-alerta` (107).
3. `obs-evaluador-alertas` (108). Avisos con TR-NOT (R2-09) o adaptador nulo.
4. `obs-salud-y-alertas-ui` (109, 110).
5. Después: `sop-ticket-desde-alerta` (RF 112, en `tr-sop/`).

Notas:
- R3-10 da 10 h a 106-109; la estimación realista es 23-27 h en cuatro specs.
- `comp:obs` hoy solo importa `kernel` y `evt`; los endpoints van en `apps/api/src/observabilidad/` o se amplía la matriz (decidir en el primer spec).
- El registro de suscripciones de `eventos` es estático (decorador); los indicadores del manifiesto piden registro programático.
