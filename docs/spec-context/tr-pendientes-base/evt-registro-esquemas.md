# Contexto para evt-registro-esquemas

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md` (nota «RF-094 (registro de esquemas) sin spec»), SRS xlsx (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `3_plan.json`, specs 02 y 11, `libs/plataforma/kernel`, `libs/plataforma/kernel-infra`, `libs/plataforma/*/src/infrastructure/event-schemas.ts`.

## 1. Alcance y dependencias
- Componente TR-EVT (MOD-13), proceso TR-P12. Registro de tipos de evento con esquema JSON versionado, productor y consumidores, y verificación de compatibilidad hacia atrás al registrar una versión nueva.
- Origen: spec 02 lo pasó al 11; el spec 11 lo dejó fuera («Registro versionado de esquemas con compatibilidad hacia atrás TR-RF-094 y TR-RNF-117 completo. Sin spec en el roadmap; se propone sumarlo como fila nueva antes del 25»). El roadmap lo anota como pendiente de decidir.
- Release: SRS Should/MVP; el plan no le da historia propia (E-02 del spec 11 cubre RF 093 y 095). Es **R1 sin dueño**: el spec 25 (eventos de SazónPOS) es el primer productor externo y se beneficia de tenerlo antes.
- Horas estimadas: 7-9 h (un spec). Depende de 11 (implementado) y del manifiesto (06). Lo necesitan `int-webhooks-salientes` (catálogo de eventos públicos) y `int-sincronizacion-cursor`.
- Áreas (≤ 3): (a) declaración de eventos en el manifiesto y tabla `sync.esquema_evento` aplicada de forma idempotente; (b) verificador de compatibilidad contra las 2 versiones anteriores (dominio puro) + prueba de contrato en CI; (c) validador de publicación que lee del registro (reemplaza el `InMemoryEventSchemaValidator` alimentado a mano) y consulta del catálogo en la consola.
- Si supera 10 h: la vista de consola va a un spec aparte (`evt-catalogo-consola-ui`, 4-5 h).
- Fuera de alcance: validar el payload en el relay o en el consumidor, upcasting de versiones viejas, eventos públicos para TR-INT (solo se deja la marca `publico`), purga del outbox.
- Constitución: 1, 2, 4, 5, 6, 8, 11 (TypeORM; la comparación de esquemas es código de dominio, no SQL); código limpio.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-094 | Mantener catálogo de eventos y suscripciones | plat.evento.catalogo | APP-01 | TR-RN-034 | TR-RNF-117, 120 | Administrador de plataforma, Planificador de tareas |

- **094** precondición: el manifiesto del producto declara eventos publicados y suscripciones. Flujo: 1) el manifiesto registra tipos y esquemas; 2) compara la nueva versión con las 2 anteriores; 3) si rompe compatibilidad (campo obligatorio eliminado o tipo cambiado) rechaza; 4) la consola muestra el catálogo con productores y consumidores. Datos: event_type, schema_version (smallint), esquema (JSON Schema), productor (producto), consumidores[] (módulo). Salida: catálogo versionado y compatible. Relacionados: TR-EVT, TR-SEG.
- Interfaz (hoja Componentes, TR-EVT): «EventoPort.publicar (outbox transaccional), decorador @SuscribirEvento, registro de esquemas, despachador BullMQ, cola de fallidos y reproceso; sync.read_events». Todo menos el registro ya existe.

## 3. Criterios GWT
- **TR-CA-231** (Positivo, «Nueva versión compatible»): `cita.creada` v1 con `fecha_hora` y `profesional_id` | se registra v2 con campo opcional `modalidad` | v2 queda compatible.
- **TR-CA-232** (Negativo, «Versión incompatible»): v2 con obligatorio `profesional_id` | se registra v3 que lo elimina | se rechaza por romper compatibilidad.

Faltan y se proponen: cambio de tipo de un campo (`string` → `number`) rechazado; campo nuevo obligatorio rechazado (rompe a productores viejos o a consumidores, P2); reaplicar el mismo manifiesto no cambia nada (RNF-120); publicar un evento con `schema_version` no registrada falla en la transacción (como hoy `EventSchemaValidationError`); un consumidor `@SuscribirEvento` a un tipo inexistente en el registro se detecta al arrancar o en CI; compatibilidad verificada en CI con las 2 versiones anteriores (meta de RNF-117).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-034 | Outbox en la misma tx; entrega al menos una vez; consumidor idempotente por `event_id`. |
| TR-RNF-117 | Contratos de eventos versionados (`schema_version`) en un registro de esquemas, compatibles hacia atrás. Meta: compatibilidad con las 2 versiones anteriores verificada en CI. Verificación: pruebas de contrato. |
| TR-RNF-120 | Cada producto declara permisos, opciones, parámetros, indicadores, reportes y catálogos en un manifiesto versionado aplicado de forma idempotente; dos aplicaciones = 0 cambios; < 30 s. |

Heredados por CLAUDE.md: 008, 010 (el catálogo es global, sin datos de tenant), 012, 024/119, 025, 026, 106.

## 5. Historia del backlog
Sin historia propia. Relacionadas: E-02 (relay, spec 11, sprint 7, RF 093/095), F-06 (outbox, spec 02, RF 092), C-06/C-08 (eventos de SazónPOS, spec 25).

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/01<letra>_sync_esquemas.sql` (siguiente letra libre al implementar; `01j` a `01m` quedan para PER, IDN, ARC y FE; esquema `sync`, como el resto de TR-EVT) + `db/rollback/` + `db/tests/`.
- `sync.esquema_evento` (event_type, schema_version smallint, esquema jsonb, productor varchar (código de producto del manifiesto), publico boolean, registrado_en; PK (event_type, schema_version); solo inserción: una versión registrada no cambia).
- `sync.suscripcion_evento` (event_type, consumidor (nombre del `@SuscribirEvento`, regex de `sync.evento_procesado.consumidor`), producto, registrado_en; PK (event_type, consumidor)). La alimenta el arranque del worker o un paso de CI que recorre los decoradores.
- Sin RLS por tenant (catálogo global); `REVOKE` a `anon` y `authenticated` (regla 8).
- **Manifiesto**: hoy `plat.manifiesto.json` (versión 1.15.0) tiene `producto_codigo`, `nombre`, `version`, `modulos`, `opciones`, `permisos`, `roles_predefinidos`, `parametros`, `indicadores`, `reportes`; **no** tiene `eventos`. Agregar `eventos: [{ tipo, schema_version, esquema | ruta, publico }]` y aplicarlo con el CLI del manifiesto (`apps/api/src/cli/plataforma.cli.ts`).
- **Eventos**: ninguno nuevo (o `evento.esquema_registrado` para auditoría; opcional).
- **Puertos**: `RegistroEsquemas` (lectura por tipo y versión, con caché en memoria al arrancar); `VerificadorCompatibilidad` (dominio: compara `required`, `properties.*.type`, `enum` reducido, `additionalProperties`); el `EventSchemaValidator` del kernel se mantiene y la implementación pasa a cargar desde el registro.
- **Permisos**: `plat.evento.catalogo` (consola; hoy existen `plat.evento.consultar` y `plat.evento.reprocesar` en `PERMISOS_EVT`).

## 7. Código base relacionado
- **Ya existe**: `kernel` exporta `EventSchemaValidator` (`validate(event)`); `kernel-infra` exporta `InMemoryEventSchemaValidator` (Ajv, `register(eventType, schemaVersion, schema)`, clave `tipo@version`, mensaje sin valores del payload) y `OutboxPublisher` (llama a `validate` antes de insertar). Cada lib publica `ESQUEMAS_<LIB>` y `registrarEsquemas<Lib>` en `src/infrastructure/event-schemas.ts` (org, seg, cfg, seq, cat, aud), todos en `schema_version = 1`, Ajv estricto sin `format`.
- **Registro a mano**: `apps/api/src/main.ts` registra org, seg, cfg, seq y cat; `apps/worker/src/worker.module.ts` registra org, seg, cat y aud (no cfg ni seq). Esa asimetría es un riesgo que el registro central elimina.
- **Consumidores**: `@SuscribirEvento(tipo, { consumidor })` en `libs/plataforma/eventos` (p. ej. `auditoria.consumidor.ts` con `EVENTOS_AUDITADOS`).
- **Falta**: tabla, sección `eventos` del manifiesto, verificador de compatibilidad, prueba de contrato en CI, vista de consola.

## 8. Diagramas relevantes
- `01-analysis/.../8_Diseno_Piloto/2_Plataforma_Transversal/T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (`EventoOutbox`, `Suscriptor`).
- `.../T-S7_Secuencia_Relay_del_outbox_hacia_los_consumidores.mmd`.
- `01-analysis/.../7_Control_Cambios_SazonPOS/CC-D07_CC_07_Eventos_de_dominio_desde_triggers.mmd` (productor externo del spec 25).
- `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/1_Mermaid/PL-10_*.mmd` (`K --> EVT`).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- «Compatible hacia atrás» no distingue compatibilidad para consumidores (pueden leer lo nuevo) de la de productores.
- «Compara con las 2 anteriores»: la v4 debe ser compatible con v3 y v2, pero no con v1.
- El SRS pone el registro en el manifiesto, pero los esquemas hoy viven en TypeScript en cada lib.
- Spec 25 (SazónPOS) publica desde triggers: sus esquemas no están en TypeScript de la plataforma.

Preguntas, con recomendación:
1. ¿Prioridad? Recomendación: fila nueva antes del 25 (como propuso el spec 11), 7-9 h; sin ella, los eventos de SazónPOS entran sin contrato.
2. ¿Qué es compatible? Recomendación: compatibilidad de lectura (backward): se permite agregar campos opcionales y ampliar `enum`; se rechaza quitar un campo obligatorio, cambiar su tipo, volver obligatorio un campo existente o agregar uno nuevo obligatorio.
3. ¿Fuente de verdad: TypeScript o manifiesto? Recomendación: los esquemas siguen en `ESQUEMAS_<LIB>` (tipados, probados); el manifiesto los referencia por tipo y versión y el CLI los vuelca a `sync.esquema_evento`. Los productos externos (SazónPOS) los ponen en su manifiesto como JSON.
4. ¿Validar al publicar contra la base? Recomendación: cargar el registro en memoria al arrancar (api y worker por igual) y fallar el arranque si un `registrarEsquemas<Lib>` difiere de lo registrado; nada de consultas por evento.
5. ¿Consumidores? Recomendación: el worker registra al arrancar sus `@SuscribirEvento` en `sync.suscripcion_evento` (idempotente); la consola muestra productor y consumidores por tipo.
6. ¿Marca `publico`? Recomendación: dejar la columna (falso por defecto) para TR-INT; sin UI para cambiarla hasta los webhooks.
