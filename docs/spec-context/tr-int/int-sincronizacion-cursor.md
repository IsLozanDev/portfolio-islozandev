# Contexto para int-sincronizacion-cursor

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF), `plan.md` (R4), `3_plan.json`, `db/01e_sync_outbox.sql`, `db/01e_sync_relay.sql`, spec 11, `01-analysis/.../3_Integracion_BD_Institucional/` (INT-01 a INT-07).

## 1. Alcance y dependencias
- Componente TR-INT (MOD-20), proceso TR-P12. Un conector institucional (p. ej. SQL Server de una municipalidad) lee el outbox por cursor con `client_credentials`, confirma su último `seq`, reporta la conciliación diaria y la plataforma purga lo confirmado por todos tras la retención.
- Release: plan **R4 (backlog 2028)**. SRS: Should/R2. Consumidores: COL y DOC (hoja Consumidores, «sincronización por cursor con bases institucionales»).
- Historia: ninguna. Horas estimadas: 12-14 h.
- Dependencias: `int-clientes-api` (token `client_credentials` con alcance `sync.leer`), EVT (spec 02: `sync.outbox`; spec 11: `sync.read_events`, margen RN-035), OBS (alerta de descuadre; reglas de alerta son TR-OBS R3), AUD (registro de purga, INT-05).
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | int-sync-cursor-ack | 133 (pasos 1-3) | 7-8 | int-clientes-api, 11 |
| B | int-sync-conciliacion-purga | 133 (pasos 4-5) | 5-6 | A, 21; TR-OBS alertas (R3) o evento |

- A, áreas: (a) `sync.subscriber` por tenant con `client_id` y `last_ack_seq`; (b) `GET /sync/v1/events?after=&limit=` filtrado por tenant con margen; (c) `POST /sync/v1/ack` monótono.
- B, áreas: (a) `POST /sync/v1/reconciliation` con conteos por fecha y sede, `cuadra` calculado y alerta; (b) purga diaria del outbox respetando el mínimo `last_ack_seq` de suscriptores activos y la retención.
- Fuera de alcance: el conector en sí (servicio local con SQL Server, esquema `tf`, INT-06), escenario C (despliegue en el datacenter, INT-07), escenario B con agregados anónimos (INT-05 «generar agregados»: es de COL), reentrega desde cero a un suscriptor nuevo (snapshot inicial).
- Constitución: 1, 2, 3 (el filtro por tenant es obligatorio: `sync.read_events` actual es global), 4, 5, 6, 8, 11 (SQL crudo en funciones de lectura por cursor, como el spec 11); código limpio.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-133 | Sincronizar con base institucional por cursor | alcance `sync.leer` | APP-03 | TR-RN-034, 035 | TR-RNF-106, 117, 007 | Sistema institucional o integrador, Planificador de tareas |

- **133** precondición: suscriptor registrado en `sync.subscriber` con su `client_id`. Flujo: 1) pide eventos desde su último seq confirmado; 2) el sistema devuelve un lote con `sync.read_events` respetando el margen; 3) el conector aplica con UPSERT por versión y confirma el seq; 4) a diario reporta conteos y se registra si cuadra; 5) la purga elimina eventos confirmados por todos tras la retención. Datos: subscriber_id, after_seq (bigint), limit (1-1000), last_ack_seq, reconciliation (fecha_operacion, sede_id, conteos origen y destino, cuadra calculado). Relacionados: TR-INT, TR-EVT, TR-OBS.

## 3. Criterios GWT
- **TR-CA-323** (Positivo, «Lectura y confirmación»): el conector de Yanahuara confirmó hasta 5 000 | pide después de 5 000 | recibe los siguientes y al confirmar 5 400 su `last_ack_seq` queda en 5 400.
- **TR-CA-324** (Negativo, «Conciliación descuadrada»): origen 812 tickets el 09/10/2026, destino 809 | reporta | `cuadra = falso` y alerta para el tenant.
- **TR-CA-325** (Borde, «Purga con suscriptor atrasado»): un suscriptor activo confirmó hasta 3 000 | se ejecuta la purga | no se eliminan eventos posteriores a 3 000.

Faltan y se proponen: un suscriptor del tenant A nunca recibe eventos de B (RNF-010); ack menor al actual se ignora (monótono) y ack mayor al último entregado se rechaza; `limit` fuera de 1-1000 → 400; eventos con menos antigüedad que el margen no se devuelven (RN-035); suscriptor inactivo no frena la purga; respuesta incluye `next_cursor` y `has_more` (INT-03).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-034 | Evento en el outbox en la misma tx; entrega al menos una vez; consumidor idempotente por `event_id`. |
| TR-RN-035 | La lectura por cursor solo devuelve eventos más antiguos que el margen (defecto 5 s), para no saltar seq confirmados fuera de orden. |
| TR-RNF-106 | Despacho del outbox al menos una vez, p95 < 5 s. |
| TR-RNF-117 | Contratos de eventos versionados (`schema_version`) en un registro de esquemas, compatibles con las 2 versiones anteriores. |
| TR-RNF-007 | Timeout, reintento y circuit breaker con terceros. |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012, 013/112, 024/119, 025, 026, 101.

