# Contexto para obs-alertas-salud

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `3_plan.json`, `plan.md` (6.1), `1_Mermaid/PL-10`, diagramas T-09, OP-02, OP-03, OP-12, `specs/21-obs-y-staging.md`, `docs/ops/staging.md`, código de `libs/plataforma/*` y `apps/worker`.

## 1. Alcance y dependencias
- Historia **R3-10** (sprint 24, 10 h, Full, R3) cubre RF 106 a 109. Este paquete toma 108 y 109; **RF 110 no tiene historia** (Should, fase MVP) y se incluye aquí porque comparte la lista de alertas.
- PL-10: `EVT --> OBS --> SOP`. OBS no importa SOP: el ticket automático (RF 112) lo crea SOP consumiendo un evento de alerta (ver `tr-sop/sop-escalamiento-github-alertas.md`).
- Requiere `obs-indicadores-reglas` (series y reglas). Notificar depende de TR-NOT (R2-09 correo; R3-11 WhatsApp).
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | obs-evaluador-alertas | 108 | 6-7 | obs-indicadores-negocio, obs-reglas-alerta, 11, TR-NOT (R2-09) para avisar |
| b | obs-salud-y-alertas-ui | 109, 110 | 7-8 | a, 17a (tenants, sucursales), 17b, 17c, 15b/15c/15d |

- Áreas de (a): evaluación por minuto (cuatro condiciones, línea base); ciclo de vida de la alerta (abrir sin duplicar, resolver sola, reconocer); eventos al outbox. Áreas de (b): vista `obs.v_salud_sucursal` y API; tablero de salud en consola; lista de alertas y reconocimiento en admin-cliente y consola.
- Fuera de alcance: ticket automático (112), estado del agente edge (TR-EDGE, R4: se muestra `NO_APLICA`), tickets de la sucursal en el detalle (se agregan cuando exista SOP), alertas técnicas de Grafana (spec 21 y P-01).
- Constitución: reglas 1-8, 10, 11 (cálculo de ventana y línea base en función SQL: agregación compleja, SQL crudo justificado); diseño UI (pantalla tipo lista y detalle; semáforo con `vit-chip-estado` y `TonoEstado`).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-108 | Evaluar reglas y gestionar alertas | plat.sistema.job | APP-03 | TR-RN-040 | TR-RNF-127, 005 | Planificador de tareas |
| TR-RF-109 | Ver salud por tenant y sucursal | plat.salud.ver | APP-01 | TR-RN-040 | TR-RNF-002, 126 | Administrador de plataforma, Agente de soporte |
| TR-RF-110 | Reconocer alerta y ver alertas del tenant | plat.alerta.reconocer | APP-02 | TR-RN-040 | TR-RNF-127, 020 | Administrador del cliente, Agente de soporte |

- **108** precondición: reglas activas. Flujo: `obs.evaluar_reglas` cada minuto; por regla y sucursal calcula la ventana y, si aplica, la línea base; abre alerta (valor, referencia, detalle) si se cumple y no hay otra abierta; resuelve las que dejaron de cumplirse; notifica por severidad y crea ticket vía `sop.crear_desde_alerta` si corresponde. Datos: `regla_id`, `sucursal_id`, `valor`, `referencia`, `estado` (ABIERTA|RECONOCIDA|RESUELTA), `abierta_en`, `resuelta_en`. Relacionados: TR-OBS, TR-SOP, TR-NOT.
- **109** precondición: existen métricas y alertas. Flujo: abre el tablero; se consulta `obs.v_salud_sucursal` y el estado de agentes; semáforo por tenant y sucursal; detalle con indicadores, alertas y tickets. Datos: `tenant`, `sucursal`, `alertas_criticas`, `alertas_altas`, `ultimo_evento`, `agente_edge` (EN_LINEA|SIN_CONEXION|NO_APLICA), `semaforo` (VERDE|AMARILLO|ROJO). Relacionados: TR-OBS, TR-EDGE, TR-SOP.
- **110** precondición: alerta ABIERTA. Flujo: lista filtrada por estado y severidad; reconoce con comentario; pasa a RECONOCIDA y suspende repeticiones; se resuelve sola al normalizarse. Datos: `alerta_id`, `comentario` (3-500), `reconocida_por`, `reconocida_en`. Nota: el texto dice que el cliente *ve* y el equipo de plataforma *reconoce*, pero TR-CA-268 hace reconocer al dueño (ver pregunta 4).

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-263 | 108 | Positivo | SIN_DATOS de `cpe.emitidos`, ventana 60 min; «Cayma» sin comprobantes de 12:00 a 13:00 de un sábado → alerta ALTA y ticket automático |
| TR-CA-264 | 108 | Borde | CAIDA_PCT con base mínima 10 y línea base 4; valor 0 → no abre alerta |
| TR-CA-265 | 108 | Positivo | Alerta de caída abierta; pedidos vuelven a la línea base → RESUELTA con hora |
| TR-CA-266 | 109 | Positivo | «Huancayo» con alerta CRITICA abierta → rojo con detalle |
| TR-CA-267 | 109 | Borde | Sucursal nueva sin eventos ni reglas → gris «Sin actividad registrada» |
| TR-CA-268 | 110 | Positivo | Dueño reconoce «Sin pedidos en 30 min» con «Local cerrado por inventario» → RECONOCIDA, sin repetir notificaciones |
| TR-CA-269 | 110 | Negativo | Admin del tenant A reconoce alerta del tenant B → 404 |

