# Contexto para fe-entrega-comprobante

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, SRS (RF-062, RF-074 a 079, Criterios GWT, Reglas de negocio, RNF, Componentes), `plan.md`, `3_plan.json`, diagramas T-S3, T-S5, T-07, código real.

## 1. Alcance y dependencias
- RF-062 no tiene historia FE propia: el plan lo mete en **R2-09** (sprint 15, 6 h, componente TR-NOT): «Notificaciones por correo: plantillas, envío, estados; entrega del comprobante», TR-RF-062, 074, 075, 079. Este paquete cubre solo la parte FE de esa historia; el núcleo de TR-NOT (plantillas, `NotificacionPort`, estados de entrega) es del paquete de TR-NOT.
- Depende de: TR-NOT (`NotificacionPort.enviar`, plantilla base `CPE_EMITIDO`), TR-ARC (URL firmada del PDF y XML), `fe-envio-cdr` (`cpe.aceptado`), `fe-representacion-impresa` (PDF). TR-PER opcional (correo del adquirente).
- Horas: 3-4 h para la parte FE (consumidor + datos del destinatario + plantilla). Un spec chico; puede ir como cuarta área del spec de TR-NOT si este queda bajo 10 h (P1).
- Áreas: (a) consumidor idempotente de `cpe.aceptado` que decide canal y destinatario, (b) variables y adjuntos o enlaces firmados de la plantilla `CPE_EMITIDO`, (c) registro de la entrega para el monitor.
- Fuera de alcance: WhatsApp (TR-RF-078, R3-11), consulta pública de comprobantes en `<cod>-web` (va en `fe-pendientes-posteriores.md`: depende de TR-POR/TR-CMS, R3), preferencias y bajas del destinatario (TR-RF-077, R2-10).
- Constitución: 1, 2, 3, 4 (consumidor idempotente por `event_id`), 8, 10, 11.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor | Prior./Fase |
|---|---|---|---|---|---|---|---|
| TR-RF-062 | Entregar comprobante al cliente | plat.fe.entregar | APP-03 | TR-RN-025, 027 | TR-RNF-017, 015, 004 | Producto, cliente final | Should / MVP |

- Precondición: comprobante ACEPTADO.
- Flujo: 1) al publicarse `cpe.aceptado`, verifica si el adquirente tiene correo o celular; 2) envía con plantilla `CPE_EMITIDO` y enlace firmado; 3) el cliente puede consultar en la página pública con los datos del comprobante; 4) el sistema valida y permite descargar PDF y XML.
- Datos: `canal` (CORREO|WHATSAPP), `destinatario`, `consulta_publica`: ruc_emisor, tipo, serie, numero, fecha_emision, total.
- Componentes: TR-FE, TR-NOT, TR-ARC, TR-POR. Procesos TR-P04, TR-P06.
- Relacionados de TR-NOT: TR-RF-074 (plantillas), 075 (`NotificacionPort.enviar(plantilla, destinatario, variables, canal)` con cola persistente y verificación de bajas, finalidad TRANSACCIONAL|PROMOCIONAL), 079 (estados de entrega y canal alterno).

## 3. Criterios GWT
- **TR-CA-157** (Positivo, «Envío por correo»): F001-00000100 aceptada, adquirente con correo contabilidad@andina.pe, se publica `cpe.aceptado` -> recibe el correo con PDF y XML.
- **TR-CA-158** (Negativo, «Consulta pública con total incorrecto»): B002-00000125 por S/ 45,50, consulta con S/ 45,00 -> «No se encontró el comprobante con los datos ingresados». Pertenece a la consulta pública (fuera de este paquete).
- Faltan (proponer): adquirente sin correo -> no envía y no falla; mismo `cpe.aceptado` entregado dos veces -> un solo correo (idempotencia); ACEPTADO_CON_OBSERVACIONES también se entrega; destinatario dado de baja del canal -> no se envía (RN-025: transaccionales respetan bajas del canal); enlace firmado vence (RN-027, 15 min o el plazo que fije TR-NOT para correos); reenvío manual desde el monitor; el log no contiene el correo en claro (RNF-026).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-025 | Transaccionales sin consentimiento promocional, pero respetan bajas del canal; promocionales solo con consentimiento y de 8:00 a 20:00 (Lima). |
| TR-RN-027 | Descarga por URL firmada de vigencia máxima 15 min. |
| TR-RN-026 | WhatsApp fuera de 24 h solo con plantillas aprobadas (R3). |
| TR-RNF-017 | Representación y XML conformes a SUNAT. |
| TR-RNF-015 | Límite de tasa en endpoints públicos (aplica a la consulta pública, fuera de este paquete). |
| TR-RNF-004 | Core Web Vitals del portal público (consulta pública, fuera). |