## 5. Historia del backlog
Sin historia (R4). Relacionadas: spec 02 (`sync.outbox`, columna `origin` CLOUD|EDGE), spec 11 (`sync.read_events`, `sync.read_events_ventana`, `sync.relay_cursor`; dejó fuera «Purga del outbox y de procesados», también fuera en spec 21).

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/04b_int_sync.sql` (las tablas viven en el esquema `sync`, que ya existe).
- `sync.subscriber` (id, tenant_id, nombre, client_id → `int.cliente_api`, last_ack_seq bigint, activo, retencion_dias, creado_en, version). Nombre del SRS en inglés; el repo usa nombres en español en `sync` (`relay_cursor`, `evento_procesado`): ver P4.
- `sync.reconciliation` / `sync.conciliacion` (tenant_id, subscriber_id, fecha_operacion, sede_id, conteos jsonb origen/destino por tipo, cuadra boolean generado, registrado_en; PK (subscriber_id, fecha_operacion, sede_id)).
- **Función nueva** `sync.read_events_tenant(p_tenant, p_cursor, p_margen, p_limite)` (`SECURITY DEFINER`, `search_path = ''`): la actual `sync.read_events(p_cursor, p_margen, p_limite)` no filtra por tenant y la usa el relay. Índice `(tenant_id, seq)` en `sync.outbox` (hoy hay `outbox_seq_uq` y `outbox_tenant_aggregate_ix`).
- **Purga**: `sync.outbox` tiene trigger de solo inserción (`sync.outbox_solo_insercion`): la purga necesita una función dueña que lo desactive de forma controlada o un rol con excepción explícita (P2). Debe respetar `sync.relay_cursor.ultimo_seq` además de los suscriptores.
- **Eventos**: `sync.conciliacion_descuadrada` (alerta), `sync.purga_ejecutada` (auditoría, INT-05). Nombres propuestos.
- **Permisos/alcances**: `sync.leer` (alcance OAuth2 del cliente de API; no sigue `producto.recurso.accion`, P5); gestión de suscriptores en `admin-cliente`: proponer `plat.integracion.sync`.
- **Rutas**: INT-02/03 usan `/sync/v1/events` y `/ack`; la constitución pide todo bajo `/v1` (P5).

## 7. Código base relacionado
- **Se reutiliza**: `db/01e_sync_outbox.sql` (`sync.outbox` con `seq`, `event_id`, `tenant_id`, `sede_id`, `version`, `origin`, `schema_version`); `db/01e_sync_relay.sql` (`sync.validar_lectura_relay`, `sync.read_events` como molde, RN-035 ya implementada); `eventos` (`LectorEstadoOutboxTypeOrm`, `EstadoOutbox`); `observabilidad` (`registrarMetricasOutbox`); `int-clientes-api` (guard de cliente).
- **Falta**: `sync.subscriber`, lectura por tenant, ack, conciliación, purga, alertas de TR-OBS (R3).

## 8. Diagramas relevantes
- `01-analysis/.../3_Integracion_BD_Institucional/INT-01_Arbol_de_decision_del_escenario_de_almacenamiento.mmd` (escenarios A, B, C).
- `.../INT-02_Vista_general_de_la_integracion_escenarios_A_y_B.mmd`.
- `.../INT-03_Secuencia_de_sincronizacion_por_cursor_nube_SQL_Server.mmd` (flujo exacto de 133; `next_cursor`, `has_more`, ack).
- `.../INT-04_Operacion_sin_internet_y_convergencia_doble_via.mmd` (relación con TR-EDGE).
- `.../INT-05_Retencion_en_la_nube_y_purga_controlada_escenario_B.mmd` (purga + conciliación).
- `.../INT-06_Modelo_de_datos_del_esquema_de_intercambio_tf_SQL_Server.mmd`, `.../INT-07_Despliegue_en_el_datacenter_de_la_entidad_escenario_C.mmd`.
- `.../8_Diseno_Piloto/2_Plataforma_Transversal/T-07_*.mmd` (`Suscriptor.ultimoSeqConfirmado`).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- `sync.read_events` del SRS recibe tenant (INT-03), la del repo no.
- La purga choca con el outbox de solo inserción y con la conservación de eventos que la auditoría (20a) consume.
- Conteos «origen y destino» no dicen de qué entidades: depende del producto (tickets en COL).
- Alerta de descuadre depende de reglas de TR-OBS (R3).

Preguntas, con recomendación:
1. ¿Lectura por tenant? Recomendación: función nueva `sync.read_events_tenant` con el mismo margen y validación que la del relay; no tocar la del relay.
2. ¿Cómo purgar un outbox inmutable? Recomendación: función `sync.purgar(p_hasta)` dueña del esquema que borra por lotes solo `seq ≤ min(relay_cursor, last_ack_seq de activos)` y antigüedad > retención, desactivando el trigger dentro de la función; auditar la purga. Sin purga hasta que exista un suscriptor externo real.
3. ¿Retención? Recomendación: parámetro CFG `plat.sync.retencion_dias` (defecto 30) por tenant; escenario B de COL lo baja.
4. ¿Nombres en inglés del SRS? Recomendación: tablas en español (`sync.suscriptor`, `sync.conciliacion`) como el resto del repo; el contrato HTTP sí usa los nombres de INT-03 (`after`, `limit`, `next_cursor`, `has_more`) porque los consume el conector.
5. ¿Ruta y alcance? Recomendación: `/v1/sync/events`, `/v1/sync/ack`, `/v1/sync/reconciliation`; alcance `plat.sync.leer` para seguir el formato `producto.recurso.accion`.
6. ¿Alerta sin TR-OBS? Recomendación: evento `sync.conciliacion_descuadrada` al outbox y lista de conciliaciones en `admin-cliente`; la regla de alerta se conecta cuando exista TR-OBS negocio (R3).
