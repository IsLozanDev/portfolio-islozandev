# Contexto para obs-indicadores-reglas

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `3_plan.json`, `plan.md`, `1_Mermaid/PL-10`, diagramas T-09, OP-02, OP-03, OP-12, T-S7, CC-D07, `specs/21-obs-y-staging.md`, `docs/ops/`, código de `libs/plataforma/{observabilidad,eventos,seguridad}`.

## 1. Alcance y dependencias
- Historia **R3-10** (sprint 24, 10 h, Full, R3): «Indicadores de negocio, reglas de alerta y salud por tenant», RF 106 a 109. Este paquete cubre la parte 106-107; `obs-alertas-salud.md` cubre 108-110.
- PL-10: `EVT --> OBS --> SOP`. La base técnica de TR-OBS ya está (spec 21: logs pino, OTel a Grafana Cloud, Sentry backend, métrica del outbox, alerta de Grafana). Spec 21 dejó explícito: «TR-RF-106 a 110, TR-RNF-126/127, esquema `obs.*`: R3».
- Sprint 24 (16 h) comparte con R3-11 (WhatsApp, 6 h).
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | obs-indicadores-negocio | 106 | 5-6 | 11 (relay, `@SuscribirEvento`, `sync.evento_procesado`), 21, manifiesto (spec 06) |
| b | obs-reglas-alerta | 107 (back + UI de consola y de admin-cliente) | 5-6 | a, 07 (`@Permiso`), 15b/15c/15d, 17b, 17c |

- Áreas de (a): definición de indicadores desde el manifiesto; consumidor genérico `obs.registrar` por minuto; partición mensual con retención de 13 meses. Áreas de (b): agregado `ReglaAlerta` con validación; API `/v1/obs/reglas`; formulario en panel lateral.
- Fuera de alcance: evaluación, alertas, salud y reconocimiento (`obs-alertas-salud.md`); ticket automático (RF 112, `tr-sop/`); trazas y logs técnicos (spec 21); agente edge (TR-EDGE, R4).
- Constitución: reglas 1-8, 10, 11 (upsert de la métrica con SQL crudo justificado: `INSERT ... ON CONFLICT DO UPDATE` acumulativo); DoD completo.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-106 | Registrar indicadores de negocio por minuto | plat.sistema.job | APP-03 | TR-RN-034 | TR-RNF-126, 106 | Planificador de tareas |
| TR-RF-107 | Configurar reglas de alerta | plat.alerta.regla | APP-01 | TR-RN-040 | TR-RNF-127, 027 | Administrador de plataforma, Administrador del cliente |

- **106** precondición: indicador declarado con su evento de origen. Flujo: el consumidor recibe el evento; extrae tenant, empresa, sucursal, momento y valor; `obs.registrar` acumula en el minuto; series 13 meses particionadas por mes. Datos: `indicador` (p. ej. `rest.pedidos`), `minuto` (truncado), `suma`, `conteo`, `maximo`. Salida: serie por minuto para alertas y tableros. Relacionados: TR-OBS, TR-EVT.
- **107** precondición: el indicador existe. Flujo: elige indicador y condición; define umbral, ventana, base mínima y severidad; indica si crea ticket; se valida y activa. Datos: `indicador`, `nombre` (3-150), `condicion` (UMBRAL_MAYOR|UMBRAL_MENOR|SIN_DATOS|CAIDA_PCT), `umbral` (obligatorio salvo SIN_DATOS), `ventana_min` (1-1440), `base_minima` (≥ 0), `severidad` (CRITICA|ALTA|MEDIA|BAJA), `crea_ticket`, `tenant_id` (nulo = plataforma). Relacionados: TR-OBS.
- Interfaz (hoja Componentes): «Vista SQL. Registro de indicadores por minuto desde eventos (`obs.registrar`); reglas y evaluación de alertas; vista `obs.v_salud_sucursal`; trazas OpenTelemetry». Consumidores: REST y DOC integran; los demás consumen.

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-259 | 106 | Positivo | `rest.pedidos` desde `pedido.creado`; 3 eventos de «Cayma» en 12:31 → suma 3 y conteo 3 en 12:31 |
| TR-CA-260 | 106 | Borde | Evento e-55 ya contado y reentregado → se descarta por `event_id`, la métrica no sube |
| TR-CA-261 | 107 | Positivo | Regla CAIDA_PCT 60 %, ventana 30 min, base mínima 10, ALTA → activa para todos los tenants con REST |
| TR-CA-262 | 107 | Negativo | UMBRAL_MAYOR sin umbral → «El umbral es obligatorio para esta condición» |

