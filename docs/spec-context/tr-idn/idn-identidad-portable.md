# Contexto para idn-identidad-portable

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Matriz Proceso-RF), plan (sec. "Fuera de este plan (R4, backlog 2028)"), `3_plan.json`, diagramas OP-04 a OP-09, T-05, PL-10. Rutas P y D como en `idn-validacion-consulta-dni-ruc.md`.

**Release: R4 (fuera del plan).** El SRS marca 048-051 como Should / fase R2, pero el plan manda: "identidad portable con consentimiento" está en R4, backlog 2028, "entra cuando un producto lo necesite". No hay historia en `3_plan.json`. Este paquete es indicativo para cuando se priorice.

## 1. Alcance y dependencias
- Nivel 3 de OP-05: la persona (titular) decide qué campos comparte con qué negocio, con código de un solo uso, vigencia, registro de cada lectura y revocación (OP-04, OP-07).
- Lib `libs/plataforma/identidad` (la misma del nivel 1). Controladores de OP-08: `AutorizacionController` (solicitar, confirmar, revocar) y `PortalTitularController` ("Mis datos").
- Dependencias duras: `idn-validacion-consulta` (lib y esquema `idn`), TR-NOT (envío del código por SMS, WhatsApp o correo; R2-09 correo, R3-11 WhatsApp; SMS no está en el plan), TR-POR (portal del titular, R3-07, RF 125-129), TR-PER (prellenado de la ficha, 050), 20a (auditoría), finalidad `IDENTIDAD_PORTABLE` de `per-consentimientos`. Productos objetivo: PSI, CLI, GYM, LEX (nivel 3 según hoja Consumidores).
- Partición propuesta (cuando se priorice; total ~24 h):

| Spec | Slug | RF | h | Áreas | Depende de |
|---|---|---|---|---|---|
| A | idn-portable-titular-y-solicitud | 048 | 8 | (a) DDL `idn.titular`, `campo_portable`, `solicitud_autorizacion`; (b) solicitar con límite diario, código hasheado y envío por `EnviadorCodigo`; (c) HTTP | idn-validacion-consulta, TR-NOT, per-consentimientos |
| B | idn-portable-confirmacion-y-lectura | 049, 050 | 8 | (a) confirmar con 5 intentos y expiración; (b) autorización con vigencia que reemplaza la anterior; (c) lectura filtrada + `idn.acceso_titular` + `AuditoriaPort.registrarAccesoSensible` | A |
| C | idn-portable-mis-autorizaciones | 051 | 8 | (a) API del titular (sesión del portal); (b) revocar con efecto inmediato + aviso al tenant; (c) pantalla "Mis autorizaciones" (WCAG 2.1 AA) | B, TR-POR (R3) |

- Fuera de alcance incluso en R4: datos sensibles (salud, religión, política, orientación sexual) como campos portables (TR-RN-033); compartir entre tenants sin autorización (OP-04 "no permitido").
- Constitución aplicable: reglas 1-6, 8, 10, 11; doble barrera con excepción documentada (`idn.titular` es global, la autorización por tenant); DoD.

## 2. RF
Módulo MOD-07, Should, fase R2 en SRS (R4 en el plan), procesos TR-P10 y TR-P11 (050 solo TR-P10).

| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-048 | Solicitar autorización de identidad portable | plat.identidad.portable_solicitar | APP-03 | TR-RN-033, 030 | TR-RNF-016, 111 | Usuario operativo, módulo de producto |
| TR-RF-049 | Confirmar autorización con código | publico.identidad.autorizar | APP-05 | TR-RN-033 | TR-RNF-016, 015 | Titular de datos |
| TR-RF-050 | Entregar datos autorizados y registrar acceso | plat.identidad.portable_leer | APP-03 | TR-RN-033 | TR-RNF-013, 016 | Módulo de producto, usuario operativo |
| TR-RF-051 | Revocar autorizaciones y ver accesos del titular | publico.identidad.mis_autorizaciones | APP-05 | TR-RN-030, 033 | TR-RNF-016, 019 | Titular de datos |

