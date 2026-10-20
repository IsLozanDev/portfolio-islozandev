# Contexto para SPEC 11 · evt-outbox-relay

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, `specs/02-supabase-y-kernel.md` (aprobado, define el DDL), `docs/spec-context/02-supabase-y-kernel.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `3_plan.json`, `2_Estructura/estructura_backend.txt`, `1_Mermaid/`, `codigo/` y el repo actual (`apps/`, `libs/`, `db/`, `tools/`).

## 1. Alcance y dependencias
- Roadmap: spec 11 `evt-outbox-relay` cubre E-02 (RF 093, 095): "relay en el worker, suscriptores, reproceso". 6 h. Depende de 02. Lo necesitan 12 (alta de tenant), 20 (aud), 21 (obs) y 25.
- Historia E-02 (3_plan.json): sprint 7, R1, 6 h, Back, "Relay del outbox en el worker (BullMQ), suscriptores, reintentos y reproceso"; su campo `rf` lista TR-RF-092, 093, 095, pero 092 ya lo entrega el spec 02 (F-06).
- Tres áreas: (a) DB: lectura entre tenants (`sync.read_events`), cursor y cola de fallidos; (b) lib `eventos` (TR-EVT): registro de suscriptores, `@SuscribirEvento`, idempotencia por `event_id`, reproceso; (c) `apps/worker` con relay y colas BullMQ.
- Fuera de alcance (confirmado por spec 02): publicar en el outbox y la tabla `sync.outbox` (spec 02); catálogo/registro versionado de esquemas con compatibilidad hacia atrás (RF-094, TR-RNF-117: el roadmap no lo asigna a ningún spec, ver pregunta 9); pantallas de consola para fallidos (spec 17 y 18 según corresponda; RF-095 se cubre aquí por API); consumidores concretos (AUD en 20, OBS en 21, NOT en R2); observabilidad OpenTelemetry (spec 21).
- Spec 02 ya decidió: `sync.outbox` solo inserción, con `seq bigint identity` como cursor, sin columnas de estado de despacho, `FORCE RLS`, sin modo sistema implícito en el UoW ("las tareas sin tenant (relay, vencimientos) tendrán su propio camino en su spec"), y deja al 11 elegir "rol propio o `sync.read_events` SECURITY DEFINER".
- PL-10: `K --> EVT`, `EVT --> AUD`, `EVT --> NOT`, `EVT --> OBS`. Boundaries vigentes (`eslint.config.mjs`): `comp:evt` solo depende de `kernel`; `aud` y `obs` pueden depender de `evt`.
- Constitución (CLAUDE.md): reglas 1, 2, 3, 4, 6, 8, 9, 10; DoD completo.

## 2. RF
| ID | Nombre | Permiso | Prioridad | Fase |
|---|---|---|---|---|
| TR-RF-093 | Despachar eventos a suscriptores internos | plat.sistema.job | Must | MVP (plan: R1, sprint 7) |
| TR-RF-095 | Reprocesar eventos fallidos | plat.evento.reprocesar | Must | MVP (plan: R1) |

### TR-RF-093 (MOD-13 TR-EVT, APP-03)
- Actores: Planificador de tareas, Módulo de producto consumidor. Procesos TR-P12, TR-P09; componentes TR-EVT, TR-OBS; RNF TR-RNF-106, TR-RNF-028. Sin IA. Reglas TR-RN-034, TR-RN-035.
- Descripción: leer el outbox por cursor con margen de seguridad y entregar cada evento a los consumidores suscritos por colas BullMQ, al menos una vez, con idempotencia por `event_id` en cada consumidor.
- Precondición: existen suscripciones registradas para el tipo de evento.
- Flujo: 1) el despachador lee con `sync.read_events` respetando el margen de TR-RN-035; 2) encola el evento para cada consumidor suscrito; 3) el consumidor verifica si ya procesó el `event_id`; si no, lo procesa y registra; 4) el despachador avanza el cursor tras encolar.
- Datos/validaciones: `cursor` (bigint); `margen_segundos` (parámetro, defecto 5); `consumidor` (texto); `event_id`; `intentos` (entero); `estado` (PROCESADO | REINTENTANDO | FALLIDO).
- Salida: eventos entregados a todos los consumidores.
- Permiso `plat.sistema.job`: tarea interna del worker, sin endpoint (ver pregunta 8).

### TR-RF-095 (MOD-13 TR-EVT, APP-01 consola)
- Actores: Administrador de plataforma, Agente de soporte (N1/N2). Procesos TR-P12, TR-P09; componentes TR-EVT, TR-OBS, TR-AUD; RNF TR-RNF-106, TR-RNF-026. Regla TR-RN-034.
- Descripción: enviar a una cola de fallidos los eventos que agotaron reintentos, mostrarlos con el error y permitir reprocesarlos individualmente o en lote tras corregir la causa.
- Precondición: existen eventos en estado FALLIDO.
- Flujo: 1) el consumidor agota los reintentos configurados (defecto 8); 2) el sistema mueve el evento a la cola de fallidos con el último error; 3) el actor filtra por consumidor, tipo y tenant y revisa el error; 4) reprocesa uno o varios; el resultado se registra.
- Datos/validaciones: `consumidor`; `event_type`; `tenant_id`; `error` (texto); `intentos` (entero); `reprocesado_por` (uuid); `reprocesado_en`.
- Salida: eventos fallidos visibles y reprocesados.
- Nota: el SRS la ubica en la Consola (APP-01); la consola llega con los specs 15-17. Este spec entrega el caso de uso y el endpoint `/v1`, con `@Permiso('plat.evento.reprocesar')` solo si el guard (spec 07) ya existe (07 es posterior en la cadena de olas pero el 11 no depende de él; ver pregunta 8).

## 3. Criterios GWT
- **TR-CA-228** (Positivo, "Entrega a dos consumidores"): DADO QUE TR-OBS y TR-NOT están suscritos a cita.creada | CUANDO se publica una cita.creada | ENTONCES ambos consumidores la procesan una sola vez.
- **TR-CA-229** (Borde, "Entrega duplicada"): DADO QUE un worker se reinició tras procesar el evento sin confirmar | CUANDO el evento se entrega de nuevo | ENTONCES el consumidor detecta el event_id procesado y no duplica el efecto.
- **TR-CA-230** (Borde, "Transacción confirmada fuera de orden"): DADO QUE el evento con seq 1001 se confirmó 2 s después del 1002 | CUANDO el despachador lee con margen de 5 s | ENTONCES ambos eventos se entregan sin saltar el 1001.
- **TR-CA-233** (Positivo, "Reproceso tras corrección"): DADO QUE 12 eventos cpe.aceptado fallaron en el consumidor de ECO por un error ya corregido | CUANDO el administrador los reprocesa en lote | ENTONCES los 12 eventos se procesan y salen de la cola de fallidos.
- **TR-CA-234** (Borde, "Reproceso de evento ya procesado"): DADO QUE un evento fallido fue procesado por otra vía | CUANDO se reprocesa | ENTONCES el consumidor lo reconoce por event_id y lo marca procesado sin duplicar efectos.

Estado de prueba en el SRS: Pendiente. Observaciones: cpe.aceptado y "consumidor de ECO" son de R2 (TR-FE); la prueba usa un evento y un consumidor de prueba. Los criterios de RF-092 (TR-CA-225 a 227) son del spec 02. No hay GWT para el reintento con tope de 8, el orden por agregado ni el arranque del relay tras caída: hay que redactarlos como criterios propios del spec.

## 4. Reglas y RNF
En el SRS los RNF se llaman `TR-RNF-xxx` (el encargo los nombra `RNF-xxx`).
| ID | Texto corto |
|---|---|
| TR-RN-034 | Todo evento se inserta en el outbox en la misma tx que el cambio de negocio; entrega al menos una vez; consumidor idempotente por event_id. |
| TR-RN-035 | La lectura del outbox por cursor solo devuelve eventos con antigüedad mayor al margen configurado (defecto 5 s), para no saltar secuencias confirmadas fuera de orden. Origen `sync.read_events`. |
| TR-RN-001 | Toda entidad lleva tenant_id; ninguna consulta cruza tenants (el relay es la excepción controlada: lee entre tenants, pero cada entrega lleva su tenant). |
| TR-RNF-106 | Despacho desde outbox al menos una vez; retraso p95 < 5 s; 0 eventos perdidos al reiniciar workers; prueba de caos (kill de workers) y conteo outbox vs. consumidos. |
| TR-RNF-008 | Operaciones que cambian estado idempotentes ante reintentos: 0 duplicados en pruebas de reintento. Aquí se aplica como idempotencia por `event_id`. |
| TR-RNF-010 | Doble barrera por tenant (contexto + RLS). Ojo: el relay lee entre tenants; el consumidor debe ejecutar su efecto con el tenant del evento. |
| TR-RNF-026 | Logs estructurados con trace_id, tenant y sucursal, sin datos personales (el payload del evento no se loguea completo). |
| TR-RNF-025 | Cobertura de dominio >= 70 % e integración de flujos críticos. |
| TR-RNF-117 | Contratos de eventos versionados con compatibilidad hacia atrás (MOD-13). Pertenece al registro de esquemas de RF-094; el relay solo transporta `schema_version`. |

TR-RNF-028 está enlazado a RF-093 en el SRS; no se leyó su texto para este paquete (verificar en la hoja RNF al redactar el spec).

## 5. Historias del backlog (3_plan.json)
| ID | Sprint | Horas | Descripción | rf |
|---|---|---|---|---|
| E-02 | 7 | 6 | Relay del outbox en el worker (BullMQ), suscriptores, reintentos y reproceso (TR-EVT, Back, R1) | TR-RF-092, 093, 095 |

Relacionadas: F-06 (5 h, sprint 0; publicar en outbox, spec 02), E-01 (auditoría, 5 h, sprint 7; spec 20 consume eventos), E-03 (observabilidad, 4 h, sprint 8; spec 21). Sprint 7 (25/01 a 07/02/2027): objetivo "Administración de datos, auditoría y eventos", capacidad 20 h. El plan ubica E-02 en el sprint 7, pero el roadmap lo adelanta (ola 2, junto al 03) porque el alta de tenant (spec 12) lo usa.
Riesgos de 3_plan.json: ninguno menciona outbox, Redis ni worker.

## 6. Tablas SQL, eventos, puertos y permisos
- **`sync.outbox`** (spec 02, no se redefine): `seq` identity, `event_id` PK, `tenant_id`, `sede_id`, `aggregate_type`, `aggregate_id`, `event_type`, `version`, `origin`, `payload`, `schema_version`, `occurred_at`, `created_at`. Índices `outbox_seq_uq` y `outbox_tenant_aggregate_ix (tenant_id, aggregate_type, aggregate_id, version)`. RLS `FORCE`, política `outbox_tenant` solo SELECT/INSERT. Migración `db/01e_sync_outbox.sql`.
- **A definir en este spec** (nuevas, rango de migraciones por confirmar con el spec 01; el árbol solo nombra `01a` a `01e`):
  - `sync.read_events(cursor, margen, limite)` `SECURITY DEFINER`, o rol dedicado del relay con `BYPASSRLS`/política propia (pregunta 7). Filtra `created_at < now() - margen` (TR-RN-035).
  - Cursor del relay: tabla `sync.relay_cursor` (una fila) o clave en Redis.
  - Procesados por consumidor: `sync.evento_procesado (consumidor, event_id)` PK compuesta, para idempotencia.
  - Cola de fallidos: `sync.evento_fallido` con `consumidor`, `event_id`, `event_type`, `tenant_id`, `error`, `intentos`, `estado`, `reprocesado_por`, `reprocesado_en` (columnas de RF-095 y RF-093).
  - Todas con rollback en `db/rollback/` y prueba SQL con el patrón de `codigo/supabase/correr_pruebas.sh`.
- **Eventos**: el relay es agnóstico del tipo. Ejemplos de los GWT: cita.creada, cpe.aceptado. Eventos propios internos (métricas del relay, fallidos) no definidos; no inventar nombres.
- **Puertos** (SRS Componentes y estructura_backend): `EventoPort.publicar` (existe en spec 02 como `EventPublisher`/`event-publisher.port.ts`), decorador `@SuscribirEvento`, "registro de esquemas, despachador BullMQ, cola de fallidos y reproceso; sync.read_events". Puertos nuevos probables (nombres en inglés, como decidió el spec 02): `EventSubscriberRegistry`, `OutboxReader`, `ProcessedEventStore`, `DeadLetterStore`, `EventQueue`.
- **Permisos**: `plat.sistema.job` (RF-093, interno) y `plat.evento.reprocesar` (RF-095). Este último como `@Permiso` no puede probarse hasta el spec 07.
- **Estructura** (`estructura_backend.txt`): `apps/worker` ("relay del outbox · notificaciones · vencimientos · FE (R2)", NestJS 12, BullMQ sobre Redis) y `libs/plataforma/eventos` ("outbox · relay · suscripciones · reproceso"). Ninguna existe aún; el spec 01 dejó `apps/worker` fuera.
- **Infra**: `docker-compose.yml` ya trae `redis:7` con healthcheck. `bullmq` no está en `package.json`.

## 7. Código base relacionado
Raíz: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/`.
- **Falta en `codigo/`**: todo lo de eventos (no hay worker, BullMQ, relay, `sync.*` ni `@SuscribirEvento`). Se escribe desde cero. Tampoco hay `01e_sync_outbox.sql` (lo trae el spec 02).
- **Estado del repo (`portfolio/`)**: existen `apps/api` (con `salud`), `libs/plataforma/kernel` (`clock.port`, `domain-errors`, `id-generator.port`, `result`; aún sin `aggregate-root`, `domain-event`, `unit-of-work.port`), `libs/plataforma/kernel-infra` (solo `index.ts`), `libs/shared/{contracts,util}`, `tools/migrar` (runner up/down), `tools/boundaries-test` (con fixture `comp:evt`) y `db/rollback/` vacío. El spec 02 está aprobado pero su implementación no está presente: el 11 debe esperar a que 02 esté implementado (CLAUDE.md: no se implementa un spec si su dependencia no lo está).
- **Reutilizable como patrón**: `codigo/supabase/correr_pruebas.sh` y `tests/00_simular_supabase_SOLO_PRUEBAS.sql` para pruebas SQL con rol sin `BYPASSRLS`; `codigo/libs/plataforma/seguridad/src/infrastructure/cache-permisos.redis.ts` como referencia de cliente Redis (ver su manejo de conexión, no se verificó a fondo); estructura `application/ports` + `infrastructure` + `seguridad.module.ts` con `useFactory` como plantilla de módulo; `errores.ts` como estilo de errores.
- **Cambiar / cuidar**: `seguridad` publicará eventos `seg.asignacion.*` y `seg.membresia.invitada` (PL-05, PL-06); cuando existan, serán los primeros suscriptores (invalidación de caché de permisos). Hoy `seguridad` no usa kernel.
- **Versiones**: NestJS 12.2.0 fijo en el repo; Node 24; pnpm 12; jest 30.

