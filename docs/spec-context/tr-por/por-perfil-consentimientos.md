# Contexto para por-perfil-consentimientos

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (Reglas de negocio, RF 043, 077, 088, 127, 129, Criterios GWT, RNF, Componentes), `plan.md` (backlog R2/R3), `3_plan.json`, PL-10, T-05, T-08, A-05, código real del repo.

## 1. Alcance y dependencias
- Historia R3-07 (sprint 22, R3, 10 h, Full), parte RF-127 y RF-129. Registro e ingreso en `por-registro-ingreso-otp.md`.
- PL-10: `PER --> POR`. Este paquete es casi todo TR-PER visto por el titular: lee y actualiza la ficha (RF-041) y los consentimientos (RF-043) de R2-01. Otras dependencias: H1 (cuenta de cliente y guard), TR-NOT (verificación del nuevo correo o celular; preferencias y bajas RF-077, R2-10), TR-AUD (spec 20a: auditar cambios de consentimiento y la descarga de datos), ARCO (RF-088, R2-17: "presentar solicitudes ARCO desde el portal"), TR-EVT (propagar por evento).
- Partición propuesta (estimación 9 h, cabe en un spec; si TR-PER no expone lo necesario, sube):

| Parte | Slug | Alcance | h | Depende de |
|---|---|---|---|---|
| I | por-perfil-consentimientos | "Mi perfil" (ver, editar contacto y dirección con verificación, canal preferido, descargar mis datos) y "Privacidad" (finalidades, otorgar, revocar, nueva versión, enlace a ARCO) | 9 | H1, H2, TR-PER (R2-01), TR-NOT (R2-09/R2-10), ARCO (R2-17) |

- Áreas: (a) casos de uso del portal sobre `PersonasPort` y `ConsentimientosPort` (sin tablas propias de datos personales); (b) verificación de cambio de correo o celular con OTP (reutiliza H1) y descarga de datos; (c) páginas `mi-perfil` y `privacidad` en `portal-cuenta`.
- Si se pasa de 10 h, recortar en este orden: descarga en PDF (dejar JSON/HTML imprimible), aviso de nueva versión (TR-CA-314) a un spec siguiente.
- Fuera de alcance: atención de ARCO por el responsable (RF-089, R2-17); rectificación de nombres validados (se ofrece solicitud ARCO); identidad portable y "mis autorizaciones" (RF-051, R4); mis transacciones; gestión de textos de política por el tenant (es de TR-PER).
- Constitución: reglas 1-11; estructura de libs Angular; verificación Playwright; DoD.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-127 | Gestionar perfil del cliente final | publico.portal.perfil | APP-05 | TR-RN-030, 029 | TR-RNF-019, 016 | Cliente final / titular de datos |
| TR-RF-129 | Gestionar consentimientos desde el portal | publico.portal.consentimientos | APP-05 | TR-RN-030, 025 | TR-RNF-016, 019 | Cliente final / titular de datos |

Prioridad: 127 Should, 129 Must. Fase SRS MVP (plan R3). Módulo MOD-19. Procesos: 127 TR-P07, TR-P11; 129 TR-P11, TR-P07.
- **127** precondición: sesión iniciada. Flujo: abre «Mi perfil»; edita correo, celular o dirección (correo y celular requieren verificación); se actualiza la ficha en TR-PER y se publica `persona.actualizada`; puede descargar sus datos en PDF. Datos: `nombres` (solo lectura si vienen de fuente oficial), `correo`, `celular`, `direccion`, `ubigeo`, `canal_preferido`. Salida: datos actualizados en todos los productos del tenant. Componentes: TR-POR, TR-PER, TR-NOT.
- **129** precondición: sesión iniciada. Flujo: abre «Privacidad»; lista finalidades con estado, versión y fecha; otorga o revoca; se registra en TR-PER y se propaga por evento. Además: presentar solicitudes ARCO. Datos: `finalidad`, `estado` (ACEPTADA|REVOCADA|NO_OTORGADA), `version_texto`, `fecha_decision`. Componentes: TR-POR, TR-PER, TR-AUD, TR-EVT.
- Referencias: RF-043 (finalidades PRESTACION|PROMOCIONES|COMPARTIR_PRODUCTOS|DATOS_SALUD|IDENTIDAD_PORTABLE; decisión ACEPTA|RECHAZA; canal PRESENCIAL|WEB|WHATSAPP|KIOSCO; publica `consentimiento.revocado`); RF-041 (contactos y direcciones, celular de 9 dígitos que inicia con 9, ubigeo vigente); RF-077 (canal preferido y bajas); RF-088 (`publico.arco.solicitar`, canal PORTAL).

