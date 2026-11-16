# Contexto para not-whatsapp

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `srs_docs.txt` (RF-078, GWT 195-196, TR-RN-026, RNF 121/124/128/113, Componentes, Actores ACT-12), `plan.md` (R3, árbol `notificaciones/ (R2) ... (R3) WhatsApp`), `3_plan.json`, T-S5, IA-ARQ-02, paquetes de correo y recordatorios de esta carpeta.

## 1. Alcance y dependencias
- Historia R3-11 (sprint 24, 6 h, Back, R3): «Envío por WhatsApp con plantillas aprobadas». RF 078. Roadmap R3: slug `obs-negocio-whatsapp` (lo junta con OBS de negocio R3-10); se propone spec propio.
- Depende de: `not-envio-correo-resend` (puerto, cola, estados, conmutación de RF-079), `not-plantillas-personalizacion` (plantillas por canal), `not-recordatorios` (T-S5 usa WhatsApp para el recordatorio). PL-10: `EVT --> NOT`.
- Primer consumidor real: PsicoAgenda (H5, 2027-10-05) y REST (TR-CA-195 PEDIDO_LISTO).
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | not-whatsapp-envio | 078 (ventana 24 h, plantilla aprobada, canal alterno) + 079 para WHATSAPP (estados ENVIADO/ENTREGADO/LEIDO) | 8 | correo a y b, recordatorios a |
| b | not-whatsapp-plantillas-meta | 078 paso 1-2 (enviar a aprobación, sincronizar estado) + UI de estado en el editor | 5 | a, not-plantillas-ui |

- Áreas de a: adaptador `ProveedorWhatsapp` (puerto), registro de `ultima_interaccion` por webhook entrante, regla de ventana y conmutación.
- Fuera de alcance: conversación con IA por WhatsApp (IA-ARQ-02, TR-IA R4); SMS (sin historia en el plan); número compartido de plataforma vs. por tenant (pregunta).
- Constitución: reglas 2, 3, 4, 8, 9, 10 (proveedor detrás de puerto, TR-RNF-121).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-078 | Enviar por WhatsApp con plantillas aprobadas | plat.notificacion.whatsapp | APP-03 | TR-RN-026 | TR-RNF-121, 124 | Módulo de producto, proveedor de mensajería |

Should / MVP en el SRS; R3 por plan.
- **078** precondición: el tenant tiene número de WhatsApp Business conectado. Flujo: 1) el admin envía la plantilla a aprobación; 2) el sistema consulta y registra el estado (PENDIENTE, APROBADA, RECHAZADA); 3) al enviar verifica la última interacción del cliente; 4) fuera de la ventana usa solo APROBADAS; si no hay, cambia al canal alterno. Datos: numero_whatsapp (E.164 +51), plantilla_meta (nombre, idioma es_PE, categoría UTILITY|MARKETING|AUTHENTICATION), estado_aprobacion, ultima_interaccion. Componentes: TR-NOT.

## 3. Criterios GWT
- **TR-CA-195** (Positivo): cliente sin escribir hace 3 días y PEDIDO_LISTO APROBADA: REST envía y se entrega con la plantilla aprobada.
- **TR-CA-196** (Negativo): PROMO_DIA RECHAZADA por Meta: fuera de ventana no se envía por WhatsApp y se usa el canal alterno.
- Heredan de 075/079: TR-CA-187 (WhatsApp preferido, < 30 s al proveedor), TR-CA-197/198 (estados y conmutación).
- Faltan y se proponen: dentro de la ventana se permite texto libre; webhook de Meta con firma inválida (`X-Hub-Signature-256`) responde 401; mensaje entrante actualiza `ultima_interaccion`; promocional por WhatsApp respeta TR-RN-025 (consentimiento y horario); tenant sin número conectado cae al canal alterno sin error; límite mensual de mensajes (TR-RNF-128) avisa al 80 %.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-026 | Fuera de 24 h desde el último mensaje del cliente, solo plantillas aprobadas por Meta. |
| TR-RN-025 | Promocionales con consentimiento y en 8-20 h Lima; categoría MARKETING = finalidad PROMOCIONAL. |
| TR-RNF-121 | Proveedor tras puerto y adaptador; cambio por tenant por configuración en < 10 min. |
| TR-RNF-124 | 95 % al proveedor en < 30 s; failover de canal < 2 min. |
| TR-RNF-109 | Webhooks del proveedor firmados y con marca de tiempo. |
| TR-RNF-113 | Token de acceso de WhatsApp cifrado por tenant y rotable. |
| TR-RNF-128 | Consumo de mensajería con aviso al 80 % y corte o modo degradado al 100 % (WhatsApp cobra por conversación). |

