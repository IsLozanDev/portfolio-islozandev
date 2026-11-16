# Contexto para sop-widget-tickets-comentarios

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores, Actores), `3_plan.json`, `plan.md` (6.1), `2_Estructura/estructura_frontend.txt`, diagramas T-09, OP-01, OP-10, OP-11, OP-12, specs 18 y 18b, código de `libs/plataforma/{seguridad,consola-soporte,org,correlativos,catalogos}` y `libs/shared/shell`.

## 1. Alcance y dependencias
- Historia **R3-08** (sprint 23, 14 h, Full, R3): «Widget de soporte con contexto, bandeja por SLA, estados y comentarios», RF 111, 113, 114, 115. Este paquete cubre 111 y 115 (creación y conversación); `sop-bandeja-sla-estados.md` cubre 113 y 114.
- PL-10: `NOT --> SOP` y `OBS --> SOP`. El núcleo de tickets no necesita OBS (solo RF 112). TR-NOT (R2-09) da la constancia y los avisos; TR-ARC (R2-03) los adjuntos.
- **Qué NO es TR-SOP** (ya implementado en specs 18/18b, componente TR-SEG, RF 019-020): `libs/plataforma/consola-soporte` (páginas del agente para *solicitar* y *entrar* con acceso temporal a un tenant), `seg.acceso_soporte` (ticket `SOP-######` solo por formato), banner `banner-soporte` y `sesion-soporte.service.ts` en `shared/shell`, rol `PLAT_AGENTE_SOPORTE` con `plat.soporte.solicitar`. TR-SOP es el centro de tickets: crearlos, SLA, estados, comentarios, problemas y base de conocimiento.
- **Lo que TR-SOP debe cerrar de spec 18**: reemplazar `VerificadorTicketPorFormato` (no comprueba nada) por un verificador real (ticket existe, abierto y asignado al agente) y disparar `RevocarAccesosPorTicket` al cerrar el ticket (TR-CA-055).
- Partición propuesta (14 h del plan para 4 RF es corto; estimación de este paquete 15 h):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | sop-tickets-nucleo | 111 (back), 115 (back) | 8-9 | 07, 12 (suscripción y plan), 19c (`CalendarioPort`), 11 |
| b | sop-widget-ui | 111 (widget), 115 (vista del cliente) | 6 | a, 13, 15/15b/15c/15d, 17c |

- Áreas de (a): modelo `sop` y alta de ticket con prioridad y vencimientos; comentarios y notas con visibilidad; API `/v1/sop` del cliente. Áreas de (b): lib `soporte-widget` con captura de contexto; «Mis tickets» con conversación pública.
- Fuera de alcance: sugerencia de artículos en el widget (paso 2 de 111 y TR-CA-272, depende de RF 118); adjuntos (TR-ARC); constancia por correo si TR-NOT no está (adaptador nulo); bandeja, asignación y estados (otro paquete); canal WhatsApp (OP-10).
- Constitución: reglas 1-11; diseño UI (formulario en panel lateral; «Mis tickets» con pantalla tipo lista y detalle).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-111 | Crear ticket desde el widget con contexto | plat.soporte.crear_ticket | APP-05 | TR-RN-036, 037, 039 | TR-RNF-026, 020 | Usuario operativo, Administrador del cliente |
| TR-RF-115 | Comentar y registrar notas internas | plat.soporte.comentar | APP-01 | TR-RN-039, 037 | TR-RNF-013, 020 | Agente de soporte (N1/N2), Usuario operativo |

- **111** precondición: sesión en un producto. Flujo: abre el widget, elige tipo, título, descripción, impacto y urgencia; el widget sugiere artículos; se captura contexto técnico y se eliminan claves prohibidas; `sop.crear_ticket` toma el plan del tenant y calcula prioridad y vencimientos; responde `SOP-######` y envía constancia. Datos: `tipo` (INCIDENTE|CONSULTA|REQUERIMIENTO|MEJORA), `titulo` (5-200), `descripcion` (10-5000), `impacto` (1-3), `urgencia` (1-3), `adjuntos` (TR-ARC), `contexto` (JSON sin PII: producto, módulo, versión, ruta, navegador, trace_id, errores recientes). Salida: ticket NUEVO con prioridad y vencimientos. Relacionados: TR-SOP, TR-ARC, TR-ORG, TR-NOT.
- **115** precondición: ticket no CERRADO. Flujo: escribe texto y elige público o nota interna (solo agentes); se registra el evento con visibilidad; la primera respuesta pública de un agente sella `primera_respuesta_en`; se notifica al cliente solo lo público. Datos: `ticket_id`, `tipo` (COMENTARIO|NOTA_INTERNA), `texto` (1-5000), `visible_cliente`, `adjuntos`. Relacionados: TR-SOP, TR-ARC, TR-NOT.
- Interfaz (hoja Componentes): «Librería Angular. API de tickets (`sop.crear_ticket`, `cambiar_estado`, `crear_desde_alerta`, `resolver_problema`); vistas `v_evento_cliente` y `v_tablero_sla`; librería Angular `soporte-widget`». Consumidores: solo COL lo declara (widget en el shell de backoffice y tickets desde alertas).

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-270 | 111 | Positivo | Plan PRO; cajera reporta «No imprime boletas» con impacto 1 y urgencia 1 → `SOP-000301` P1 con vencimientos de PRO-P1 |
| TR-CA-271 | 111 | Negativo | Contexto con clave `dni` → se elimina antes de guardar y el ticket se registra |
| TR-CA-272 | 111 | Borde | Artículo sugerido resuelve la duda → no se crea ticket y suma voto útil (depende de RF 118) |
| TR-CA-280 | 115 | Positivo | P2 vence primera respuesta a las 10:30; agente responde público a las 10:05 → `primera_respuesta_en` 10:05, SLA cumplido |
| TR-CA-281 | 115 | Negativo | Nota interna marcada visible → se impide y se guarda no visible |
| TR-CA-282 | 115 | Borde | 2 comentarios públicos y 1 nota → el cliente solo ve los 2 |

