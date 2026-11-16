# Contexto para arco-registro-atencion

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, `srs_docs.txt` (RF 088-089, GWT 217-220, TR-RN-029/030, TR-RNF-116/016, Actores ACT-18, Componentes TR-AUD), `plan.md` (§6.1 R2 «derechos ARCO»), `3_plan.json`, specs 19c (calendario), 10 (correlativos), 20a/20b/20c, paquetes `tr-not`.

## 1. Alcance y dependencias
- Historia R2-17 (sprint 18, 5 h, Full, R2): «Derechos ARCO (registro y atención) e incidentes de datos». RF 088, 089, 091. Este paquete cubre 088 y 089; 091 está en `arco-incidentes-datos.md`. Roadmap R2: slug `arco-incidentes`.
- Lib: `libs/plataforma/auditoria` (el árbol del plan dice «auditoría · ARCO (R2)»). Esquema `aud`.
- PL-10: `SEG --> AUD`, `EVT --> AUD`. RF-088 cita además TR-POR (R3), TR-SEQ, TR-CAT, TR-NOT, TR-ARC; RF-089 cita TR-EVT, TR-NOT, TR-ARC.
- Depende de (implementados): 10 (`CorrelativoPort`), 19c (`CalendarioPort.sumarDiasHabiles`), 20a/20b (lib `auditoria`, `AuditoriaPort`), 11 (outbox). Pendientes R2: TR-ARC R2-03 (documento de identidad, compilado PDF/JSON), TR-NOT R2-09 (constancia y alertas), TR-PER R2-01 (identificar al titular).
- Partición propuesta (5 h del plan para tres RF Full no alcanzan):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | arco-solicitud-plazos | 088 back (registro por el responsable, correlativo, vencimiento en días hábiles, constancia) + control diario 50/80 % de 089 | 8 | 10, 19c, 20a, not-envio-correo-resend, R2-03 (adjunto) |
| b | arco-atencion-compilado | 089 back (publica `arco.solicitado`, recibe aportes de productos, decisión, prórroga, respuesta) | 7 | a, R2-03 |
| c | arco-admin-ui | UI en `admin-cliente`: bandeja con plazos, registro, detalle y decisión | 6 | a, b, 15, 17c, 20c |

- Fuera de alcance: presentación por el titular desde el portal (TR-POR, R3-07: RF-088 es APP-05); cancelación/anonimización (RF-090, `arco-cancelacion-anonimizacion.md`); tablero de cumplimiento mensual (RNF-116, ver P6); vista del titular de sus accesos sensibles (pendiente de 20b/20c, ver P7).
- Constitución: reglas 1, 2, 3, 4 (registro + `arco.solicitado` en la misma tx), 5, 6, 8, 10, 11.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-088 | Registrar solicitud de derechos ARCO | publico.arco.solicitar | APP-05 | TR-RN-029, 030 | TR-RNF-116, 016 | Titular, responsable de datos (ACT-18) |
| TR-RF-089 | Atender solicitud ARCO | plat.arco.atender | APP-02 | TR-RN-029 | TR-RNF-116, 016 | Responsable de datos (ACT-18) |

Ambos Must / MVP en el SRS, proceso TR-P11; R2 por plan.
- **088** precondición: titular identificado en el portal o identidad verificada por el responsable. Flujo: elegir derecho, describir, adjuntar documento; registro con número correlativo y fecha de recepción; vencimiento en días hábiles (TR-RN-029); aviso al responsable y constancia al titular. Datos: derecho (ACCESO|RECTIFICACION|CANCELACION|OPOSICION), descripcion (10-2000), documento_identidad (archivo), canal (PORTAL|PRESENCIAL|CORREO), fecha_recepcion, vence_en. Componentes: TR-AUD, TR-POR, TR-SEQ, TR-CAT, TR-NOT, TR-ARC.
- **089** precondición: solicitud registrada. Flujo: publica `arco.solicitado` y cada producto aporta los datos del titular; el responsable revisa y decide (PROCEDE, PROCEDE_PARCIAL, IMPROCEDENTE) con fundamento; ejecuta rectificación u oposición en los productos por eventos; responde al titular y cierra. Alertas al 50 % y 80 % del plazo. Datos: solicitud_id, datos_compilados (PDF/JSON), decision, fundamento (20-2000), prorroga (booleano, una vez, con justificación), respondida_en. Componentes: TR-AUD, TR-EVT, TR-NOT, TR-ARC.

