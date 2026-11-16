# Pendientes de componentes ya implementados (ORG, SEG, CFG, SEQ, CAT, EVT, AUD, OBS)

Paquetes de contexto (no son specs) de RF sueltos de componentes ya construidos en los specs 01-21, más la lista de pendientes sin dueño que esos specs dejaron en «Lo que no está en este spec», en el roadmap o en `docs/ops/supabase-ambientes.md`. Revisado el 2026-11-16 contra `specs/01-21` y el código.

## Checklist de RF
| | RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|---|
| [ ] | TR-RF-094 (+ TR-RNF-117) | Mantener catálogo de eventos y suscripciones | Should | MVP | sin historia (E-02 cubre 093/095) | `evt-registro-esquemas.md` | Pendiente; el spec 11 propuso fila antes del 25 |
| [ ] | TR-RF-018 | Gestionar sesiones activas | Should | R2 | sin historia (R4) | `seg-sesiones-transferencia.md` | Pendiente (R4 en el plan) |
| [ ] | TR-RF-021 | Transferir propiedad del tenant | Could | R2 | sin historia (R4) | `seg-sesiones-transferencia.md` | Pendiente (R4 en el plan) |
| [ ] | TR-RF-034 | Consultar historial de cambios de parámetros | Should | R2 | sin historia | `cfg-historial-parametros.md` | Pendiente; la auditoría del 20a no cubre CFG |
| [ ] | TR-RF-038 | Reservar bloques de numeración offline (SEQ) | Should | R2 | sin historia (R4) | `../tr-edge/edge-offline-cache-bloques.md` | Pendiente; va con TR-EDGE |

## Orden de construcción
| # | Spec propuesto | RF | h | Depende de | Cuándo |
|---|---|---|---|---|---|
| 1 | evt-registro-esquemas | 094, RNF-117 | 7-9 | 11 | Antes del 25 (R1) |
| 2 | cfg-historial-parametros | 034 | 4-6 | 09, 11, 20a, 20b | Con la UI de parámetros (pendiente 3 abajo) |
| 3 | seg-sesiones-activas | 018 + inactividad en servidor | 7-8 | 05, 18b, 16a | Cuando se decida cerrar la brecha de RNF-014 |
| 4 | seg-transferir-propiedad | 021 | 5-6 | 08, 16a, 20a | R4, o antes si un cliente lo pide |

## Otros pendientes sin dueño (lista para decidir; no tienen paquete)
Con dueño ya asignado (TR-NOT R2, TR-REP/TR-ARC, spec 27, P-01, R3) no se listan.