Faltan (proponer): no duplicar (dos ciclos seguidos con la condición cumplida = una alerta, TR-RNF-127); detección ≤ 2 min desde el evento; RECONOCIDA también se resuelve sola; evaluación fuera de horario (SIN_DATOS a las 03:00 con el local cerrado); reglas de tenant y de plataforma sobre la misma sucursal; semáforo AMARILLO (no hay GWT); comentario < 3 caracteres; agente de soporte ve todos los tenants y el cliente solo el suyo.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-040 | Una alerta abierta por regla y sucursal (`ux_alerta_abierta`); CAIDA_PCT solo si la línea base (mismo tramo y día de la semana, 4 semanas previas) supera la base mínima. |
| TR-RNF-127 | Evaluador cada minuto; detección ≤ 2 min desde el evento; 0 alertas duplicadas. Verificación: integración con series sintéticas. |
| TR-RNF-005 | Disponibilidad de la API ≥ 99,5 % en horario comercial (el evaluador no debe degradarla). |
| TR-RNF-126 | `obs.*` sin datos personales (el `detalle` de la alerta tampoco). |
| TR-RNF-002 | Tablero y lista p95 < 1,5 s. |
| TR-RNF-020 | Usuario operativo aprende en < 1 h. |

Heredados por CLAUDE.md: 001/003, 008, 010, 011, 012, 013 (reconocimiento auditado), 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-10 | 24 | 10 | TR-OBS | Indicadores de negocio, reglas de alerta y salud por tenant | TR-RF-106 a 109 | Full | R3 |

RF 110: sin historia. Relacionadas: R3-08 y R3-09 (sprint 23, SOP; antes que OBS en el calendario aunque PL-10 pone OBS antes que SOP), R2-09 y R3-11 (canales de aviso), P-01 (alertas técnicas de producción), spec 21 (alerta de Grafana del outbox).

## 6. Tablas SQL, eventos, puertos y permisos
- `obs.alerta` (OP-12, T-09): `id`, `tenant_id` (RLS), `regla_id`, `sucursal_id`, `severidad` (copiada de la regla), `estado`, `valor`, `referencia`, `detalle` jsonb sin PII, `abierta_en`, `reconocida_por`, `reconocida_en`, `comentario`, `resuelta_en`, `ultima_notificacion_en`, `version`. Índice único parcial `ux_alerta_abierta (regla_id, sucursal_id) WHERE estado IN ('ABIERTA','RECONOCIDA')`.
- Funciones: `obs.evaluar_reglas(ahora)` y `obs.linea_base(indicador, sucursal, tramo)`; las ejecuta un rol `obs_evaluador` con `SECURITY DEFINER` para cruzar tenants (patrón `sync_lector` y `aud_lector`). Vista `obs.v_salud_sucursal` (tenant, sucursal, alertas por severidad, último minuto con datos, semáforo).
- **Eventos** (el SRS no los nombra; propuestos): `obs.alerta.abierta` (`alerta_id`, `regla_id`, `tenant_id`, `sucursal_id`, `severidad`, `crea_ticket`), `obs.alerta.resuelta`, `obs.alerta.reconocida`. Los consumen SOP (112), TR-NOT (aviso) y AUD.
- **Puertos**: `EvaluadorReglas` (worker), `AlertasRepositorio`, `NotificadorAlertas` (adaptador nulo hasta que exista TR-NOT), `ConsultaSalud`.
- **Permisos** (SRS): `plat.sistema.job`, `plat.salud.ver` (operador), `plat.alerta.reconocer`. Falta: ver alertas del tenant sin reconocer (propuesta `plat.alerta.ver`, TENANT). Agregar `plat.salud.ver` y `plat.alerta.reconocer` a `PLAT_AGENTE_SOPORTE` (hoy tiene 3 permisos).
- **Endpoints** (propuestos): `GET /v1/obs/salud` (tenants), `GET /v1/obs/salud/{tenantId}/sucursales`, `GET /v1/obs/alertas`, `POST /v1/obs/alertas/{id}/reconocer`. Controladores en `apps/api/src/observabilidad/` si `comp:obs` sigue sin `seg` (precedente `apps/api/src/eventos/`).
- **UI**: consola, ruta `/salud` (prevista en `estructura_frontend.txt`: `/auth/* · /tenants · /catalogos · /eventos · /salud`); admin-cliente, lista de alertas. Lib feature nueva (p. ej. `consola-salud`) o página en `admin-cliente`.
- **Migración**: `db/01?_obs_alertas.sql` (después de `01?_obs_negocio.sql`).