## 3. Criterios GWT
- **TR-CA-217** (088, Positivo): Juana Quispe en el portal presenta ACCESO el 12/10/2026: constancia ARCO-2026-00012 con vencimiento a 20 días hábiles.
- **TR-CA-218** (088, Negativo): sin sesión verificada y sin documento: no se registra y pide acreditar identidad.
- **TR-CA-219** (089, Positivo): ARCO-2026-00012 en el día 8 de 20, responde con compilado de CLI y PSI: queda RESPONDIDA y el titular recibe el compilado.
- **TR-CA-220** (089, Borde): rectificación con 8 de 10 días hábiles: alerta «Solicitud ARCO por vencer en 2 días hábiles».
- Estado: Pendiente. CA-217 y CA-218 suponen el portal (R3): en R2 se adaptan al registro por el responsable con canal PRESENCIAL o CORREO (documento obligatorio). CA-219 supone CLI y PSI: en R2 el único producto es SazónPOS (proponer el compilado de REST).
- Faltan y se proponen: alerta al 50 % (RNF-116); prórroga una sola vez con justificación (RN-029) y nuevo vencimiento; IMPROCEDENTE exige fundamento de 20+ caracteres; producto que no aporta datos en N días queda marcado (sin GWT); aislamiento por tenant; cada cambio de estado queda en `aud.evento_auditoria`.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-029 | Acceso en 20 días hábiles; rectificación, cancelación u oposición en 10; prorrogables una vez con justificación (verificar plazos del D.S. 016-2024-JUS). |
| TR-RN-030 | Consentimiento por finalidad, revocable (la OPOSICION lo toca vía TR-PER). |
| TR-RN-028 | Auditoría inmutable: cada paso de la solicitud se registra con `AuditoriaPort`. |
| TR-RNF-116 | Alertas al 50 % y 80 % del plazo; >= 98 % atendidas en plazo; reporte mensual de cumplimiento. |
| TR-RNF-016 | Ley 29733 y reglamento: ARCO dentro del checklist legal. |
| TR-RNF-021 | Confirmación explícita y motivo en decisiones (IMPROCEDENTE, cierre). |

Heredados: 001/002/003, 008, 010, 011, 012, 013/112, 024/119, 025, 026 (logs sin DNI ni nombre del titular), 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-17 | 18 | 5 | TR-AUD | Derechos ARCO (registro y atención) e incidentes de datos | TR-RF-088, 089, 091 | Full | R2 |

Relacionadas: E-01 (auditoría R1, specs 20a-20c), R2-01 (TR-PER), R2-03 (TR-ARC), R2-09/R2-10 (TR-NOT), R3-07 (portal). Sprint 18: 2027-06-28 a 2027-07-11 (feriado 29/06), mismo sprint que el pase a producción R2 (R2-16) y el hipercuidado (R2-18).

## 6. Tablas SQL, eventos, puertos y permisos
- **`aud.solicitud_arco`** (id, tenant_id, numero ARCO-AAAA-NNNNN, derecho, descripcion, canal, persona_titular_id NULL, titular_documento_hash, documento_archivo_id (TR-ARC), estado REGISTRADA|EN_ATENCION|RESPONDIDA|CERRADA|IMPROCEDENTE|EN_EJECUCION, recibida_en, vence_en date, prorrogada, prorroga_justificacion, decision, fundamento, respondida_en, registrada_por, version). RLS `ENABLE + FORCE` por `app.tenant_id`; tabla mutable (no es la bitácora inmutable): la evidencia va a `aud.evento_auditoria`.
- **`aud.aporte_arco`** (solicitud_id, producto_codigo, estado PENDIENTE|APORTADO|SIN_DATOS, archivo_id, aportado_en): base del compilado y de CA-222 de RF-090.
- **`aud.alerta_arco`** (solicitud_id, umbral 50|80, emitida_en): idempotencia del control diario.
- **Migración**: `db/01<letra>_aud_arco.sql` (letra siguiente libre al implementar), inverso en `rollback/` y prueba en `tests/`.
- **Eventos** (SRS): `arco.solicitado` (publica AUD; consumen productos). Propuestos: `arco.respondida`, `arco.por_vencer` (lo consume NOT), `arco.rectificacion_aprobada` / `arco.oposicion_aprobada` para el paso 3 de 089 (el SRS dice «mediante eventos» sin nombrarlos).
- **Puertos**: `CorrelativoPort.siguiente` (hoy `TipoDocumento` no tiene `ARCO`: agregarlo, ver P3); `CalendarioPort.sumarDiasHabiles` (19c); `AlmacenArchivos` (TR-ARC); `NotificacionPort.enviar`; `AuditoriaPort.registrar`. Contrato de aporte de productos: suscriptor `@SuscribirEvento('arco.solicitado')` en cada producto y `POST /v1/aud/arco/{id}/aportes` interno.
- **HTTP** bajo `/v1/aud/arco`: listar, detalle, registrar, prorrogar, decidir, responder. `@Permiso` y OpenAPI.
- **Permisos**: `plat.arco.atender` (sensible: ve datos del titular, aal2). `publico.arco.solicitar` es del portal (R3). Proponer `plat.arco.registrar` para el responsable en R2 (sin ID en el SRS). Rol nuevo `PLAT_RESPONSABLE_DATOS` (ACT-18), como `PLAT_AUDITOR` del 20b.
- **Tarea diaria**: BullMQ en `apps/worker` (patrón `auditoria/verificacion.module.ts`).