Heredados: 007, 008, 010, 011, 012, 024/119, 026 (logs sin número de celular), 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-11 | 24 | 6 | TR-NOT | Envío por WhatsApp con plantillas aprobadas | TR-RF-078 | Back | R3 |

Relacionadas: R3-10 (OBS negocio, mismo sprint), R3-07 (portal, preferencia WHATSAPP con sesión), R3-03 (link de pago enviado por WhatsApp, TR-CA-170), RF-062 (CPE por WhatsApp). Sprint 24: 2027-09-20 a 2027-10-03.

## 6. Tablas SQL, eventos, puertos y permisos
- **`not.cuenta_whatsapp`** (tenant_id, numero E.164, phone_number_id, waba_id, credencial_ref (en el almacén de secretos), activa, version).
- **`not.plantilla`** (ya existe por el paquete de correo): usa `id_plantilla_proveedor`; se agregan `categoria`, `estado_aprobacion` PENDIENTE|APROBADA|RECHAZADA, `motivo_rechazo`, `sincronizada_en`.
- **`not.interaccion`** (tenant_id, destino_hash, ultima_interaccion) actualizada por el webhook de mensajes entrantes.
- Migración en la letra de `not` (`db/01?_not_whatsapp.sql`).
- **Eventos**: no hay en el SRS. Entrantes del proveedor por webhook, no por outbox.
- **Puertos**: `ProveedorWhatsapp` (`enviarPlantilla`, `enviarTexto`, `registrarPlantilla`, `consultarEstadoPlantilla`); `AlmacenSecretos` (compartido con PAG, ver paquete `tr-pag`); `NotificacionPort` sin cambios (el canal sale de la preferencia).
- **HTTP**: `GET /v1/notificaciones/webhooks/whatsapp` (verificación de suscripción de Meta) y `POST` (estados y entrantes), `@Publico` + firma. `POST /v1/notificaciones/plantillas/{codigo}/WHATSAPP/aprobacion` con `@Permiso`.
- **Permisos**: `plat.notificacion.whatsapp` (conectar número y enviar a aprobación; sensible por costo). Envío por puerto interno.

## 7. Código base relacionado
- Todo lo de los paquetes de correo y recordatorios (aún no implementados).
- Firma de webhooks: no hay ninguno en el repo todavía; el primero será el de Resend (R2) o el de pagos (R3). Conviene una utilidad común de verificación HMAC + ventana de 5 min en `kernel-infra` o `shared/util` (TR-RNF-109 aplica a MOD-09 y MOD-10).
- `codigo/` del plan: nada de mensajería.
- No existe: almacén de secretos por tenant (TR-RNF-113). Hoy los secretos solo están en variables de entorno.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S5_Secuencia_Recordatorio_programado_con_preferencias_del_paciente.mmd` (WhatsApp BSP, plantilla aprobada, webhook entregado/leído).
- `.../T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (`idPlantillaProveedor`).
- `2_Propuesta_IA/00_IA_Arquitectura/IA-ARQ-02_Agente_conversacional_con_herramientas_patron_comun_para_WhatsApp.mmd` (contexto, fuera de alcance).

## 9. Ambigüedades y preguntas candidatas
1. ¿Meta Cloud API directa o un BSP (Twilio, 360dialog, Gupshup)? T-S5 dice «WhatsApp BSP». Recomendación: Cloud API directa detrás de `ProveedorWhatsapp` (menor costo, sin intermediario); el BSP como segundo adaptador si un cliente lo exige.
2. ¿Número por tenant o uno de la plataforma? RF-078 asume número del tenant. Recomendación: por tenant (marca propia y límites de Meta por número); sin número, canal alterno.
3. ¿Onboarding del número (Embedded Signup de Meta) dentro del alcance? Recomendación: no; alta manual del `phone_number_id` y el token por el operador en R3.
4. ¿Canal alterno sin SMS? El plan no tiene historia de SMS. Recomendación: alterno = CORREO en R3; SMS cuando haya proveedor.
5. ¿Partir de `obs-negocio-whatsapp` del roadmap? Recomendación: sí; OBS de negocio y WhatsApp no comparten código.
6. Costo y límite (TR-RNF-128) sin historia propia. Recomendación: contar conversaciones por tenant en `not` y avisar al 80 % por correo; corte configurable por parámetro TR-CFG.
7. Plantillas AUTHENTICATION (OTP) para el portal (R3-07): ¿se envían por aquí? Recomendación: sí, mismo puerto, categoría AUTHENTICATION; confirmarlo al especificar el portal.
