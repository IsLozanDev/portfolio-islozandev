# Contexto para per-consentimientos

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Matriz Proceso-RF), `3_plan.json` (R2-01), plan (sec. 6.1), diagramas T-05, T-07, OP-04, PL-10, código real en `libs/`. Rutas P y D como en `per-registro-roles-contactos.md`.

## 1. Alcance y dependencias
- Historia R2-01 (sprint 13, 7 h compartidas con 039, 040, 041). Este paquete cubre solo TR-RF-043: consentimientos por finalidad (Ley 29733, D.S. 016-2024-JUS).
- Lib `libs/plataforma/personas` (la misma de `per-registro-y-roles`); el consentimiento es entidad del agregado `Persona` en T-05 (`finalidad, versionTexto, otorgadoEn, revocadoEn, evidencia`).
- Dependencias: `per-registro-y-roles` (persona existe), 20a (`AuditoriaPort`), 11 (outbox/relay). Evidencia: TR-ARC (`arc-subida-descarga`), opcional por RF (`evidencia_archivo_id` opcional).
- Consumidores del evento `consentimiento.revocado`: TR-NOT (R2-09/R2-10, RF-077 preferencias y bajas; TR-RN-025 promociones solo con consentimiento vigente) y los productos. TR-POR (R3, RF-129) dará la revocación desde el portal.
- Partición propuesta:

| Spec | Slug | RF | h | Áreas | Depende de |
|---|---|---|---|---|---|
| A | per-consentimientos | 043 | 7 | (a) DDL textos por finalidad y decisiones (historial de solo inserción); (b) casos de uso registrar decisiones / revocar + `ConsentimientoPort.vigente` + evento; (c) HTTP con evidencia opcional por `archivo_id` | per-registro-y-roles, 20a, 11; arc-subida-descarga solo si la evidencia se valida |
| B (opcional) | per-textos-finalidad-ui | soporte de 043 | 5 | pantalla en `admin-cliente` para publicar versiones de texto por finalidad; tabla de decisiones en la ficha de persona | A, per-ui-persona-buscador, 15b/15c |

- Fuera de alcance: revocación desde el portal (RF-129, TR-POR, R3); envío y bajas de mensajes (TR-NOT); ARCO (R2-17, RF 088-091); finalidad `IDENTIDAD_PORTABLE` en uso real (identidad portable es R4); consentimiento de datos de salud en productos clínicos (PSI/CLI, R3+).
- Constitución aplicable: reglas 1-6, 8, 10, 11; código limpio; DoD.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-043 | Registrar consentimientos de la persona | plat.persona.consentimiento | APP-03 | TR-RN-030, 025 | TR-RNF-016, 013 | Módulo de producto, usuario operativo, titular de datos |

- Must, fase MVP, procesos TR-P10 y TR-P11, componentes TR-PER, TR-ARC, TR-EVT, TR-AUD.
- Precondición: existe la versión vigente del texto de la finalidad para el tenant.
- Flujo: 1) el producto presenta texto y versión; 2) el titular acepta o rechaza cada finalidad por separado; 3) se registra decisión, versión, canal, fecha y usuario que registra; 4) ante revocación se marca la fecha y se publica `consentimiento.revocado` para TR-NOT y productos.
- Datos: `persona_id`, `finalidad` (PRESTACION|PROMOCIONES|COMPARTIR_PRODUCTOS|DATOS_SALUD|IDENTIDAD_PORTABLE), `decision` (ACEPTA|RECHAZA), `version_texto`, `canal` (PRESENCIAL|WEB|WHATSAPP|KIOSCO), `evidencia_archivo_id` (opcional).
- Salida: consentimiento vigente o revocado con evidencia.

## 3. Criterios GWT
| ID | Tipo | Escenario |
|---|---|---|
| TR-CA-109 | Positivo | Texto PROMOCIONES 2026-03 vigente; el socio acepta PRESTACION y rechaza PROMOCIONES: dos decisiones con versión, canal y fecha |
| TR-CA-110 | Positivo | Juana aceptó PROMOCIONES; revoca desde el portal: se publica `consentimiento.revocado` y deja de recibir campañas |
| TR-CA-111 | Negativo | Casilla PROMOCIONES marcada por defecto sin acción del titular: se rechaza por falta de acción expresa |

Estado SRS: Pendiente. Notas: TR-CA-110 dice "desde el portal" (R3) y "deja de recibir campañas" (TR-NOT): en este spec se prueba la revocación por API y la publicación del evento; el efecto en campañas queda para R2-10. TR-CA-111 exige que la API distinga acción expresa (ver P2). Faltan y se proponen: versión de texto no vigente -> rechazo; finalidad sin texto publicado -> rechazo; historial conserva la decisión anterior al revocar (no se actualiza en sitio); aislamiento por tenant; evidencia de otro tenant -> 404.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-030 | Consentimiento libre, previo, expreso, informado e inequívoco, por finalidad separada; se registran versión, fecha y canal; revocable en cualquier momento. |
| TR-RN-025 | Promocionales solo con consentimiento vigente para esa finalidad y en 8:00-20:00 Lima (lo aplica TR-NOT usando este registro). |
| TR-RN-034 | Evento en el outbox en la misma transacción; consumidor idempotente. |
| TR-RNF-016 | Ley 29733 y D.S. 016-2024-JUS: consentimiento, finalidad, ARCO, incidentes 48 h. |
| TR-RNF-013 | Toda operación crítica auditada (registrar y revocar consentimiento). |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012, 024/119, 025, 026, 101, 106, 112.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | RF | Tipo | Release |
|---|---|---|---|---|---|---|
| R2-01 | 13 | 7 | TR-PER | TR-RF-039, 040, 041, 043 | Back | R2 |