## 7. Código base relacionado
- `libs/plataforma/auditoria` (exporta `AuditoriaPort`, `AuditoriaModule`, `PERMISOS_AUD`, `VerificarIntegridad`, `EVENTOS_AUD`): ARCO entra como nuevo slice de esta lib.
- `libs/plataforma/catalogos`: `CALENDARIO_PORT` con `sumarDiasHabiles(fecha, dias, sucursalId?)` y `esDiaHabil`; feriados GLOBAL/TENANT/SUCURSAL (spec 19c).
- `libs/plataforma/correlativos`: `CorrelativoPort.siguiente({ empresaId, tipo, serie })`; tipos actuales BOLETA, FACTURA, NOTA_CREDITO, NOTA_DEBITO, TICKET, KARDEX, EXPEDIENTE, HC, ESCRITURA; la serie es por empresa.
- `apps/worker/src/auditoria/` (tarea diaria de verificación) y `soporte/tarea-vencimiento-soporte.ts` (tarea por plazo).
- Front: `libs/plataforma/admin-cliente` con `auditoria-lista`/`auditoria-detalle` (20c) y `soporte-lista`/`soporte-aprobar` (18): patrón de bandeja con plazos.
- Zona Perú para fechas: `db/01i_seg_vigencia_peru.sql`.
- No existe: TR-PER, TR-ARC, TR-NOT, portal; `codigo/` no trae ARCO.

## 8. Diagramas relevantes
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`.
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (RegistroAuditoria; ARCO no está dibujado).
- `.../T-S7_Secuencia_Relay_del_outbox_hacia_los_consumidores.mmd` (`arco.solicitado` a productos).
- `6_Plataforma_Operacion/OP-04_Se_puede_compartir_este_dato_de_persona_entre_sistemas.mmd` y `OP-07_Secuencia_autorizacion_del_titular_nivel_3.mmd` (contexto de datos de persona).

## 9. Ambigüedades y preguntas candidatas
1. ¿Partir R2-17? Recomendación: sí, en a/b/c aquí más `arco-incidentes-datos`; 5 h no cubren tres RF Full.
2. ¿Portal en R2? RF-088 es APP-05 y el portal es R3-07. Recomendación: en R2 solo registra el responsable (PRESENCIAL/CORREO); el portal usa la misma API en R3.
3. Numeración ARCO-2026-00012: ¿TR-SEQ por empresa o contador por tenant? Recomendación: tipo `ARCO` en `TIPOS_DOCUMENTO`, serie `ARCO` con reinicio ANUAL en la empresa principal del tenant; formatear `ARCO-AAAA-NNNNN` en AUD.
4. ¿Días hábiles de qué sucursal? Recomendación: sin sucursal (feriados globales y del tenant), `sabado_habil` del tenant.
5. ¿Cómo aportan datos los productos? Recomendación: evento `arco.solicitado` + aporte como archivo en TR-ARC; en R2 solo SazónPOS (spec de producto aparte).
6. Tablero mensual de cumplimiento (RNF-116) sin RF. Recomendación: consulta simple (en plazo / vencidas por mes) en la bandeja; tablero con TR-REP (R3).
7. La vista del titular de sus accesos sensibles (RF-085) quedó para «ARCO (R2)» en 20b/20c. Recomendación: entra como parte del compilado de una solicitud de ACCESO.
8. ¿Plazos legales vigentes? El SRS dice «verificar plazos». Recomendación: guardarlos como parámetros TR-CFG (`plat.arco.dias_acceso` = 20, `plat.arco.dias_otros` = 10) para corregir sin despliegue.
9. Identidad del titular sin TR-PER: Recomendación: documento (tipo + número) con hash y cifrado; enlazar `persona_titular_id` cuando exista PER.