## 3. Criterios GWT
- **TR-CA-309** (127, Positivo, "Cambio de celular verificado"): de 987654321 a 912345678 con código de verificación -> la ficha queda con el nuevo celular.
- **TR-CA-310** (127, Negativo, "Edición de nombre validado"): nombres de la consulta DNI -> campo de solo lectura y se ofrece solicitud de rectificación.
- **TR-CA-313** (129, Positivo, "Revocación de promociones"): PROMOCIONES aceptada, la revoca -> queda REVOCADA y no recibe más campañas.
- **TR-CA-314** (129, Borde, "Nueva versión de la política"): el tenant publicó nueva versión de PROMOCIONES -> al ingresar se muestra el cambio y se pide su decisión.

Estado: Pendiente. Faltan (proponer): descarga de datos (contenido mínimo, auditada como acceso del titular); cambio de correo con verificación; código de verificación incorrecto o vencido; cliente que intenta leer la ficha de otra persona (por id manipulado) -> 404; revocar PRESTACION (¿se permite?, ver P3); evento `consentimiento.revocado` emitido una sola vez (idempotencia); aislamiento: el portal del tenant B no muestra consentimientos del tenant A.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-030 | Consentimiento libre, previo, expreso, informado, por finalidad separada; versión, fecha y canal; revocable en cualquier momento. |
| TR-RN-029 | ARCO en plazo: acceso 20 días hábiles; rectificación, cancelación u oposición 10 días hábiles; prórroga una vez. |
| TR-RN-025 | Promocionales solo con consentimiento vigente y entre 8:00 y 20:00 de Lima; transaccionales respetan bajas del canal. |
| TR-RNF-016 | Ley 29733 y D.S. 016-2024-JUS: consentimiento, finalidad, ARCO. |
| TR-RNF-019 | WCAG 2.1 AA. |
| TR-RNF-013 | Auditoría inmutable de cambios de consentimiento y de la descarga de datos personales. |
| TR-RNF-010 | Aislamiento por tenant; el titular solo ve su propia ficha. |
| TR-RNF-026 | Sin datos personales en logs. |

Heredados por CLAUDE.md: 001/002/003, 008, 011, 012, 024/119, 025, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-07 | 22 | 10 | TR-POR | Portal del cliente final: registro, ingreso con OTP, perfil, consentimientos | TR-RF-125, 126, 127, 129 | Full | R3 |

Relacionadas: R2-01 (13, 7 h, personas, contactos, direcciones y consentimientos: RF 039, 040, 041, 043), R2-10 (16, 5 h, preferencias y bajas: RF 076, 077), R2-17 (18, 5 h, ARCO e incidentes: RF 088, 089, 091), R2-12 (CC-06 fusión de personas), R2-09 (correo).

## 6. Tablas SQL, eventos, puertos y permisos
- **Tablas**: ninguna propia de datos personales; la ficha y los consentimientos viven en el esquema de TR-PER (R2-01). Opcional: `por.verificacion_contacto` si el código del cambio de correo o celular no se delega a Supabase (ver P2); preferible Redis con TTL.
- **Eventos**: consumidos o emitidos por TR-PER: `persona.actualizada` (RF-127), `consentimiento.revocado` (RF-043, RF-129). El portal no publica eventos propios de datos personales; TR-PER los emite dentro de su transacción (regla 4).
- **Puertos**: `PersonasPort` (leer ficha del titular por `persona_id` de la cuenta, actualizar contacto y dirección), `ConsentimientosPort` (listar finalidades con versión vigente y decisión, decidir con canal WEB), `VerificacionContacto` (enviar y comprobar código al nuevo correo o celular), `ExportacionDatosTitular` (compilar datos del titular; si R2-17 ya tiene compilado para ARCO de acceso, reutilizarlo), `ArcoPort` (crear solicitud con canal PORTAL), `AuditoriaPort` (spec 20a; `registrarAccesoSensible` con finalidad del titular o `registrar`).
- **Permisos** (SRS): `publico.portal.perfil`, `publico.portal.consentimientos`; ARCO usa `publico.arco.solicitar` (RF-088). Mismo mecanismo que en H1 (decorador de portal, sin roles).
- **Endpoints** propuestos: `GET/PATCH /v1/portal/mi-perfil`, `POST /v1/portal/mi-perfil/verificaciones`, `GET /v1/portal/mi-perfil/datos` (descarga), `GET /v1/portal/consentimientos`, `PUT /v1/portal/consentimientos/:finalidad`. Todos con `CuentaClienteGuard`.
- **Front**: páginas `pages/mi-perfil/mi-perfil.page.ts` y `pages/privacidad/privacidad.page.ts` en `libs/plataforma/portal-cuenta` (estructura de libs Angular de CLAUDE.md).