Faltan (proponer): ticket creado fuera de horario LABORAL (el plazo empieza el siguiente tramo hábil); contexto con token, contraseña o tarjeta (RN-039, no solo DNI); usuario de otro tenant no ve el ticket (404); comentario en ticket CERRADO (rechazo); respuesta del cliente en ESPERA_CLIENTE (la reanudación es de 114); numeración `SOP-######` sin duplicados con creación concurrente.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-036 | Prioridad por impacto + urgencia: 2 → P1, 3 → P2, 4 → P3, 5-6 → P4. |
| TR-RN-037 | Plazos de primera respuesta y resolución por plan y prioridad; LABORAL = L-V 08:00-18:00 y S 08:00-13:00 (Lima); SLA en pausa en ESPERA_CLIENTE. |
| TR-RN-039 | Notas internas nunca visibles al cliente; contexto sin DNI, contraseñas, tokens ni tarjetas (`ck_nota_interna_oculta`, `ck_ticket_contexto_sin_pii`). |
| TR-RNF-026 | Logs sin datos personales (el contexto tampoco los lleva). |
| TR-RNF-013 | Conversación del ticket como registro trazable. |
| TR-RNF-020 | Usuario operativo aprende en < 1 h. |

Heredados por CLAUDE.md: 001/002/003, 008 (crear ticket idempotente por clave del widget), 010, 011, 012, 024/119, 025, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-08 | 23 | 14 | TR-SOP | Widget de soporte con contexto, bandeja por SLA, estados y comentarios | TR-RF-111, 113, 114, 115 | Full | R3 |

Sprint 23: 18 h planificadas (R3-08 + R3-09). Relacionadas: S-06 (spec 18, acceso temporal), R2-03 (TR-ARC), R2-09 (TR-NOT), R3-09 (problemas), R3-10 (alertas). OP-13 ponía el Centro de Soporte propio en la Fase 2 (3 productos o 20-30 clientes) con «mesa de ayuda existente + botón Ayuda» antes; el plan lo deja en R3.

## 6. Tablas SQL, eventos, puertos y permisos
Base: OP-12 y T-09.
- `sop.politica_sla` (global): PK (`plan`, `prioridad`), `primera_respuesta_min`, `resolucion_min`, `horario` (LABORAL|CONTINUO). Planes reales: `org.suscripcion.plan` IN (BASICO, PRO, EMPRESA). El SRS no da los minutos (pregunta 1).
- `sop.ticket`: `id`, `numero` (`SOP-######`, único global), `tenant_id` (RLS), `sucursal_id`, `producto_codigo`, `tipo`, `titulo`, `descripcion`, `impacto`, `urgencia`, `prioridad`, `estado`, `nivel` (N1|N2), `canal` (WIDGET|ALERTA), `reportado_por` (nulo si ALERTA), `asignado_a`, `contexto` jsonb con CHECK sin claves prohibidas, `primera_respuesta_vence`, `resolucion_vence`, `primera_respuesta_en`, `pausado_desde`, `resuelto_en`, `cerrado_en`, `alerta_id` único nulo, `problema_id`, `version`.
- `sop.ticket_evento`: `id` bigint, `ticket_id`, `tipo` (CREADO|COMENTARIO|NOTA_INTERNA|CAMBIO_ESTADO|ASIGNACION|...), `texto`, `visible_cliente`, `es_agente`, `autor_id`, `creado_en`; CHECK `NOT (tipo = 'NOTA_INTERNA' AND visible_cliente)`. Vista `sop.v_evento_cliente` (solo visibles).
- Numeración: secuencia global `sop.numero_ticket` (TR-SEQ es por tenant y serie; el número es de plataforma). Debe cumplir el CHECK `^SOP-[0-9]{6}$` de `seg.acceso_soporte.ticket`.
- **Eventos** (el SRS no los nombra; propuestos): `sop.ticket.creado`, `sop.ticket.comentado` (solo públicos, para TR-NOT), `sop.ticket.cerrado` (lo consume SEG para revocar accesos).
- **Puertos**: `TicketsRepositorio`, `PoliticasSla`, `CalculadoraVencimientos` (dominio puro + `CalendarioPort` de catálogos para feriados), `PlanDelTenant` (org), `LimpiadorContexto` (dominio), `Notificador` (nulo sin TR-NOT), `NumeradorTickets`.
- **Permisos** (SRS): `plat.soporte.crear_ticket`, `plat.soporte.comentar`. Falta: ver los tickets propios del tenant (propuesta `plat.soporte.ver_tickets`) y distinguir agente de cliente (permiso de operador, patrón `OPERADOR_REQUERIDO` de 17a).
- **Nx**: lib `libs/plataforma/soporte` (`comp:sop`, árbol del plan `soporte/ (R3)`); agregar `comp('sop', 'kernel', 'seg', 'org', 'evt', 'cat', 'cfg')` (+ `obs` para 112, `not` cuando exista). Front: `soporte-widget` (estructura_frontend lo lista bajo `libs/plataforma/`, R3).
- **Migración**: `db/01?_sop.sql` + rollback + test (siguiente letra libre).