| # | Pendiente | Origen | Nota |
|---|---|---|---|
| 1 | Migrar specs 01-09 de SQL embebido a TypeORM | `CLAUDE.md` regla 11; `docs/roadmap-specs.md` («spec de refactor aparte, ~6-8 h, sin número ni fecha») | Repositorios de ORG, SEG y CFG. |
| 2 | Bloqueo por inactividad en el servidor (TR-RNF-014) | `docs/ops/supabase-ambientes.md` (brechas); spec 05 fuera de alcance | Propuesto dentro de `seg-sesiones-activas`. Hoy solo inactividad en el cliente (spec 13). |
| 3 | UI de parámetros y series en `admin-cliente` (resto de D-05) | Specs 09 y 10 («spec posterior al 15»), 19e fuera de alcance | El manifiesto PLAT ya tiene las opciones `/admin/parametros` y `/admin/series`, pero no hay páginas en `libs/plataforma/admin-cliente/src/lib/pages/`. |
| 4 | Microsoft OAuth (Azure/Entra ID) real | Spec 14 («botón y código quedan; app de proveedor y habilitación en Supabase, pendientes»); roadmap fila 14 | Tarea de operación, 1-2 h; no necesita spec. |
| 5 | Tabla de brechas de RNF-009 desactualizada | `docs/ops/supabase-ambientes.md` dice «un bloqueo propio sería otro spec» | El 18b ya bloquea por intentos en Redis vía ingreso por la API. Quedan: hook de Supabase que bloquee GoTrue directo, desbloqueo manual y pantalla, umbrales por tenant (18b fuera). |
| 6 | Cierre explícito de sesiones en Supabase al suspender o revocar | Specs 03, 08 (decisión del usuario), 16a, 18 | Cubierto si se hace `seg-sesiones-activas` (lista negra por `session_id`). |
| 7 | `trust proxy` en `apps/api` | Specs 08 y 18b (fuera); solo se usa en una prueba (`seguridad/test/ingreso.http.spec.ts`) | Afecta la IP real en bitácora, límites de tasa y auditoría detrás de Railway. Pequeño, sin dueño. |
| 8 | Suscripción editable por HTTP (TR-RF-005) | Specs 17a y 17b fuera | El dominio existe (spec 03, `GestionarSuscripcion`); falta ruta y UI de consola. |
| 9 | Inactivar empresa; purga tras 90 días en `BAJA` | Specs 03, 17a, 17c | Sin RF propio identificado; revisar RN de ORG al redactar. |
| 10 | Purga del outbox y de procesados | Specs 11 y 21 | Necesaria para TR-INT (`int-sincronizacion-cursor.md` la propone); hoy el outbox crece sin límite. |
| 11 | Reentrega del histórico a consumidores nuevos; orden por agregado; eventos sin tenant | Spec 11 | El relleno de `cfg-historial-parametros` necesita la reentrega. |
| 12 | Auditar eventos de SEQ, CAT y SEG | Spec 20a | Mismo patrón que CFG en `cfg-historial-parametros.md`. |
| 13 | Particionado, archivado y retención de `aud` | Specs 20a y 20b | Conservación mínima 5 años (TR-RN-028); sin purga en R1. |
| 14 | Página de integridad con historial y atención de roturas | Specs 20b y 20c | Hoy solo la franja de integridad en la lista. |
| 15 | Pantalla de eventos fallidos en la consola | Specs 11 y 17b («sin historia de UI en R1») | La API existe (`apps/api/src/eventos/fallidos.controller.ts`, `/v1/evt/fallidos`). |
| 16 | Selector y cambio de tenant (`PUT /v1/seg/mi-tenant`) | Specs 13, 14, 15, 17a, 17b, 18 | Usuarios con varios tenants no pueden cambiar el activo desde la UI. |
| 17 | Desenrolar MFA; reintento automático tras step-up | Specs 13 y 14 | |
| 18 | Listas filtradas por el alcance del actor | Specs 16a y 17a | Hoy un actor de sucursal ve listas del tenant. |
| 19 | Renombrar o reactivar roles; renombrar o inactivar perfiles; techo PLAT en `GET /asignables` y `OtorgarAsignacion` | Specs 16b y 16c | |
| 20 | Componente `<ui-catalogo-select>` | Specs 19a, 19d, 19e (el 19a lo asignaba a «15 o 25») | Lo necesitan los formularios de producto (spec 25). |
| 21 | Cancelar una importación en curso; sincronización automática con fuentes oficiales | Specs 19b y 19d | |
| 22 | `contarDiasHabiles`, plazos hacia atrás, domingo hábil, feriados por ubigeo | Spec 19c | |
| 23 | Parámetros por unidad operativa | Spec 09 | El SRS habla de unidad en la jerarquía (TR-RN-001). |
| 24 | `shared/util` (formatos es-PE), DTO en `libs/shared/contracts`, mover `validarRuc` a lib compartida | Specs 15, 19d, 17c | Deuda de estructura. |
| 25 | Formato de número de SEQ (8 dígitos vs. «A-001») | `docs/roadmap-specs.md` («pendientes de decidir») | Decisión, no spec. |
| 26 | Spec 19b: CI con PostgreSQL 16 y cierre | `docs/roadmap-specs.md` (estado del 19b) | Cierre administrativo. |
| 27 | Limpieza del tenant de humo `humo-12-…` en dev | `docs/ops/supabase-ambientes.md` (registro del 2026-10-26, «Pendiente») | Operación manual. |
| 28 | Pruebas k6 de TR-RNF-001 y monitoreo sintético de TR-RNF-005; Sentry y RUM en frontends | Spec 21 | Revisar si el spec 27 (Q-04) o P-01 los toma. |
| 29 | Marca por tenant, alto contraste, preferencias de tema y menú en la API | Specs 15, 15b, 15c, 15d | Mejoras de diseño; sin RF. |
| 30 | Clave de idempotencia por cabecera en el alta; límites en el alta, renovación y reactivación automática | Spec 12 | La idempotencia por cabecera la retoma `int-clientes-api-publica.md` (`X-Idempotency-Key`); el cobro automático es R4 (TR-PAG). |