Heredados por CLAUDE.md: 008, 010, 011, 012, 024/119, 025, 026, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-09 | 15 | 6 | TR-NOT | Notificaciones por correo: plantillas, envío, estados; entrega del comprobante | TR-RF-062, 074, 075, 079 | Back | R2 |

Relacionadas: R2-10 (recordatorios, preferencias y bajas), R2-11 (UI de plantillas), R3-07 (portal del cliente), R3-11 (WhatsApp).

## 6. Tablas SQL, eventos, puertos y permisos
- **Tablas**: ninguna en `fe` si TR-NOT registra el mensaje con referencia (`referencia_tipo = 'CPE'`, `referencia_id`). Si se quiere ver en el monitor: columna `entregado_en` o consulta al registro de TR-NOT.
- **Eventos**: consume `cpe.aceptado` con `@SuscribirEvento` (consumidor idempotente por `event_id`, spec 11). No publica (TR-NOT publica sus estados).
- **Puertos**: `NotificacionPort.enviar` (TR-NOT), `ArchivoPort.urlFirmada` (TR-ARC), `ComprobantePort`/lectura interna para variables (emisor, serie-número, total, fecha).
- **Plantilla base** `CPE_EMITIDO` (canal CORREO; variables `razon_social_emisor`, `tipo`, `serie_numero`, `total`, `fecha_emision`, `enlace_pdf`, `enlace_xml`), declarada en el manifiesto PLAT o en la semilla de TR-NOT.
- **Permisos**: `plat.fe.entregar` (llamada interna del consumidor y reenvío manual `POST /v1/fe/comprobantes/{id}/entrega`).
- **Destinatario**: hoy RF-053/054 no piden correo del adquirente. Hay que agregar `adquirente.correo` (opcional) a la solicitud de emisión o resolverlo por `persona_id` en TR-PER (P2).

## 7. Código base relacionado
- **EVT (11)**: `SuscribirEvento` (`libs/plataforma/eventos`), entrega al menos una vez, reproceso de fallidos.
- **AUD (20a)**: `EVENTOS_AUDITADOS` como ejemplo de consumidor registrado en el worker.
- **Antecedente**: el spec 12 publica `suscripcion.por_vencer` y deja el correo para TR-NOT en R2; el mismo patrón aplica a `cpe.aceptado`.
- **Correo**: la memoria del proyecto registra Resend como proveedor de correo para notificaciones (entra con TR-NOT).
- **No existe**: TR-NOT, TR-ARC, plantillas, nada de FE.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S3_Secuencia_Emision_de_comprobante_electronico.mmd` (tras aceptación: «enviar PDF al correo del paciente»).
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S5_Secuencia_Recordatorio_programado_con_preferencias_del_paciente.mmd` (preferencias y bajas).
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd`.
- `9_Plan_Implementacion/PL-10_Dependencias_entre_componentes_transversales.mmd` (no dibuja `NOT --> FE`: dependencia real que falta).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- RF-062 mezcla dos cosas de releases distintas: entrega por correo (R2) y página pública de consulta (necesita `<cod>-web`, TR-POR/TR-CMS en R3).
- PL-10 no muestra `NOT --> FE` ni `FE --> NOT`.
- No hay campo de correo del adquirente en la emisión.
- «PDF y XML» adjuntos o por enlace: CA-157 dice «recibe el correo con PDF y XML»; el flujo dice «enlace firmado».

Preguntas candidatas, con recomendación:
1. **¿Spec propio o dentro de TR-NOT?** Recomendación: spec propio chico (`fe-entrega-comprobante`) justo después del núcleo de TR-NOT, para no inflar R2-09 y para que el consumidor viva en la lib `comprobantes`.
2. **¿De dónde sale el correo?** Recomendación: campo opcional `adquirente.correo` en la solicitud de emisión (lo tiene la caja) y, si viene `persona_id`, respaldo en los contactos de TR-PER.
3. **¿Adjuntos o enlaces?** Recomendación: PDF adjunto (pesa poco) y XML por enlace firmado de larga vigencia que emite TR-NOT (no 15 min: un correo se abre días después). Documentar la excepción a RN-027 o usar un enlace a la consulta pública cuando exista (R3).
4. **¿WhatsApp?** Recomendación: fuera de R2 (R3-11). `canal` se modela desde ya.
5. **¿Entrega automática por defecto?** Recomendación: sí, configurable por emisor (`entregar_automatico`), porque es Should y algunos negocios no quieren correos.