## 7. Código base relacionado
- Worker: `apps/worker/src/{vencimientos,soporte,auditoria}` con tareas BullMQ periódicas; `registrarMetricasOutbox` cada minuto (spec 21) da el patrón de lectura entre tenants.
- `db/01h_obs_estado_outbox.sql`, `db/01g_aud_integridad.sql`: roles lectores `SECURITY DEFINER`, `REVOKE` a `anon, authenticated`.
- `OutboxPublisher` en `kernel-infra` para publicar los eventos de alerta en la misma tx.
- Shell y UI: `vit-tabla`, `vit-chip-estado` + `TonoEstado`, `vit-filtros`, `vit-estado-vacio`, `PanelLateralService` (reconocer con comentario), `insignias-menu.service.ts` en `shared/shell` (contador de alertas abiertas en el menú).
- `apps/api/src/salud/salud.controller.ts` es solo el *health check* público (`{ estado: 'ok' }`); no es RF 109. Evitar el choque de nombre de ruta.
- Falta: esquema de alertas, evaluador, vista, UI, TR-NOT.

## 8. Diagramas relevantes
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`.
- `01-analysis/.../6_Plataforma_Operacion/OP-02_...` (evaluador, `obs.alerta` deduplicada, tablero de salud, aviso WhatsApp/correo).
- `01-analysis/.../6_Plataforma_Operacion/OP-03_Secuencia_de_la_caida_de_pedidos_al_ticket_con_su_traza.mmd` (caída 85 % → alerta CRÍTICA → ticket P1; se resuelve sola).
- `01-analysis/.../6_Plataforma_Operacion/OP-12_...` y `8_Diseno_Piloto/2_Plataforma_Transversal/T-09_...` (Alerta, ReglaAlerta).
- `01-analysis/.../6_Plataforma_Operacion/OP-01_Mapa_de_la_plataforma_de_operacion.mmd` (alerta → Centro de Soporte).

## 9. Ambigüedades y preguntas candidatas
1. ¿Evaluación en SQL o en TypeScript? Recomendación: función SQL que devuelve candidatos (ventana y línea base agregadas) y dominio TS que decide abrir/resolver; así el dominio queda probado sin BD y el SQL agrega cerca de los datos.
2. ¿Escala? Recomendación: un trabajo BullMQ repetible por minuto con `jobId` por minuto (idempotente) y lote por tenant; medir con 50 tenants × 5 sucursales × 10 reglas.
3. ¿Repetición de notificaciones? El SRS no da frecuencia. Recomendación: repetir cada 30 min mientras ABIERTA (parámetro TR-CFG `plat.obs.repetir_aviso_min`); RECONOCIDA no repite.
4. ¿Quién reconoce? Recomendación: los dos (TR-CA-268 lo hace el dueño): `plat.alerta.reconocer` en `PLAT_PROPIETARIO` (TENANT) y en `PLAT_AGENTE_SOPORTE` (operador, todos los tenants).
5. ¿Semáforo? Recomendación: ROJO con alguna CRITICA abierta; AMARILLO con ALTA o MEDIA abierta o sin eventos en 60 min en horario; VERDE en otro caso; gris sin reglas ni eventos (TR-CA-267).
6. ¿Horario del local? SIN_DATOS a deshora daría falsos positivos. Recomendación: evaluar SIN_DATOS solo si la línea base del tramo es > 0 (el local suele tener actividad a esa hora).
7. ¿Ticket automático en este spec? Recomendación: no; publicar `obs.alerta.abierta` con `crea_ticket` y dejar que SOP lo consuma (112). TR-CA-263 se cierra al implementar SOP.
8. Calendario: SOP (sprint 23) va antes que OBS (sprint 24) aunque PL-10 diga OBS → SOP. Recomendación: mantener el calendario; 112 se implementa después de esta parte a.