## 8. Diagramas relevantes (`1_Mermaid/`)
- PL-10 Dependencias entre componentes (K -> EVT -> AUD, NOT, OBS).
- PL-05 Secuencia solicitud autorizada (transacción + outbox; evento `seg.asignacion.*` invalida claves del tenant).
- PL-06 Invitación de un usuario (evento `seg.membresia.invitada`).
- PL-08 Integración SazónPOS (`apps/worker` "outbox · tareas"; "eventos de SazónPOS" desde el worker hacia PostgreSQL; `sync.outbox` también se escribe desde el edge).
- PL-09 Ambientes (api + worker en staging y prod).
- PL-02 Cronograma (S07 "Admin de datos · auditoría · eventos").

## 9. Ambigüedades y preguntas candidatas (Fase 2)
Ambigüedades:
- El SRS pone RF-093/095 en el rol "Planificador de tareas / Administrador de plataforma"; el despachador es un proceso interno sin endpoint, y la consola (RF-095) llega en el spec 17 o posterior.
- RF-094 (catálogo y registro versionado de esquemas, Should) no figura en ningún spec del roadmap, pero TR-EVT lo cita y TR-RNF-117 es Must.
- Hoy `apps/worker` no existe y el spec 01 lo dejó fuera: este spec lo crea.
- `origin` CLOUD|EDGE: eventos EDGE (SazónPOS, PL-08) pueden llegar con orden distinto al de `seq`.

