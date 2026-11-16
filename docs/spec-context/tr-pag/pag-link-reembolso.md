# Contexto para pag-link-reembolso

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `srs_docs.txt` (RF 068, 070, GWT 170-171 y 175-176, TR-RN-009/023/025, RNF 007/124/021/030/009), `plan.md` (§6.1 R3), `3_plan.json`, PL-10, T-06, T-S4, paquetes `pag-pasarela-y-cobro-tarjeta.md`, `pag-yape-plin-webhook.md` y `tr-not/`.

## 1. Alcance y dependencias
- Historia R3-03 (sprint 20, 8 h, Full, R3): «Link de pago y reembolso». RF 068, 070.
- Depende de: `pag-pasarela-y-cobro-tarjeta`, `pag-webhook-pasarela` (confirmación de link y de reembolso), TR-NOT (`NotificacionPort.enviar` por correo; WhatsApp llega en R3-11, sprint 24, después de este), 05 (aal2 para reembolsar). PL-10: `NOT --> PAG`, `FE --> PAG` (el producto emite la nota de crédito al recibir `reembolso.confirmado`).
- Partición propuesta (Full de 8 h):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | pag-link-pago | 068 back (crear link, URL corta en la pasarela, envío por NOT, vencimiento a EXPIRADO) | 4 | pag-webhook-pasarela, not-envio-correo-resend |
| b | pag-reembolso | 070 back (saldo reembolsable, MFA, solicitud a la pasarela, REEMBOLSO PENDIENTE, confirmación por webhook) | 5 | pag-webhook-pasarela |
| c | pag-pagos-admin-ui | UI en `admin-cliente`: lista de pagos, detalle, reembolsar (panel lateral), generar link | 6 | a, b, pag-configuracion-ui, 15, 17c |

- Fuera de alcance: emitir la nota de crédito (TR-FE, producto); WhatsApp como canal del link (R3-11; en R3-03 solo correo); recurrencia y conciliación (R4).
- Constitución: reglas 1-6, 8, 10, 11.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-068 | Generar link de pago | plat.pago.link | APP-03 | TR-RN-023, 025 | TR-RNF-007, 124 | Módulo de producto, usuario operativo |
| TR-RF-070 | Reembolsar pago | plat.pago.reembolsar | APP-02 | TR-RN-009, 023 | TR-RNF-021, 030, 009 | Encargado de facturación, admin cliente, módulo de producto |

068 Should / MVP (procesos TR-P05 y TR-P06); 070 Must / MVP. R3 por plan.
- **068** precondición: medio LINK habilitado. Flujo: crear link con monto, concepto y vencimiento; URL corta en la pasarela y pago PENDIENTE; envío al cliente; al pagar confirma por webhook, al vencer pasa a EXPIRADO. Datos: monto (> 0), concepto (3-150), vence_en (máx. 30 días), destinatario (celular o correo), referencia (tipo e id). Componentes: TR-PAG, TR-NOT, TR-EVT.
- **070** precondición: pago CONFIRMADO; actor con permiso sensible. Flujo: elegir pago, monto y motivo; validar saldo reembolsable y pedir confirmación y MFA; solicitar a la pasarela y registrar reembolso PENDIENTE; al confirmarse por webhook publicar `reembolso.confirmado` para la nota de crédito. Datos: pago_id, monto (> 0 y <= saldo), motivo (10-300). Componentes: TR-PAG, TR-SEG, TR-AUD, TR-EVT.

## 3. Criterios GWT
- **TR-CA-170** (068, Positivo): adelanto de S/ 300,00 con link de 48 h enviado por WhatsApp: el cliente lo recibe y al pagar queda CONFIRMADO. En R3-03 el canal es correo (WhatsApp llega en S24): adaptar o diferir la parte WhatsApp.
- **TR-CA-171** (068, Negativo): vencimiento a 45 días: «El vencimiento máximo es 30 días».
- **TR-CA-175** (070, Positivo): reembolso parcial de S/ 40,00 sobre S/ 189,90: confirmado y saldo reembolsable S/ 149,90.
- **TR-CA-176** (070, Negativo): S/ 200,00 con saldo S/ 149,90: «El monto supera el saldo reembolsable».
- Estado: Pendiente. Faltan y se proponen: reembolso sin aal2 o con MFA de más de 15 min se rechaza (TR-RN-009); dos reembolsos simultáneos no superan el saldo (bloqueo optimista `version` o `FOR UPDATE`); motivo < 10 caracteres rechazado; link vencido no se puede pagar (la pasarela lo rechaza) y el pago queda EXPIRADO; reembolso rechazado por la pasarela devuelve el saldo; reembolso de un pago no CONFIRMADO rechazado; cada reembolso queda en auditoría con motivo.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-023 | Link y reembolso se confirman solo por webhook o consulta servidor a servidor. |
| TR-RN-009 | Reembolsar es sensible: MFA de máx. 15 min y auditado. |
| TR-RN-025 | El mensaje del link es transaccional: respeta bajas del canal, no exige consentimiento promocional. |
| TR-RNF-021 | Confirmación explícita y motivo obligatorio para reembolsar. |
| TR-RNF-030 | Advertencia clara: afecta dinero. |
| TR-RNF-009 | MFA obligatorio para permisos sensibles. |
| TR-RNF-007 | Pasarela o mensajería caídas no bloquean: el link queda creado aunque el envío falle y se reintenta. |
| TR-RNF-124 | Envío del link al proveedor en < 30 s. |

