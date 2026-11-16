# Contexto para not-recordatorios-preferencias

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, `srs_docs.txt` (RF, Criterios GWT, Reglas, RNF, Trazabilidad, Componentes), `plan.md`, `3_plan.json`, PL-10, diagramas T-07 y T-S5, `not-correo-plantillas-estados.md` (este mismo paquete).

## 1. Alcance y dependencias
- Historia R2-10 (sprint 16, 5 h, Back, R2): «Recordatorios programados, preferencias y bajas». RF 076, 077. Roadmap R2: slug `recordatorios-preferencias`.
- Depende de: `not-envio-correo-resend` (puerto, cola, mensaje), TR-PER R2-01 (consentimientos por finalidad, canal preferido), spec 11 (outbox) y spec 21 (worker). PL-10: `EVT --> NOT`; `PER --> POR`. RF-077 cita TR-POR (portal del cliente final, R3-07).
- Partición propuesta (5 h del plan se quedan cortas por el enlace firmado y la página pública):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | not-recordatorios | 076 | 4 | not-envio-correo-resend |
| b | not-preferencias-bajas | 077 back (token firmado, endpoints públicos, efecto en el envío) + página mínima | 6 | a, R2-01 (TR-PER), 15 (UI) si hay página |

- Tres áreas de la parte a: programar (trabajo diferido BullMQ), cancelar/reprogramar por referencia, ejecutar a la hora con revalidación. Parte b: token firmado de 30 días, lectura/cambio de preferencias, enlace en el pie del mensaje.
- Fuera de alcance: portal autenticado del cliente final (R3-07); WhatsApp (R3-11); campañas masivas (sin RF); centro de notificaciones.
- Constitución: reglas 1, 2, 3, 4, 5, 8, 9 (clave de firma del enlace solo por entorno), 10, 11.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-076 | Programar recordatorios | plat.notificacion.programar | APP-03 | TR-RN-025 | TR-RNF-124, 005 | Módulo de producto, planificador |
| TR-RF-077 | Gestionar preferencias y bajas del destinatario | publico.notificacion.preferencias | APP-05 | TR-RN-025, 030 | TR-RNF-016, 019 | Cliente final / titular |

Ambos Must / MVP, proceso TR-P06 (077 también TR-P11).
- **076** precondición: plantilla existe. Flujo: el módulo programa con fecha, plantilla y referencia; trabajo diferido en BullMQ; si cambia el origen reprograma o cancela por referencia; a la hora ejecuta el envío transaccional (RF-075). Datos: plantilla, destinatario, variables, enviar_en (futura), referencia_tipo, referencia_id. Componentes: TR-NOT.
- **077** precondición: el destinatario recibió un mensaje con enlace firmado o inició sesión en el portal. Flujo: abre el enlace; ve canales y finalidades con estado; cambia canal preferido o se da de baja; el sistema registra, actualiza el consentimiento en TR-PER y confirma. Datos: persona_id, canal_preferido (CORREO|SMS|WHATSAPP), bajas[] (canal, finalidad), token (firmado, 30 días). Componentes: TR-NOT, TR-PER, TR-POR.

## 3. Criterios GWT
- **TR-CA-190** (076, Positivo): cita 12/10/2026 10:00, recordatorio programado 11/10 10:00, el paciente lo recibe a esa hora.
- **TR-CA-191** (076, Positivo): cita CIT-8821 anulada: el recordatorio se cancela y no se envía.
- **TR-CA-192** (076, Negativo): programar 09:00 cuando son las 10:00 del mismo día: «La fecha de envío debe ser futura».
- **TR-CA-193** (077, Positivo): Juana pulsa «Darme de baja» en el pie del correo: deja de recibir promociones por correo y sigue recibiendo recordatorios.
- **TR-CA-194** (077, Negativo): token alterado: «Enlace inválido o vencido» sin mostrar datos.
- Estado: Pendiente. Faltan y se proponen: reprogramar por referencia (un solo trabajo vivo por referencia); a la hora, la baja hecha después de programar se respeta (T-S5: «DESCARTADO (motivo)»); token vencido a los 30 días; promocional programado fuera de 8-20 h se corre a las 08:00 (TR-CA-189, compartido con 075); reinicio del worker no pierde trabajos (Redis persistente, TR-RNF-005).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-025 | Promocionales solo con consentimiento y de 8:00 a 20:00 Lima; transaccionales respetan bajas del canal. |
| TR-RN-030 | Consentimiento libre, previo, expreso, por finalidad; versión del texto, fecha y canal; revocable. |
| TR-RNF-124 | 95 % al proveedor en < 30 s (desde la hora programada). |
| TR-RNF-005 | Disponibilidad 99,5 %: los trabajos diferidos sobreviven reinicios. |
| TR-RNF-016 | Ley 29733: baja con efecto inmediato, evidencia del cambio. |
| TR-RNF-019 | Página pública WCAG 2.1 AA (axe-core en CI). |
| TR-RNF-008 | Programar con la misma referencia no duplica. |