Relacionadas: R2-09 (TR-NOT correo, sprint 15), R2-10 (recordatorios, preferencias y bajas, RF 076-077, sprint 16), R2-17 (ARCO e incidentes, sprint 18), R3-07 (TR-POR portal con consentimientos, RF-129, sprint 22).

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/01j_per_consentimiento.sql` (+ rollback y test), después de `01j_per.sql`.
- Tablas propuestas (no hay DDL en `codigo/`):
  - `per.texto_finalidad`: `tenant_id`, `finalidad`, `version` (p. ej. `2026-03`), `texto`, `vigente_desde`, `publicado_por`; único `(tenant_id, finalidad, version)`. El SRS no tiene RF para gestionar textos (P1).
  - `per.consentimiento`: `id`, `tenant_id`, `persona_id`, `finalidad`, `decision`, `version_texto`, `canal`, `registrado_por`, `registrado_en`, `revocado_en`, `revocado_por`, `evidencia_archivo_id` (uuid sin FK cruzada a `arc`), `accion_expresa` (bool, TR-CA-111). Historial: una fila por decisión; la vigente es la última no revocada por `(persona_id, finalidad)`.
  - RLS por `app.tenant_id`; REVOKE a `anon, authenticated`.
- Eventos: `consentimiento.revocado` (SRS). Proponer `consentimiento.registrado` (no está en el SRS) si TR-NOT necesita saber altas de PROMOCIONES; si no, basta consultar el puerto.
- Puertos: `PersonaPort.consentimientos` (hoja Componentes). Proponer `ConsentimientoPort.vigente(personaId, finalidad): boolean` para TR-NOT (TR-RN-025). Consume `AuditoriaPort.registrar` (20a) y, si se valida la evidencia, `ArchivoPort` de TR-ARC (que el archivo exista, sea del tenant y esté DISPONIBLE).
- Permisos: `plat.persona.consentimiento` (SRS). Publicar textos no tiene permiso en el SRS: proponer `plat.persona.texto_finalidad` (o reutilizar `plat.parametro.*` si los textos fueran parámetros, ver P1).
- Endpoints propuestos: `GET /v1/personas/{id}/consentimientos`, `POST /v1/personas/{id}/consentimientos` (lote de decisiones), `POST /v1/personas/{id}/consentimientos/{finalidad}/revocar`, `GET|POST /v1/consentimientos/textos`.

## 7. Código base relacionado
- `libs/plataforma/auditoria` (`AUDITORIA`, `AuditoriaPort.registrar`, `@Auditable`, `EVENTOS_AUDITADOS` para auditar por evento).
- `libs/plataforma/eventos` (`SuscribirEvento`, relay) y `kernel-infra` (`OutboxPublisher`): publicación de `consentimiento.revocado`.
- `libs/plataforma/parametros` (`PARAMETRO_PORT`): alternativa para guardar versiones de texto (P1).
- Lib `personas` y `personas-ui`: las crea `per-registro-y-roles` / `per-ui-persona-buscador`; no existen hoy.
- TR-ARC no existe todavía (sin `libs/plataforma/archivos`); `evidencia_archivo_id` queda como uuid opaco hasta que exista.
- `codigo/` de P: nada de consentimientos.

## 8. Diagramas relevantes
- D/`8_Diseno_Piloto/2_Plataforma_Transversal/T-05_Modelo_de_dominio_Personas_e_identidad.mmd` (Consentimiento)
- D/`8_Diseno_Piloto/2_Plataforma_Transversal/T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (Preferencia de NOT verifica consentimiento)
- D/`6_Plataforma_Operacion/OP-04_Se_puede_compartir_este_dato_de_persona_entre_sistemas.mmd` (COMPARTIR_PRODUCTOS y datos sensibles)
- P/`1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`

## 9. Ambigüedades y preguntas candidatas
1. ¿Quién gestiona los textos por finalidad y su versión? El SRS lo pone de precondición sin RF. Recomendación: tabla `per.texto_finalidad` con alta por API (`plat.persona.texto_finalidad`, permiso nuevo) y siembra de textos por defecto de plataforma; la UI de textos en el spec B opcional.
2. ¿Cómo se prueba la "acción expresa" (TR-CA-111) en una API? Recomendación: cada decisión llega explícita (ACEPTA o RECHAZA, sin valor por defecto) con `accion_expresa=true` que el componente Angular solo envía tras la interacción; la API rechaza decisiones faltantes o por defecto. Documentar que la garantía final es del front del producto.
3. ¿Revocar = nueva fila o actualizar `revocado_en`? Recomendación: marcar `revocado_en` en la fila vigente (el RF dice "marca la fecha") y auditar con `AuditoriaPort` (antes/después); nunca borrar.
4. `DATOS_SALUD`: dato sensible (OP-04, TR-RN-033). Recomendación: aceptar la finalidad pero exigir que el texto esté publicado y registrar acceso sensible solo cuando un producto clínico la use (R3).
5. Evidencia: ¿obligatoria por canal (p. ej. PRESENCIAL con firma)? Recomendación: opcional como dice el RF; si viene, validar con `ArchivoPort` que el archivo es del tenant y está DISPONIBLE (categoría EVIDENCIA).
6. TR-CA-110 cita el portal (R3). Recomendación: probarlo con revocación por API del operador en nombre del titular (canal registrado) y dejar el portal a RF-129.
7. ¿`consentimiento.registrado` como evento? Recomendación: no publicarlo en R2 (no hay consumidor); TR-NOT consulta `ConsentimientoPort.vigente` al enviar.