- **048** Precondición: titular en `idn.titular` con celular o correo verificado; tenant con el producto suscrito. Flujo: elige campos de la lista cerrada y finalidad -> límite 3 solicitudes por titular y tenant al día -> solicitud PENDIENTE con código hasheado, expira en 10 min -> código por TR-NOT con nombre del negocio y finalidad. Datos: documento del titular, `campos[]` (nombres|celular|correo|direccion|fecha_nacimiento|contacto_emergencia), `finalidad` (10-200), `empresa_id`.
- **049** Precondición: solicitud PENDIENTE no expirada. Flujo: titular ingresa código (dispositivo del tenant o portal) -> compara hash y cuenta intento -> crea autorización con campos, finalidad y vigencia (parámetro, 12 meses) y revoca la anterior del mismo tenant -> 5 fallos => BLOQUEADA.
- **050** Precondición: autorización vigente no revocada. Flujo: filtra campos autorizados -> registra en `idn.acceso_titular` -> devuelve datos para prellenar la persona (TR-PER).
- **051** Precondición: titular con sesión verificada (celular o correo). Flujo: lista autorizaciones (negocio, campos, finalidad, vigencia, últimos accesos) -> revoca -> `idn.revocar` y notifica al tenant. Componentes: TR-IDN, TR-POR, TR-NOT.

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-123 | 048 | Positivo | DNI 45781236 con celular verificado; la clínica pide nombres, celular y contacto_emergencia: SMS con código y nombre de la clínica |
| TR-CA-124 | 048 | Negativo | Cuarta solicitud del día: «Límite diario de solicitudes alcanzado» |
| TR-CA-125 | 048 | Negativo | Campo «diagnostico»: rechazado por no estar en la lista cerrada |
| TR-CA-126 | 049 | Positivo | Código correcto: autorización con vigencia de 12 meses |
| TR-CA-127 | 049 | Negativo | Quinto intento fallido: solicitud BLOQUEADA y se informa al titular |
| TR-CA-128 | 049 | Borde | Expiró hace 1 minuto: «El código expiró», sin autorización |
| TR-CA-129 | 050 | Positivo | Autorización de nombres y celular: recibe solo esos y el acceso queda registrado |
| TR-CA-130 | 050 | Negativo | Revocada ayer: «Sin autorización vigente», sin datos |
| TR-CA-131 | 051 | Positivo | Revoca la del gimnasio: el gimnasio deja de recibir de inmediato; la clínica conserva la suya |
| TR-CA-132 | 051 | Borde | Sin autorizaciones: «No ha compartido sus datos con ningún negocio» |

Estado SRS: Pendiente. Faltan y se proponen: respuesta neutra cuando el titular no existe (OP-07: "Si la persona tiene cuenta, recibirá un código", no revela existencia); límite de tasa en confirmar (TR-RNF-015, 429); código nunca visible al tenant ni en logs; acceso de otro tenant a una autorización ajena -> 404.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-033 | Código de un solo uso, máx. 5 intentos y 3 solicitudes por titular y tenant al día; solo campos de la lista cerrada; nunca datos sensibles. |
| TR-RN-030 | Consentimiento libre, previo, expreso, informado, por finalidad, revocable. |
| TR-RNF-016 | Ley 29733 y D.S. 016-2024-JUS. |
| TR-RNF-111 | Documento hasheado en bitácoras y logs. |
| TR-RNF-015 | Límite de tasa en endpoints públicos (confirmar código). |
| TR-RNF-013 | Lecturas auditadas (acceso sensible `DATOS_PORTABLES` ya existe en `TIPOS_RECURSO_SENSIBLE`). |
| TR-RNF-019 | Portal WCAG 2.1 AA. |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012, 024/119, 025, 026, 101, 106, 112.