Faltan (proponer): evento sin `sucursal_id` (se registra a nivel tenant o se descarta); retención (la partición de hace 14 meses se elimina); evento con datos personales en el payload (solo se lee el campo de valor); regla de tenant solo visible y editable por ese tenant; regla de plataforma no editable por el cliente; indicador de un producto que el tenant no tiene; `ventana_min` fuera de 1-1440; desactivar regla.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-034 | Evento en el outbox en la misma tx; entrega al menos una vez; consumidor idempotente por `event_id`. |
| TR-RN-040 | Una alerta abierta por regla y sucursal; CAIDA_PCT solo si la línea base (mismo tramo y día, 4 semanas) supera la base mínima. Aquí: validación de la regla. |
| TR-RNF-126 | `obs.*` solo agregados por minuto, sin datos personales; retención 13 meses con partición mensual; verificación: revisión de esquema y job de purga. |
| TR-RNF-106 | Despacho del outbox al menos una vez, p95 < 5 s (condiciona la frescura de la serie). |
| TR-RNF-127 | Evaluador cada minuto, detección ≤ 2 min, 0 duplicados (la regla debe permitirlo). |
| TR-RNF-027 | Configuración por tenant sin cambios de código (reglas propias del tenant). |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012, 013, 024/119, 025, 026, 101.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-10 | 24 | 10 | TR-OBS | Indicadores de negocio, reglas de alerta y salud por tenant | TR-RF-106 a 109 | Full | R3 |

Relacionadas: E-03 (spec 21, base técnica), E-02 (spec 11, relay), C-08 (spec 25, eventos de SazónPOS por triggers → outbox: primera fuente real de indicadores), R3-08/R3-09 (soporte), R3-11 (mismo sprint). Plan 6.1: «salud por tenant» en consola R3. OP-13 ponía la observabilidad de negocio en la Fase 1 (con PsicoAgenda); el plan la deja en R3.

## 6. Tablas SQL, eventos, puertos y permisos
Base del esquema: OP-12 y T-09.
- `obs.indicador_def` (global, desde el manifiesto): `codigo` PK, `producto_codigo`, `nombre`, `evento_origen`, `campo_valor` (ruta JSON o nulo = 1), `agregacion` (SUMA|CONTEO|MAXIMO), `version_manifiesto`.
- `obs.metrica_minuto` particionada por rango mensual de `minuto`: PK (`tenant_id`, `sucursal_id`, `indicador`, `minuto`), `empresa_id`, `suma`, `conteo`, `maximo`. RLS por `app.tenant_id`. Sin columnas personales (TR-RNF-126).
- `obs.regla_alerta`: `id`, `tenant_id` nulo = plataforma, `indicador`, `nombre`, `condicion`, `umbral`, `ventana_min`, `base_minima`, `severidad`, `crea_ticket`, `activa`, `version`. RLS: el tenant ve las suyas y las de plataforma (solo lectura).
- Funciones: `obs.registrar(...)` (upsert acumulativo), `obs.crear_particion(mes)` y `obs.purgar(meses)` en el worker (tarea diaria). SQL crudo permitido: funciones de BD y partición (regla 11).
- **Eventos**: el SRS no define eventos de OBS. Propuestos para 107: `obs.regla.creada|actualizada|desactivada` solo si alguien los consume (auditoría vía consumidor de 20a). Eventos fuente: los del producto (p. ej. `pedido.creado`, `rest.pedido.registrado` en OP-03; hay que fijar el nombre real con el spec 25).
- **Puertos**: `CatalogoIndicadores` (definiciones), `RegistroMetricas` (`acumular(minuto, clave, valor)`), `ReglasAlertaRepositorio` (TypeORM), `Reloj`.
- **Permisos**: `plat.sistema.job` (sin endpoint, worker), `plat.alerta.regla` (SRS). Faltan: lectura de indicadores para el formulario (propuesta: la misma `plat.alerta.regla`). Regla de plataforma vs. de tenant: distinguir por permiso de operador (`OPERADOR_REQUERIDO`, patrón 17a), no por `tipo_usuario`.
- **Nx**: `comp:obs` hoy solo puede importar `kernel` y `evt` (`eslint.config.mjs`) y `tools/boundaries-test` exige que `observabilidad` no importe `seguridad`. Los controladores van en `apps/api/src/observabilidad/` (precedente: `apps/api/src/eventos/fallidos.controller.ts` para comp:evt), o se amplía la matriz a `seg` y `org`.
- **Lib**: dentro de `libs/plataforma/observabilidad` (el árbol del plan dice «(R3) indicadores de negocio») con carpetas `domain/negocio`, o lib nueva `observabilidad-negocio` (`comp:obs`). Ver pregunta 1.
- **Migración**: `db/01?_obs_negocio.sql` + rollback + test. `01h` ya es de OBS (estado del outbox) pero `01i` ya existe: un `01h_obs_negocio.sql` ordenaría antes que `01i`; usar la siguiente letra libre.

