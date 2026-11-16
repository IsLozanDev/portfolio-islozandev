# Contexto para arco-incidentes-datos

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `srs_docs.txt` (RF-091, GWT 223-224, TR-RN-048, RF-087 paso 4, TR-RNF-016/013, Actores), `plan.md`, `3_plan.json`, specs 20b (evento `aud.integridad.rota`), 17b (consola), 18 (soporte), 21 (observabilidad), paquetes `tr-not`.

## 1. Alcance y dependencias
- Historia R2-17 (sprint 18, 5 h, Full, R2), parte de incidentes: RF 091. Roadmap R2: slug `arco-incidentes`.
- App: APP-01 Consola de plataforma (`plataforma-consola`), actores admin de plataforma y responsable de datos del cliente (ACT-18).
- Lib: `libs/plataforma/auditoria` (esquema `aud`). Plazo de 48 h por TR-RN-048.
- Origen de incidentes: manual (actor) y automático por la verificación de integridad: RF-087 paso 4 dice «ante ruptura crea una alerta CRITICA y un incidente de seguridad». El 20b publica `aud.integridad.rota` y dejó el consumo «para OBS y NOT».
- Depende de: 20a/20b (lib `auditoria`, evento), 17b (consola), not-envio-correo-resend (alertas y comunicación a titulares), TR-ARC R2-03 (informe ANPD como archivo; opcional).
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | aud-incidentes-datos | 091 back (registro, plazo 48 h, alertas, medidas, informe, comunicación) + consumidor de `aud.integridad.rota` | 7 | 20b, not-envio-correo-resend |
| b | aud-incidentes-consola-ui | 091 UI en `plataforma-consola` (lista con plazo, registro en panel lateral, detalle, informe) | 5 | a, 17b, 15 |

- Áreas de a: dominio del incidente y su plazo; control de vencimiento (alertas a 24 h, 40 h, 48 h); informe y comunicación a titulares por TR-NOT.
- Fuera de alcance: envío electrónico a la ANPD (no hay API; se descarga el informe); reglas de alerta de TR-OBS (R3-10); vista del responsable del cliente en `admin-cliente` (ver P3).
- Constitución: reglas 1-6, 8, 10, 11.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-091 | Registrar y notificar incidente de seguridad de datos | plat.incidente.gestionar | APP-01 | TR-RN-048 | TR-RNF-016, 013 | Admin plataforma, responsable de datos del cliente |

Must / MVP en el SRS, proceso TR-P11; R2 por plan.
- **091** precondición: se detectó o reportó un incidente. Flujo: 1) registrar con fecha de conocimiento, descripción, tenants y categorías de datos afectados; 2) calcular el vencimiento de 48 h y alertar a los responsables; 3) registrar medidas y generar el informe para la ANPD; 4) opcional: comunicación a los titulares por TR-NOT. Datos: fecha_conocimiento, descripcion, tenants_afectados[], categorias_datos[], titulares_estimados, medidas, notificado_anpd_en. Componentes: TR-AUD, TR-NOT, TR-ARC.

## 3. Criterios GWT
- **TR-CA-223** (Positivo, «Notificación en plazo»): conocido el 10/10/2026 09:00 y notificado a la ANPD el 11/10/2026 15:00: queda NOTIFICADO dentro del plazo.
- **TR-CA-224** (Borde, «Plazo por vencer»): 40 h sin notificar: alerta CRITICA «Quedan 8 horas para notificar a la ANPD».
- Estado: Pendiente. Faltan y se proponen: notificación después de 48 h queda NOTIFICADO_FUERA_DE_PLAZO con justificación obligatoria; `aud.integridad.rota` crea un incidente BORRADOR una sola vez por rotura (idempotente por `event_id`); un responsable del cliente solo ve los incidentes de su tenant; cada cambio de estado se audita; fecha de conocimiento futura rechazada; comunicación a titulares no envía a contactos con baja (TR-RN-025 no aplica a avisos legales: ver P5).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-048 | Incidente con datos personales: registrar y notificar a la ANPD dentro de 48 h de conocido (verificar artículo del D.S. 016-2024-JUS). |
| TR-RN-028 | La evidencia del incidente y de su notificación queda en la auditoría inmutable. |
| TR-RNF-016 | Ley 29733: notificación de incidentes en 48 h dentro del checklist legal. |
| TR-RNF-013 | Operaciones críticas auditadas (registro, medidas, notificación). |
| TR-RNF-112 | Ruptura de la cadena de auditoría detectada por la verificación diaria (20b) alimenta un incidente. |
| TR-RNF-021 | Confirmación explícita al marcar NOTIFICADO o CERRADO. |

Heredados: 001/002, 009 (aal2 en la consola), 010, 011, 012, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-17 | 18 | 5 | TR-AUD | Derechos ARCO (registro y atención) e incidentes de datos | TR-RF-088, 089, 091 | Full | R2 |

Relacionadas: E-01 / specs 20a-20c (RF-087 implementado en 20b), R3-10 (TR-OBS reglas de alerta), R2-09 (correo). Sprint 18: 2027-06-28 a 2027-07-11.