Preguntas candidatas, con recomendación:
1. ¿Relay en el worker con BullMQ o polling directo? Recomendación: el relay es un proceso en `apps/worker` que hace polling periódico (por ejemplo cada 1 s) de `sync.read_events` y encola en BullMQ una cola por consumidor. BullMQ aporta reintentos con backoff, persistencia en Redis y concurrencia; el polling sobre la tabla es necesario de todos modos (no hay otra fuente de verdad). `LISTEN/NOTIFY` no funciona con el pooler en modo transacción de Supabase, así que se descarta.
2. ¿Política de reintentos? Recomendación: 8 intentos (defecto de RF-095) con backoff exponencial (por ejemplo base 5 s, tope 10 min) configurable por parámetro/entorno; estado REINTENTANDO mientras se reintenta. Ajustar números al redactar; son propuesta, no vienen del SRS salvo el 8.
3. ¿Dead letter? Recomendación: tabla `sync.evento_fallido` en PostgreSQL (no solo la cola fallida de BullMQ) para poder filtrar por consumidor, tipo y tenant (RF-095) y sobrevivir a una pérdida de Redis; el reproceso reencola el evento y registra `reprocesado_por/en`. La cola de BullMQ se usa solo para el reintento.
4. ¿Orden por agregado? Recomendación: orden global no garantizado; sí orden por agregado cuando importe. Una sola cola por consumidor con concurrencia 1 es lenta; alternativa: particionar por `aggregate_id` (grupos de BullMQ o hash a N colas) para mantener el orden por `(aggregate_type, aggregate_id, version)`. Para R1 recomiendo concurrencia por consumidor configurable y consumidores que toleren desorden usando `version`; documentar la garantía. Decidir con el usuario si AUD (spec 20) exige orden.
5. ¿Registro de suscriptores? Recomendación: decorador `@SuscribirEvento(tipo, { consumidor })` que registra en un registro en memoria al arrancar el módulo (descubrimiento con `DiscoveryService` de NestJS); el nombre del consumidor es la clave estable de la cola y de la idempotencia. Persistir el catálogo en BD es de RF-094, fuera de este spec.
6. ¿Idempotencia? Recomendación: `INSERT ... ON CONFLICT DO NOTHING` en `sync.evento_procesado (consumidor, event_id)` dentro de la misma transacción que el efecto del consumidor (TR-CA-229). Si el consumidor no es transaccional con la BD, el efecto debe ser idempotente por sí mismo.
7. ¿Cómo lee el relay entre tenants? Recomendación: función `sync.read_events` `SECURITY DEFINER` con `search_path` fijo, ejecutable solo por un rol del relay (`GRANT EXECUTE` revocado a `anon`, `authenticated`); es lo que nombra el SRS (TR-RN-035) y evita dar `BYPASSRLS` a un rol. El consumidor ejecuta su efecto con el UoW usando el `tenant_id` del evento.
8. ¿Endpoint y permisos de reproceso? Recomendación: `POST /v1/eventos/fallidos/reprocesar` (individual y lote) como caso de uso en la lib, con `@Permiso('plat.evento.reprocesar')`. Como el guard es del spec 07, dejar el controlador detrás de un flag o escribir solo el caso de uso y diferir el controlador a los specs de consola; decidir con el usuario.
9. ¿Qué pasa con el registro de esquemas (RF-094, TR-RNF-117)? Recomendación: fuera de este spec (supera las 6 h); el relay no valida payload. Proponer añadirlo al roadmap como spec nuevo o dentro del 20/21, y avisar al usuario.
10. ¿Cursor persistente y margen? Recomendación: cursor guardado en `sync.relay_cursor` (una fila), avanzado tras encolar; margen de 5 s como parámetro del entorno hasta que exista CFG (spec 09). Un reinicio retoma desde el cursor y la idempotencia absorbe los duplicados (TR-RNF-106).

Nota: son 10 preguntas; agrupar 9 y 10 con 7 y 6 respectivamente si el spec debe quedarse en 9.

## 10. Verificación sugerida (para el spec)
- Pruebas SQL de `sync.read_events` (margen, TR-CA-230), y de que un rol sin permiso no puede leer el outbox.
- Integración con PostgreSQL 16 y Redis 7 de compose: dos consumidores (TR-CA-228), reinicio del worker (TR-CA-229, TR-RNF-106), reproceso en lote de 12 (TR-CA-233) y de uno ya procesado (TR-CA-234).
- Prueba de caos: matar el worker durante el despacho y comparar conteo outbox vs. consumidos (verificación de TR-RNF-106). Retraso p95 < 5 s requiere un benchmark local o se declara no probado.