Heredados: 001/002/003, 010, 011, 012, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-10 | 16 | 5 | TR-NOT | Recordatorios programados, preferencias y bajas | TR-RF-076, 077 | Back | R2 |

Relacionadas: R2-09 (envío, S15), R2-01 (TR-PER con consentimientos, S13), R3-07 (portal: preferencias con sesión, S22), R2-11 (UI plantillas, S16). Sprint 16: 2027-05-31 a 2027-06-13, feriado 07/06.

## 6. Tablas SQL, eventos, puertos y permisos
- **`not.programacion`** (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, variables, finalidad, enviar_en timestamptz, estado PROGRAMADO|ENVIADO|CANCELADO|DESCARTADO, job_id, mensaje_id NULL, version). Única parcial por (tenant, referencia_tipo, referencia_id, plantilla_codigo) con estado PROGRAMADO. La base es la fuente de verdad; BullMQ es el disparador (si Redis pierde el trabajo, un barrido lo recrea).
- **Preferencias**: si TR-PER ya guarda consentimientos (RF-043, R2-01), NOT solo lee y escribe por `ConsentimientoPort`; `not.preferencia` (persona_id, canal, finalidad, aceptado, actualizado_en) solo si PER no cubre «canal preferido» (T-07 la dibuja en NOT).
- **`not.token_preferencias`**: no hace falta tabla si el token es HMAC con vencimiento (persona_id, tenant_id, exp); revocación por rotación de clave.
- Migración en la misma letra de `not` (`db/01?_not_programacion.sql`), con inverso y prueba.
- **Eventos**: consume `consentimiento.revocado` (TR-PER) para invalidar caché de preferencias. Productos cancelan por puerto, no por evento (el SRS no define `cita.anulada` como contrato de plataforma).
- **Puertos**: `NotificacionPort.programar({ ..., enviarEn, referencia })`, `NotificacionPort.cancelar(referencia)`; reprogramar = programar con la misma referencia. `GeneradorEnlacePreferencias` (firma). `ConsentimientoPort` (TR-PER).
- **HTTP público**: `GET /v1/notificaciones/preferencias?token=` y `PUT /v1/notificaciones/preferencias` con `@Publico`, límite de tasa, respuesta neutra ante token inválido (CA-194).
- **Permisos**: `plat.notificacion.programar` interno (no se declara). `publico.notificacion.preferencias` no es asignable: `@Publico` + token.

## 7. Código base relacionado
- **Reutiliza**: lo de `not-envio-correo-resend`; `kernel-infra` (`SystemClock`, UoW); `apps/worker/src/vencimientos/` y `soporte/tarea-vencimiento-soporte.ts` (tareas programadas y barridos en BullMQ); `libs/shared/util` (fechas America/Lima según el plan; hoy solo trae `ruc.ts`: la zona Lima se resolvió en `db/01i_seg_vigencia_peru.sql` y el último commit «Fecha de Perú también en los repositorios»).
- **Front**: si hay página pública mínima, `libs/shared/ui` (`vit-cargando`, `vit-estado-vacio`) y diseño `vit-marco-auth` como marco; no hay app pública todavía (APP-05 portal es R3).
- **No existe**: TR-PER, programaciones, enlaces firmados.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S5_Secuencia_Recordatorio_programado_con_preferencias_del_paciente.mmd` (programa T-24 h y T-2 h, revalida cita y preferencia, DESCARTADO).
- `.../T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (Preferencia en NOT).
- `.../T-05_Modelo_de_dominio_Personas_e_identidad.mmd` (consentimientos en PER).
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`.

## 9. Ambigüedades y preguntas candidatas
1. ¿Preferencias en NOT o en PER? T-07 pone `Preferencia` en NOT; RF-077 dice «actualiza el consentimiento en TR-PER». Recomendación: finalidad/consentimiento en PER (fuente legal única); canal preferido y bajas por canal en NOT.
2. T-S5 hace que el worker escuche `psi.cita.confirmada` y programe; RF-076 dice que el módulo programa. Recomendación: el producto llama a `programar` (NOT no conoce eventos de productos).
3. ¿Revalidar el origen a la hora? T-S5 pregunta «¿cita sigue confirmada?». Recomendación: no; el producto cancela por referencia. NOT solo revalida bajas y consentimiento.
4. ¿Quién dibuja la página del enlace en R2, si el portal es R3? Recomendación: página mínima en la API (HTML servido) o ruta pública en `plataforma-admin` sin sesión; decidir con el usuario. Sin página, CA-193/194 se prueban por HTTP.
5. ¿Destinatario sin persona_id (dirección suelta)? Recomendación: bajas por (tenant, canal, destino_hash) para que el enlace funcione también sin TR-PER.
6. Horario 8-20 h: ¿día siguiente aunque sea feriado? Recomendación: solo horario, sin días hábiles (RN-025 no los menciona).
7. Hora de Lima: usar la misma función de fecha de Perú que dejó `01i_seg_vigencia_peru.sql` para `enviar_en` y el corrimiento a 08:00.
