# Contexto para arco-cancelacion-anonimizacion

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `srs_docs.txt` (RF-090, GWT 221-222, TR-RN-028/029/030, TR-RNF-016/021, Componentes TR-AUD y TR-PER), `plan.md`, `3_plan.json`, `arco-registro-atencion.md` (este paquete), specs 20a/20b.

## 1. Alcance y dependencias
- **Sin historia en el plan**: R2-17 cubre 088, 089 y 091; RF-090 (fase R2 en el SRS) no aparece en ninguna historia de `3_plan.json`. El plan pone «ARCO» en R2 de forma genérica. Ver P1.
- Depende de: `arco-solicitud-plazos` y `arco-atencion-compilado` (solicitud de CANCELACION declarada PROCEDE), TR-PER R2-01 (persona, contactos, consentimientos: lo que se anonimiza en plataforma), TR-EVT (spec 11), 05 (aal2), y de un consumidor por producto (SazónPOS en R2; spec de producto aparte).
- PL-10: `CAT --> PER`; `EVT --> AUD`. La hoja Componentes asigna a TR-AUD el evento `persona.cancelacion_aprobada`.
- Partición propuesta: un spec.

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | arco-cancelacion-anonimizacion | 090 (confirmar con MFA, publicar evento, consolidar confirmaciones, evidencia, anonimizar en TR-PER) | 7 | arco a y b, R2-01 TR-PER |
| — | (producto) sazonpos-anonimizacion | consumidor de `persona.cancelacion_aprobada` en SazónPOS | aparte | a, R2-12 (CC-06) |

- Áreas: orquestación y estado por producto; anonimización en TR-PER (y bloqueo legal); evidencia y alertas por producto sin confirmar.
- Fuera de alcance: anonimizar dentro de cada producto (lo hace el producto); borrar auditoría (TR-RN-028 lo prohíbe: ver P3); identidad portable (R4).
- Constitución: reglas 1-6, 8, 10, 11.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-090 | Ejecutar cancelación y anonimización | plat.arco.cancelar | APP-02 | TR-RN-029, 030, 028 | TR-RNF-016, 021 | Responsable de datos (ACT-18) |

Must / R2 en el SRS, proceso TR-P11. Componentes: TR-AUD, TR-PER, TR-EVT, TR-SEG.
- **090** precondición: solicitud de CANCELACION declarada procedente. Flujo: 1) el responsable confirma con MFA; 2) se publica `persona.cancelacion_aprobada`; 3) cada producto anonimiza lo que no tiene obligación de conservación y bloquea lo demás; 4) se consolida la confirmación de cada producto y se registra la evidencia. Datos: persona_id, productos_confirmados[] (código, resultado ANONIMIZADO|BLOQUEADO_LEGAL), fecha_ejecucion. Salida: datos anonimizados o bloqueados con evidencia por producto.

## 3. Criterios GWT
- **TR-CA-221** (Positivo, «Cancelación de socio»): exsocio sin deudas: datos de contacto anonimizados en GYM y boletas conservadas bloqueadas.
- **TR-CA-222** (Negativo, «Producto sin confirmar»): CLI no confirma en 24 h: la solicitud queda EN_EJECUCION con alerta al responsable.
- Estado: Pendiente. Ambos usan productos que no existen en R2 (GYM, CLI). Proponer equivalentes con SazónPOS y un producto simulado en pruebas.
- Faltan y se proponen: sin aal2 se rechaza (TR-RN-009); confirmación duplicada de un producto no cambia el resultado (idempotencia por `event_id`); solo se ejecuta sobre una solicitud PROCEDE de CANCELACION; la persona anonimizada en TR-PER deja de aparecer en búsquedas; la evidencia queda en `aud.evento_auditoria` sin los datos borrados; todos los productos confirmados cierran la solicitud.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-029 | Cancelación atendida en 10 días hábiles (la ejecución cuenta dentro del plazo). |
| TR-RN-030 | Consentimientos revocables: la cancelación revoca todos los de la persona. |
| TR-RN-028 | Auditoría inmutable 5 años: no se borra ni se reescribe. |
| TR-RN-009 | Permisos sensibles con MFA de máx. 15 min y auditados. |
| TR-RNF-016 | Ley 29733: cancelación con conservación legal (comprobantes, historia clínica). |
| TR-RNF-021 | Confirmación explícita y motivo: acción irreversible. |
| TR-RNF-030 | Advertencia clara: la anonimización no se puede deshacer. |