## 7. Código base relacionado
- `seguridad`: `VerificadorTicket` (puerto en `application/ports/verificador-ticket.port.ts`; ni el puerto ni el token `VERIFICADOR_TICKET` se exportan hoy por `index.ts`), `VerificadorTicketPorFormato`, `RevocarAccesosPorTicket` (exportado), dominio `Ticket` con regex `SOP-\d{6}`.
- `shared/shell`: `banner-soporte`, `sesion-soporte.service.ts`, `insignias-menu.service.ts` (patrón de insignias). `scope:shared` no puede importar `scope:plataforma`: el widget no puede vivir dentro del shell si es lib de plataforma (pregunta 3).
- `org`: suscripción con `plan`. `catalogos`: `CalendarioPort` (19c). `parametros`: `ParametroPort`.
- Contexto técnico: `traceId` del ALS en la API; en el frontend no hay Sentry ni buffer de errores (spec 21 solo puso Sentry en el backend).
- UI: `PanelLateralService`, `vit-acciones-formulario`, `vit-tabla`, `vit-chip-estado`, `AvisosService`.
- `codigo/` del plan: nada de `sop`.

## 8. Diagramas relevantes
- `01-analysis/.../8_Diseno_Piloto/2_Plataforma_Transversal/T-09_Modelo_de_dominio_Centro_de_soporte_y_observabilidad.mmd`.
- `01-analysis/.../6_Plataforma_Operacion/OP-12_...`, `OP-10_Proceso_de_atencion_de_incidencias.mmd`, `OP-11_Ciclo_de_vida_del_ticket.mmd`, `OP-01_Mapa_de_la_plataforma_de_operacion.mmd`, `OP-13_Hoja_de_ruta_de_la_plataforma_de_operacion.mmd`.
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`.

## 9. Ambigüedades y preguntas candidatas
1. ¿Minutos de SLA por plan y prioridad? El SRS no los da. Recomendación: sembrar una tabla inicial (p. ej. PRO-P1: 30 min / 4 h, CONTINUO; BASICO-P4: 8 h / 5 días, LABORAL) y que el usuario la confirme antes de aprobar el spec.
2. ¿Feriados en el horario LABORAL? RN-037 no los menciona. Recomendación: excluir feriados GLOBAL con `CalendarioPort` (19c); sin feriados de tenant.
3. ¿Dónde vive el widget? Recomendación: lib `libs/plataforma/soporte-widget` (`type:feature`) que cada app monta en su layout con un *slot* del shell (`shared/shell` expone un hueco de acciones de cabecera sin importar la lib).
4. ¿Errores recientes? Recomendación: `ErrorHandler` del widget con un buffer en memoria de los últimos 5 errores (mensaje y ruta, sin cuerpos de respuesta); Sentry del frontend queda aparte.
5. ¿Quién puede crear tickets? Recomendación: `plat.soporte.crear_ticket` en todos los roles PLAT predefinidos y en los manifiestos de producto; es PLAT y no depende de suscripción.
6. ¿Limpieza del contexto? Recomendación: lista de claves prohibidas en dominio (dni, documento, password, clave, token, authorization, tarjeta, cvv) aplicada en profundidad, más CHECK en BD como segunda barrera.
7. ¿Verificador real de spec 18? Recomendación: SOP implementa `VerificadorTicket` (exportar puerto y token desde `seguridad`) y apps/api lo cablea; SEG consume `sop.ticket.cerrado` para revocar.