## 6. Tablas SQL, eventos, puertos y permisos
- **`aud.incidente`** (id, codigo INC-AAAA-NNNN, origen MANUAL|INTEGRIDAD, fecha_conocimiento timestamptz, descripcion, categorias_datos text[], titulares_estimados int, medidas, estado BORRADOR|ABIERTO|NOTIFICADO|NOTIFICADO_FUERA_DE_PLAZO|CERRADO, vence_en = conocimiento + 48 h, notificado_anpd_en, justificacion_tardia, registrado_por, version).
- **`aud.incidente_tenant`** (incidente_id, tenant_id): un incidente de plataforma puede afectar varios tenants. RLS: el responsable del cliente ve filas de su tenant; el operador de plataforma (tenant `plataforma`) ve todo por la función de operador ya usada en consola (`VerificadorOperador`, ver P3).
- **`aud.alerta_incidente`** (incidente_id, umbral_horas 24|40|48, emitida_en): idempotencia del control.
- **Migración**: `db/01<letra>_aud_incidente.sql` (letra siguiente libre al implementar), inverso y prueba.
- **Eventos**: consume `aud.integridad.rota` (20b; payload sin datos personales: numero_roto, motivo, modo, desde_numero). Propuestos: `incidente.registrado`, `incidente.por_vencer` (NOT y, en R3, OBS).
- **Puertos**: `NotificacionPort` (alertas a responsables y comunicación a titulares); `AuditoriaPort`; `AlmacenArchivos` (informe, opcional). `GeneradorInformeAnpd` (PDF o XLSX; ver P4).
- **HTTP**: `/v1/aud/incidentes` (listar, registrar, medidas, notificar, cerrar, informe). `@Permiso`, OpenAPI.
- **Permisos**: `plat.incidente.gestionar` (sensible, aal2). Opción de menú en la consola (hoy `plat.consola.tenants`, `.catalogos`, `.feriados`, `.soporte`) y, si se acepta P3, en admin-cliente para el responsable.
- **Tarea**: control horario de plazos en `apps/worker` (BullMQ repetible), no diario: el plazo es en horas.

## 7. Código base relacionado
- `libs/plataforma/auditoria`: `EVENTOS_AUD.integridadRota`, `IntegridadRota`, `VerificarIntegridad`, `VerificarTodosLosTenants`, `AuditoriaPort`.
- `apps/worker/src/auditoria/verificacion.module.ts` y `tarea-verificacion.ts` (cron con `AUD_VERIFICACION_CRON`): mismo patrón para el control de plazos.
- `libs/plataforma/eventos`: `@SuscribirEvento` (consumidor idempotente por `event_id`).
- `libs/plataforma/consola-soporte` y `consola-tenants`: pantallas de consola (lista + detalle) de las que parte la UI.
- `libs/plataforma/catalogos`: `VERIFICADOR_OPERADOR` (comprobar que el actor es operador de plataforma).
- `seg.evento_seguridad` (bitácora de seguridad, spec 18/18b) no es un incidente; un acceso denegado masivo no abre incidente solo (ver P6).
- No existe: TR-NOT, generación de PDF (TR-FE R2-06 traerá representación impresa).

## 8. Diagramas relevantes
- `6_Plataforma_Operacion/OP-10_Proceso_de_atencion_de_incidencias.mmd` (incidencias de soporte; distinguir de incidente de datos).
- `6_Plataforma_Operacion/OP-12_Modelo_de_datos_del_Centro_de_Soporte_y_de_la_observabilidad_de_negoci.mmd` (alertas de OBS, R3).
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`.

## 9. Ambigüedades y preguntas candidatas
1. ¿Incidente por tenant o de plataforma con varios tenants? RF-091 trae `tenants_afectados[]` y lo registra la consola. Recomendación: incidente de plataforma con tabla puente; el responsable del cliente ve el suyo.
2. ¿`aud.integridad.rota` abre un incidente automático? RF-087 lo pide. Recomendación: sí, en estado BORRADOR para que un humano confirme si hay datos personales afectados; el plazo corre desde que se confirma (fecha de conocimiento).
3. ¿El responsable del cliente registra incidentes propios (actor del RF)? Recomendación: sí, desde `admin-cliente` con alcance de su tenant; la consola ve todos. Si no cabe, solo consola en R2.
4. ¿Formato del informe ANPD? El SRS no lo define. Recomendación: XLSX/PDF con los campos del RF; usar el exportador XLSX del 20b (18b/20b) para no esperar a FE.
5. Comunicación a titulares sin TR-PER y con bajas: Recomendación: aviso legal = finalidad TRANSACCIONAL (no requiere consentimiento promocional); destinatarios por lista subida o por consulta a productos; si no hay PER, solo envío manual.
6. ¿Qué eventos de seguridad abren incidente? Recomendación: en R2 solo manual + integridad rota; reglas automáticas con TR-OBS (R3-10).
7. Plazo 48 h corridas, no hábiles. Recomendación: horas corridas en hora de Perú; mostrar el reloj en la consola.