Heredados: 008, 010, 011, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
Sin historia. La más cercana:
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-17 | 18 | 5 | TR-AUD | Derechos ARCO (registro y atención) e incidentes de datos | TR-RF-088, 089, 091 | Full | R2 |

Relacionadas: R2-01 (TR-PER), R2-12 (CC-06 personas en SazónPOS), RF-042 (fusión de personas).

## 6. Tablas SQL, eventos, puertos y permisos
- **`aud.ejecucion_cancelacion`** (solicitud_id, persona_id, iniciada_en, iniciada_por, estado EN_EJECUCION|COMPLETADA|CON_ALERTA, completada_en).
- **`aud.confirmacion_cancelacion`** (ejecucion_id, producto_codigo, resultado ANONIMIZADO|BLOQUEADO_LEGAL|PENDIENTE, confirmado_en, event_id). Productos esperados = productos contratados por el tenant (`org.suscripcion`).
- Puede reutilizar `aud.aporte_arco` del paquete de registro (mismo patrón por producto); decidir al especificar.
- **Migración**: `db/01<letra>_aud_arco_cancelacion.sql` (letra siguiente libre al implementar), inverso y prueba.
- **Eventos**: publica `persona.cancelacion_aprobada` (SRS; payload solo `persona_id`, `solicitud_id`, sin datos personales). Recibe confirmaciones: proponer evento `persona.cancelacion_confirmada` (productos) o endpoint interno. TR-PER consume el mismo evento y anonimiza su ficha.
- **Puertos**: `PersonaPort` (TR-PER: anonimizar, revocar consentimientos); `NotificacionPort` (alertas a 24 h, respuesta al titular); `AuditoriaPort`.
- **HTTP**: `POST /v1/aud/arco/{id}/cancelacion` (aal2) y `GET` de su estado.
- **Permisos**: `plat.arco.cancelar` (sensible).

## 7. Código base relacionado
- `libs/plataforma/auditoria` (20a/20b): `AuditoriaPort`, `CAMPOS_ENMASCARADOS`. La auditoría guarda `antes`/`despues` con datos personales enmascarados por clave; la cancelación no los toca.
- `libs/plataforma/seguridad`: `RequiereMfa`, `MfaGuard`, `mfaVigente` para el paso 1.
- `libs/plataforma/eventos`: `@SuscribirEvento` y consumo idempotente.
- `libs/plataforma/org`: suscripciones por producto (lista de productos que deben confirmar).
- No existe: TR-PER, consumidores de producto, contrato de anonimización.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-05_Modelo_de_dominio_Personas_e_identidad.mmd`.
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S7_Secuencia_Relay_del_outbox_hacia_los_consumidores.mmd`.
- `6_Plataforma_Operacion/OP-04_Se_puede_compartir_este_dato_de_persona_entre_sistemas.mmd`.
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`.

## 9. Ambigüedades y preguntas candidatas
1. RF-090 sin historia en el plan. Recomendación: agregar historia R2 (unas 7 h) junto a R2-17 o moverla a R3 si TR-PER llega tarde; decidir con el usuario.
2. ¿Qué pasa con `antes`/`despues` y `persona_titular_id` de la auditoría? Recomendación: no se tocan (TR-RN-028); el enmascarado de 20a ya evita copias de documentos y contraseñas. Documentarlo como conservación legal.
3. ¿Anonimizar o seudonimizar en TR-PER? Recomendación: reemplazar nombre, documento y contactos por valores irreversibles, conservar `persona_id` para la integridad referencial y los comprobantes.
4. Plazo para confirmar: CA-222 usa 24 h. Recomendación: parámetro TR-CFG `plat.arco.horas_confirmacion` = 24.
5. ¿Qué productos esperar? Recomendación: los de suscripciones activas del tenant al iniciar; un producto sin consumidor registrado queda PENDIENTE con alerta, no bloquea a los demás.
6. ¿Cancelación con deudas o contratos vigentes? CA-221 dice «sin deudas». Recomendación: el producto responde BLOQUEADO_LEGAL; la plataforma no evalúa deudas.