Heredados: 001/002, 008, 010, 011, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-03 | 20 | 8 | TR-PAG | Link de pago y reembolso | TR-RF-068, 070 | Full | R3 |

Relacionadas: R3-01/R3-02 (S19), R3-04 (TR-REP, mismo sprint), R3-11 (WhatsApp, S24), R2-07 (nota de crédito FE). Sprint 20: 2027-07-26 a 2027-08-08, capacidad 16 h (Fiestas Patrias y Batalla de Junín).

## 6. Tablas SQL, eventos, puertos y permisos
- **`pag.pago`**: medio LINK con `url_link`, `concepto`, `vence_en` (máx. 30 días), `destinatario` cifrado, `mensaje_id` (TR-NOT).
- **`pag.reembolso`** (id, tenant_id, pago_id, monto, motivo, estado PENDIENTE|CONFIRMADO|RECHAZADO, id_reembolso_pasarela, solicitado_por, solicitado_en, confirmado_en, version). Saldo reembolsable = monto del pago - reembolsos PENDIENTE o CONFIRMADO; validado con bloqueo de la fila del pago.
- Migración en la letra de `pag` (`db/01?_pag_link_reembolso.sql`).
- **Eventos** (SRS): `reembolso.confirmado` (para que el producto emita la nota de crédito), `pago.confirmado`; propuestos `pago.expirado`, `reembolso.rechazado`.
- **Puertos**: `PagoPort.crearLink(...)`, `PagoPort.reembolsar(...)` (productos); `PasarelaPagos.crearLink`, `solicitarReembolso`; `NotificacionPort.enviar` con plantilla `LINK_PAGO` (sembrar en NOT); tarea diferida de vencimiento.
- **HTTP**: `POST /v1/pagos/links`, `POST /v1/pagos/{pagoId}/reembolsos` (aal2), `GET /v1/pagos?estado=&medio=&desde=&hasta=` (lista paginada para la UI), `GET /v1/pagos/{id}`.
- **Permisos**: `plat.pago.link`, `plat.pago.reembolsar` (sensible), y uno de consulta (sin ID en el SRS: proponer `plat.pago.consultar`). Menú «Pagos» en admin-cliente.

## 7. Código base relacionado
- Los paquetes previos de `tr-pag` y `tr-not` (sin implementar).
- `seguridad`: `RequiereMfa`, `mfaVigente` (antigüedad del MFA).
- `auditoria`: `@Auditable` o `AuditoriaPort.registrar` con `antes`/`despues` y motivo (patrón de anulación TR-CA-209).
- Front: `libs/shared/ui` (`vit-tabla`, `vit-chip-estado` con mapa de tonos por estado de pago, `vit-filtros`, `PanelLateralService`, `AvisosService`, clase `vit-destructivo` para reembolsar); páginas parecidas en `admin-cliente`: `auditoria-lista`/`auditoria-detalle`.
- No existe: lib `pagos`, TR-NOT, plantillas.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-06_Modelo_de_dominio_Comprobantes_electronicos_y_pagos.mmd` (Transaccion tipo reembolso, IntencionPago origina Comprobante).
- `.../T-S4_Secuencia_Pago_en_linea_con_confirmacion_por_webhook.mmd`.
- `1_Definicion_y_Arquitectura/09_LEX_JurisFlujo/LEX-P04_Horas_honorarios_y_cobranza.mmd` (CA-170, adelanto de consulta).
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`.

## 9. Ambigüedades y preguntas candidatas
1. CA-170 envía por WhatsApp, que llega en S24. Recomendación: link por correo en R3-03; WhatsApp como canal adicional cuando exista, sin cambiar PAG (el canal lo decide NOT).
2. ¿URL corta de la pasarela o propia? RF-068 dice «en la pasarela». Recomendación: la de la pasarela; sin acortador propio.
3. ¿Reembolso iniciado por el producto (actor del RF) sin MFA? Recomendación: por puerto interno el producto ya validó MFA de su usuario; exigir que pase el `usuarioId` y auditar. Por HTTP, aal2.
4. ¿Reembolso de Yape/Plin? Muchas pasarelas no reembolsan billeteras por API. Recomendación: el puerto devuelve «no soportado» y el reembolso queda manual (registro sin llamada) con motivo.
5. ¿UI dentro de R3-03 (Full)? Recomendación: separar la UI (c) y juntarla con la configuración de pasarela (plan §6.1 R3: «pasarela de pagos» en admin-cliente).
6. Saldo con reembolsos PENDIENTE: Recomendación: cuentan contra el saldo hasta que se rechacen (evita reembolsar dos veces).