## 7. Código base relacionado
- **Existe**: `auditoria` (`AUDITORIA`, `AuditoriaPort.registrar`, `registrarAccesoSensible`, `FINALIDADES`, `TIPOS_RECURSO_SENSIBLE` con `DATOS_PORTABLES`); `eventos` (`SuscribirEvento`); `kernel-infra` (`OutboxPublisher`, `TypeOrmUnitOfWork`); `catalogos` (UBIGEO validado por `CatalogoPort.validarItem`, importado por 19b); `shared/util` (`validarRuc`; validador de celular y DNI aún no).
- **Falta**: TR-PER completo (R2-01), ARCO (R2-17), TR-NOT (R2-09/R2-10), H1/H2 de este componente, generación de PDF (TR-FE R2-06 genera PDF de comprobantes; no hay generador genérico).

## 8. Diagramas relevantes
- `.../2_Plataforma_Transversal/T-05_Modelo_de_dominio_Personas_e_identidad.mmd` (persona, contactos, consentimientos).
- `.../2_Plataforma_Transversal/T-08_...CMS_y_portal_del_cliente.mmd` (CuentaCliente -> Persona).
- `.../6_Plataforma_Operacion/OP-04_Se_puede_compartir_este_dato_de_persona_entre_sistemas.mmd` (finalidad COMPARTIR_PRODUCTOS).
- `.../2_Plataforma_Transversal/T-S5_Secuencia_Recordatorio_programado_con_preferencias_del_paciente.mmd` (preferencias de canal).
- `1_Mermaid/PL-10_...mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- RF-127 dice "datos actualizados en todos los productos del tenant": depende de que la ficha sea única por tenant (nivel 2, RF-040), no por producto.
- "Descargar sus datos en PDF" se solapa con el derecho de acceso ARCO (RF-088, plazo 20 días): no queda claro si la descarga inmediata sustituye la solicitud.
- RF-129 menciona "presentar solicitudes ARCO desde el portal", que es RF-088 de R2-17 (APP-05): no se sabe si la pantalla de ARCO del portal la hace R2-17 o este spec.
- RF-127 "cambiar su canal preferido" es RF-077 (TR-NOT, R2-10).
- Revocar PRESTACION puede impedir el servicio; el SRS no lo restringe.

Preguntas, con recomendación:
1. ¿Este spec depende de que R2-01 exponga un puerto de titular? Recomendación: sí; pedir en el spec de personas `PersonasPort.fichaDelTitular(personaId)` y `ConsentimientosPort.decidir(...)`; el portal no lee tablas de TR-PER.
2. ¿Verificación del nuevo correo o celular? Recomendación: código de 6 dígitos con las mismas reglas de TR-RN-043, enviado por TR-NOT, estado en Redis; al confirmar, actualizar la ficha en TR-PER y, si el contacto es el de ingreso, el usuario en Supabase por Admin API.
3. ¿Se puede revocar PRESTACION? Recomendación: no desde el portal; se muestra como base legal del servicio y se ofrece ARCO de cancelación.
4. ¿Descarga en PDF? Recomendación: en R3, HTML imprimible o JSON legible generado al vuelo y auditado; el PDF formal queda para la respuesta ARCO de acceso (R2-17).
5. ¿ARCO en el portal? Recomendación: la página de ARCO del portal es de R2-17 si ya trae UI; si no, este spec solo enlaza con un formulario mínimo que llama a `ArcoPort` (canal PORTAL).
6. ¿Nueva versión de política (TR-CA-314)? Recomendación: al ingresar, `GET /v1/portal/consentimientos/pendientes` lista finalidades con versión aceptada distinta de la vigente; el portal muestra un aviso bloqueante solo para PRESTACION y no bloqueante para el resto.
7. ¿Canal preferido? Recomendación: solo si R2-10 ya existe; si no, fuera.