## 7. Código base relacionado
- `libs/plataforma/observabilidad/src/index.ts` (spec 21): `ObservabilidadModule`, `registrarMetricasOutbox`, `hashDocumento`, campos redactados. Nada de negocio.
- `libs/plataforma/eventos`: `@SuscribirEvento(eventType, { consumidor })`, idempotencia por `sync.evento_procesado` en la misma tx (cubre TR-CA-260). **Limitación**: `RegistroSuscripcionesNest` registra suscripciones fijas al arrancar por decorador; los indicadores del manifiesto son dinámicos. Hace falta registro programático (ver pregunta 2).
- `db/01h_obs_estado_outbox.sql`: patrón `SECURITY DEFINER` con rol lector (`sync_lector`) para agregar entre tenants; mismo patrón que `aud_lector` (01g).
- Manifiesto: `seguridad/src/domain/manifiesto.ts` acepta `indicadores` y solo valida `codigo`; `plat.manifiesto.json` 1.15.0 trae `"indicadores": []`.
- Worker: tareas periódicas BullMQ (`apps/worker/src/vencimientos`, `soporte`, `auditoria`).
- `docs/ops/staging.md`: Grafana Cloud para métricas técnicas; la observabilidad de negocio es propia (OP-02 «comprar el motor, construir la capa de negocio»).
- `codigo/` del plan: nada de `obs`.

## 8. Diagramas relevantes
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd` (EVT → OBS → SOP).
- `01-analysis/.../8_Diseno_Piloto/2_Plataforma_Transversal/T-09_Modelo_de_dominio_Centro_de_soporte_y_observabilidad.mmd` (IndicadorDef, MetricaMinuto, ReglaAlerta).
- `01-analysis/.../6_Plataforma_Operacion/OP-12_Modelo_de_datos_del_Centro_de_Soporte_y_de_la_observabilidad_de_negoci.mmd`.
- `01-analysis/.../6_Plataforma_Operacion/OP-02_Arquitectura_de_observabilidad_comprar_el_motor_construir_la_capa_de_n.mmd`, `OP-01_Mapa_de_la_plataforma_de_operacion.mmd`, `OP-03_Secuencia_de_la_caida_de_pedidos_al_ticket_con_su_traza.mmd`, `OP-13_Hoja_de_ruta_de_la_plataforma_de_operacion.mmd`.
- `01-analysis/.../8_Diseno_Piloto/2_Plataforma_Transversal/T-S7_Secuencia_Relay_del_outbox_hacia_los_consumidores.mmd`; `7_Control_Cambios_SazonPOS/CC-D07_CC_07_Eventos_de_dominio_desde_triggers.mmd`.

## 9. Ambigüedades y preguntas candidatas
1. ¿Lib existente o nueva? Recomendación: lib nueva `libs/plataforma/observabilidad-negocio` (`comp:obs`, hexagonal completa); la de spec 21 es infraestructura técnica y la cargan api y worker al arrancar.
2. ¿Suscripción dinámica? Recomendación: ampliar `eventos` con `registrarManejador(consumidor, eventType, manejador)` llamado al iniciar el worker con las definiciones de `obs.indicador_def`; un solo consumidor `obs-indicadores`; un cambio del manifiesto exige reinicio del worker (el despliegue ya lo hace).
3. ¿Evento sin sucursal? Recomendación: `sucursal_id` obligatorio en el indicador; si el evento no lo trae, se registra con la sucursal nula a nivel tenant y no se evalúa por sucursal.
4. ¿Qué indicadores hay en R3? Recomendación: ninguno PLAT útil; definir el primero con SazónPOS (`rest.pedidos`, `cpe.emitidos`) y, para pruebas, un indicador PLAT sintético (p. ej. `plat.ingresos` desde `LOGIN`).
5. ¿Quién crea particiones? Recomendación: tarea diaria del worker que crea el mes siguiente y elimina las de más de 13 meses; la migración crea el mes actual y el siguiente.
6. ¿Regla de plataforma afecta a todos los tenants «con el producto»? Recomendación: la evaluación filtra por suscripción activa del producto (TR-ORG); la regla de tenant puede sobrescribir umbral pero no desactivar la de plataforma.
7. ¿UI de reglas en las dos apps? Recomendación: consola (reglas de plataforma) y admin-cliente (propias) con el mismo formulario en panel lateral; pantalla tipo lista + formulario.