## 5. Historia del backlog (3_plan.json)
Sin historia. Plan: "Fuera de este plan (R4, backlog 2028): ... identidad portable con consentimiento ...". Relacionadas que deben existir antes: R2-09 (TR-NOT correo), R3-07 (TR-POR portal con OTP, RF 125-129), R3-11 (WhatsApp).

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta (cuando toque): `db/01k_idn_portable.sql` (misma letra del esquema `idn`).
- Tablas (OP-09): `idn.titular` (`id`, `tipo_doc`, `numero`, `celular`, `datos_portables` jsonb sin datos sensibles; global), `idn.campo_portable` (lista cerrada, PK `codigo`), `idn.solicitud_autorizacion` (`tenant_id` RLS, `campos[]`, `finalidad`, `codigo_hash`, `intentos`, `estado` PENDIENTE|APROBADA|RECHAZADA|BLOQUEADA|EXPIRADA, `expira_en`), `idn.autorizacion` (`tenant_id` RLS, `campos[]`, `vigente_hasta`, `revocada_en`), `idn.acceso_titular` (`id`, `autorizacion_id`, `usuario_id`, `campos`, `creado_en`).
- Eventos: no hay en el SRS. Proponer `identidad.autorizacion_revocada` (aviso al tenant, 051 paso 4) y `identidad.autorizacion_otorgada`.
- Puertos (OP-08): `EnviadorCodigo` (adaptador `NotificacionesEnviadorCodigo` sobre TR-NOT), `ObtenerDatosAutorizados`; consume `AuditoriaPort.registrarAccesoSensible` (recurso `DATOS_PORTABLES`).
- Permisos (SRS): `plat.identidad.portable_solicitar`, `plat.identidad.portable_leer`, `publico.identidad.autorizar`, `publico.identidad.mis_autorizaciones`. El prefijo `publico.` no existe hoy en el manifiesto ni en `@Permiso` (todo es `plat.`): requiere decisión de TR-POR.

## 7. Código base relacionado
- `libs/plataforma/auditoria`: `TIPOS_RECURSO_SENSIBLE` ya incluye `DATOS_PORTABLES`; `FINALIDADES` (ATENCION, AUDITORIA_MEDICA, SOPORTE, OTRO).
- `libs/plataforma/seguridad`: invitación con token propio de 72 h guardado como hash (spec 08) es el patrón para código hasheado de un solo uso; bloqueo por fuerza bruta en Redis (spec 18b) para los 5 intentos y TR-RNF-015.
- No existen TR-NOT, TR-POR ni sesión de titular (cliente final): `tipo_usuario` del token tiene INTERNO/EXTERNO/SOPORTE (componentes.md), sin flujo de portal.
- `codigo/` de P: nada.

## 8. Diagramas relevantes
- D/`6_Plataforma_Operacion/OP-04_Se_puede_compartir_este_dato_de_persona_entre_sistemas.mmd`
- D/`6_Plataforma_Operacion/OP-05_Identidad_en_tres_niveles.mmd`
- D/`6_Plataforma_Operacion/OP-07_Secuencia_autorizacion_del_titular_nivel_3.mmd`
- D/`6_Plataforma_Operacion/OP-08_Modulo_de_identidad_en_arquitectura_hexagonal.mmd`
- D/`6_Plataforma_Operacion/OP-09_Modelo_de_datos_del_servicio_de_identidad_schema_idn.mmd`
- D/`8_Diseno_Piloto/2_Plataforma_Transversal/T-05_Modelo_de_dominio_Personas_e_identidad.mmd` (Titular, Autorizacion)

## 9. Ambigüedades y preguntas candidatas
1. SRS (Should/R2) vs. plan (R4). Recomendación: manda el plan; no especificar hasta que un producto (CLI o GYM) lo pida. Mantener este paquete como referencia.
2. ¿Cómo nace un titular en `idn.titular`? Ningún RF lo crea; depende del registro en el portal (RF-125, TR-POR). Recomendación: el alta del titular es parte de TR-POR; IDN solo lee.
3. Canal SMS no está en ningún release (TR-NOT: correo R2, WhatsApp R3). Recomendación: código por correo o WhatsApp; SMS como adaptador futuro.
4. Permisos `publico.*` para un actor sin tenant. Recomendación: guard propio de sesión de titular (no `@Permiso` de tenant) definido por TR-POR; documentar la excepción a la regla 5.
5. Vigencia de 12 meses: ¿parámetro de plataforma o del tenant? Recomendación: parámetro de plataforma `idn.portable.vigencia_meses` en TR-CFG.
6. Respuesta cuando el titular no existe. Recomendación: siempre la misma respuesta (OP-07) y contar la solicitud igual para no filtrar existencia.
