# Contexto para SPEC 20 · aud-auditoria

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS xlsx, `3_plan.json`, `2_Estructura/estructura_backend.txt`, `1_Mermaid/`, `codigo/`.

## 1. Alcance y dependencias
- Roadmap: spec 20 `aud-auditoria` cubre E-01 (RF 084-086). Depende de 07 (`seg-permisos-efectivos-guard`: `@Permiso`, contexto de tenant/sucursal) y 11 (`evt-outbox-relay`: relay, suscriptores). Lo consume el spec 25 (`sazonpos-catalogos-eventos`). Ola 5 de implementación.
- PL-10: `SEG --> AUD` y `EVT --> AUD`; kernel es la raíz (K -> ORG -> SEG, K -> EVT).
- Horas: E-01 = 5 h (sprint 7, release R1; el sprint 7 tiene capacidad 20 h). Cabe en 10 h; el roadmap estima 5.
- Tres áreas propuestas: (a) dominio e inserción encadenada (`aud.evento_auditoria`, hash, inmutabilidad en BD, `AuditoriaPort`, `@Auditable`), (b) acceso a datos sensibles (`registrarAccesoSensible`), (c) consulta paginada con alcance y exportación auditada.
- Fuera de alcance: ARCO e incidentes (el árbol los marca R2: `auditoria/ ... ARCO (R2)`); bitácora de soporte S-06 (spec 18, TR-RN-011); relay del outbox (spec 11); visor Angular (spec 17 / U-06 si aplica; no hay historia propia en E-01); generación real de Excel si depende de TR-REP (R3).
- Constitución aplicable (CLAUDE.md): reglas 1, 2, 3, 4, 5, 6, 8, 10; DoD completo.

## 2. RF
Módulo MOD-12 Auditoría y datos personales (TR-AUD), proceso TR-P11, todos Must / MVP.
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-084 | Registrar evento de auditoría inmutable | plat.auditoria.registrar | APP-03 | TR-RN-028 | TR-RNF-013, 112 | Módulo de producto consumidor |
| TR-RF-085 | Registrar acceso a datos sensibles | plat.auditoria.acceso_sensible | APP-03 | TR-RN-028, TR-RN-011 | TR-RNF-013, 016 | Módulo de producto consumidor |
| TR-RF-086 | Consultar y exportar auditoría | plat.auditoria.consultar | APP-02 | TR-RN-028, TR-RN-047 | TR-RNF-002, 013 | Administrador del cliente, Responsable de datos personales |

- **084** precondición: operación marcada `@Auditable` o invocada vía `AuditoriaPort`. Flujo: 1) el interceptor captura la operación al confirmarse la tx; 2) construye el registro con contexto y diferencias antes/después enmascarando campos sensibles; 3) calcula el hash con el hash del registro anterior del tenant; 4) inserta en `aud.evento_auditoria`. Datos: tenant_id, usuario_id, sucursal_id, accion (ej. rest.venta.anular), entidad_tipo, entidad_id, antes (JSON), despues (JSON), ip, trace_id, hash_anterior, hash. Componentes relacionados: TR-AUD.
- **085** precondición: el producto marca el recurso como sensible. Flujo: el producto invoca `registrarAccesoSensible` al mostrar el recurso; se registra con finalidad declarada; queda disponible para el responsable de datos y el titular. Datos: usuario_id, persona_titular_id, recurso_tipo (HISTORIA_CLINICA|NOTA_SESION|EXPEDIENTE|DATOS_PORTABLES), recurso_id, finalidad (ATENCION|AUDITORIA_MEDICA|SOPORTE|OTRO), fecha.
- **086** precondición: permiso de auditoría con alcance tenant o empresa. Flujo: filtros (fecha_desde, fecha_hasta, usuario, accion, entidad_tipo, entidad_id, sucursal_id); resultados paginados del alcance; detalle con diferencias resaltadas; exportación a Excel con MFA, la exportación queda auditada. Componentes relacionados: TR-AUD, TR-REP, TR-SEG.
- Interfaz (hoja Componentes): TR-AUD provee interceptor `@Auditable` y `AuditoriaPort` (`registrar`, `registrarAccesoSensible`); visor y exportación; verificación de integridad; API ARCO e incidentes; eventos `arco.solicitado`, `persona.cancelacion_aprobada` (ARCO fuera de este spec).

## 3. Criterios GWT
- **TR-CA-209** (084, Positivo, "Auditoría de anulación"): DADO QUE la cajera anula la venta V-000981 | CUANDO se confirma la transacción | ENTONCES se registra el evento con la venta antes y después, el motivo y el hash encadenado
- **TR-CA-210** (084, Negativo, "Intento de modificación"): DADO QUE existe un registro de auditoría | CUANDO un usuario con rol de plataforma ejecuta UPDATE sobre él | ENTONCES la base de datos rechaza la operación
- **TR-CA-211** (085, Positivo, "Lectura de historia clínica"): DADO QUE un médico abre la historia del paciente con DNI 45781236 | CUANDO se muestra la historia | ENTONCES se registra el acceso con usuario, finalidad ATENCION y fecha
- **TR-CA-212** (085, Borde, "Acceso de soporte"): DADO QUE un agente con acceso temporal abre un expediente | CUANDO se muestra | ENTONCES el acceso se registra con finalidad SOPORTE y el número de ticket
- **TR-CA-213** (086, Positivo, "Anulaciones de una cajera"): DADO QUE existen 7 anulaciones de la cajera Rosa en octubre | CUANDO el administrador filtra por usuario Rosa y acción rest.venta.anular | ENTONCES se muestran las 7 con motivo y montos
- **TR-CA-214** (086, Negativo, "Alcance de sucursal"): DADO QUE el supervisor tiene alcance solo en la sucursal «Surco» | CUANDO consulta la auditoría | ENTONCES solo ve los eventos de «Surco»

Estado de prueba en el SRS: Pendiente. No hay GWT para la verificación diaria de integridad (RNF-112) ni para la exportación auditada; el spec debe proponer criterios propios.

## 4. Reglas y RNF
En el SRS los RNF se llaman `TR-RNF-xxx` (el encargo los nombra `RNF-xxx`).
| ID | Texto corto |
|---|---|
| TR-RN-028 | Auditoría de solo inserción: ningún rol, incluido plataforma, modifica ni elimina; cada registro se encadena con el hash del anterior; conservación mínima 5 años. |
| TR-RN-011 | Acceso de soporte a datos de un tenant: autorización expresa del admin del cliente, motivo, ticket, vigencia máx. 4 h; cada acción se audita como ACCESO_SOPORTE (spec 18 lo implementa; aquí solo la finalidad SOPORTE + ticket de TR-CA-212). |
| TR-RN-047 | Exportaciones con datos personales: permiso específico de exportación, auditadas, archivos expiran a las 72 h. |
| TR-RN-034 | Todo evento se inserta en el outbox en la misma tx que el cambio de negocio; entrega al menos una vez; consumidor idempotente por event_id. |
| TR-RNF-013 | (Seguridad/Responsabilidad) Toda operación crítica y acceso a datos sensibles queda en auditoría inmutable con usuario, fecha, origen y contexto. Meta: 100 % de operaciones críticas auditadas. Verificación: revisión de muestras. |
| TR-RNF-112 | (Propio, MOD-12) La auditoría se encadena por hash y su integridad se verifica diariamente. Meta: detección del 100 % de alteraciones simuladas; verificación diaria < 15 min por tenant. Verificación: prueba de manipulación directa en BD de pruebas. |
| TR-RNF-002 | Consultas y listados paginados p95 < 1,5 s con hasta 100 000 registros por tenant (aplica a la consulta 086; la auditoría crece más rápido que otros datos). |
| TR-RNF-010 | Aislamiento por tenant con doble barrera: contexto de aplicación + RLS; 0 accesos cruzados. |
| TR-RNF-016 | Ley 29733 y D.S. 016-2024-JUS: consentimiento, finalidad, ARCO, incidentes en 48 h (finalidad de 085). |
| TR-RNF-008 | Operaciones que cambian estado son idempotentes (el consumidor del outbox no duplica registros de auditoría por reintento). |
| TR-RNF-026 | Logs sin datos personales (el enmascarado de `antes`/`despues` es la contraparte en la bitácora). |
| TR-RNF-106 | Despacho del outbox al menos una vez, p95 < 5 s (condiciona la latencia si la auditoría se consume por evento). |

Heredados por CLAUDE.md: 001/002/003, 011, 012, 024/119, 025 (cobertura dominio >= 70 %), 101.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Descripción | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| E-01 | 7 | 5 | TR-AUD | Auditoría inmutable con hash encadenado, acceso a datos sensibles, consulta y exportación | TR-RF-084, 085, 086 | Back | R1 |

Relacionadas: E-02 (relay outbox, 6 h, sprint 7, spec 11), S-06 (bitácora de soporte, spec 18), E-03 (observabilidad, 4 h, sprint 8, spec 21), C-05/C-06/C-08 (SazónPOS eventos, spec 25). Cronograma PL-02: sprint 7 "Admin de datos · auditoría · eventos" (2027-01-25 a 2027-02-07). Hito H2 (sprint 8, 2027-02-21): plataforma R1 en staging.

## 6. Tablas SQL, eventos, puertos y permisos
- **Tabla `aud.evento_auditoria`**: no existe DDL en `codigo/` (solo `01a_org.sql` y `01b_seg.sql`). Columnas deducibles de RF-084: tenant_id, usuario_id, sucursal_id, accion, entidad_tipo, entidad_id, antes, despues, ip, trace_id, hash_anterior, hash; más id, ocurrido_en. Para 085 falta definir si va en la misma tabla (tipo de registro) o en `aud.acceso_sensible` (persona_titular_id, recurso_tipo, recurso_id, finalidad, ticket). PL-03 ya dibuja el esquema `aud` en la PostgreSQL de la plataforma.
- **Inmutabilidad (TR-CA-210)**: REVOKE UPDATE/DELETE/TRUNCATE al rol de aplicación y de plataforma, más trigger `BEFORE UPDATE OR DELETE` que lance excepción (el propietario del esquema también está sujeto). RLS por `app.tenant_id` como `01a_org.sql` (allí sin `FORCE`).
- **Data API**: `supabase/migrations/20261102000000_seg_supabase_auth.sql` hace REVOKE a `anon, authenticated` en `seg, org`; el esquema `aud` necesita lo mismo (regla 8).
- **Referencia existente**: `seg.evento_seguridad` (bigserial, tenant_id, usuario_id, tipo [LOGIN, ACCESO_DENEGADO, ASIGNACION_OTORGADA, ASIGNACION_REVOCADA, ACCESO_SOPORTE], detalle jsonb, ip, ocurrido_en) es la bitácora de seguridad, distinta de la auditoría de negocio; sin hash ni inmutabilidad. `seg.permiso.sensible` ("exige MFA y queda auditado") enlaza permisos sensibles con auditoría.
- **Eventos**: el outbox (`sync.outbox`, spec 02; relay spec 11) es la vía para que los productos desacoplados entreguen auditoría. Eventos propios de TR-AUD en el SRS: `arco.solicitado`, `persona.cancelacion_aprobada` (R2, fuera de alcance). No hay un evento de auditoría definido; la decisión (inserción directa en la tx vs. suscriptor del outbox) es la pregunta 1. `PL-10`: `EVT --> AUD` sugiere consumo de eventos.
- **Puertos** (lib `libs/plataforma/auditoria`, árbol: "bitácora inmutable con hash encadenado · ARCO (R2)"): `AuditoriaPort.registrar`, `AuditoriaPort.registrarAccesoSensible`, interceptor `@Auditable` (NestJS, en `interface`/`infrastructure`; el dominio no importa NestJS). Consume `ContextoTenant` y `UnidadDeTrabajo` de `kernel`/`kernel-infra`.
- **Permisos** (formato `producto.recurso.accion`): `plat.auditoria.registrar` y `plat.auditoria.acceso_sensible` (llamadas internas, sin endpoint); `plat.auditoria.consultar` (endpoint `/v1`, `@Permiso`, alcance TENANT o EMPRESA, el supervisor de sucursal ve solo la suya según TR-CA-214). La exportación exige aal2 (MFA, RF-086) y el permiso específico de TR-RN-047; no hay código de permiso de exportación en el SRS.
- **Etiquetas Nx**: `scope:plataforma`; dominio `type:domain`, resto `type:backend`.

## 7. Código base relacionado
Raíz: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.
- **Falta**: no hay código de auditoría, kernel ni outbox en `codigo/`. Todo se escribe desde cero.
- **Referencia**: `codigo/db/01b_seg.sql` (`seg.evento_seguridad`, `seg.permiso.sensible`); `codigo/db/01a_org.sql` (patrón RLS por `app.tenant_id`); `codigo/supabase/tests/` y `correr_pruebas.sh` (patrón de pruebas SQL contra PostgreSQL local; reutilizable para TR-CA-210 y para la prueba de manipulación de RNF-112); `codigo/libs/plataforma/seguridad` (convención `@vitrina/plataforma-...`, ESM, imports `.js`, NestJS ^12.2.0, TS ~5.9.3).
- **Cambiar**: `seg.evento_seguridad` queda como bitácora de seguridad (spec 18); no se migra a `aud`.

## 8. Diagramas relevantes (`1_Mermaid/`)
- PL-10 Dependencias entre componentes (SEG --> AUD, EVT --> AUD).
- PL-03 Autenticación y autorización (esquema `aud` en PostgreSQL).
- PL-05 Secuencia solicitud autorizada (transacción + outbox; punto de captura del interceptor).
- PL-02 Cronograma (sprint 7) y PL-01 Hoja de ruta (R1 incluye TR-AUD).

## 9. Ambigüedades y preguntas candidatas (Fase 2)
Ambigüedades:
- El SRS dice 084 "al confirmarse la transacción" y "en almacenamiento de solo inserción", pero no dice si la inserción es síncrona (misma tx) o asíncrona vía outbox.
- El hash encadenado "por tenant" exige serializar inserciones por tenant (contención) y define el orden por una secuencia; no se indica el algoritmo ni el contenido canónico del hash.
- 085 incluye tipos de dato clínico (HISTORIA_CLINICA, NOTA_SESION) propios de PsicoAgenda (R3); en R1 solo SazónPOS consume.
- 086 menciona TR-REP (R3) para exportar; la exportación a Excel en R1 no tiene dueño. RN-047 habla de archivos que expiran a las 72 h, lo que depende de TR-ARC (R2).
- La verificación diaria de RNF-112 no tiene historia ni RF; no está claro si entra en E-01 (5 h).
- `sucursal_id` en 084 vs. `sede_id` en RF-092: nombres distintos para lo mismo.
- RNF-013 pide 100 % de operaciones críticas auditadas pero no define cuáles lo son (lista de acciones `@Auditable`).

Preguntas candidatas, con recomendación:
1. ¿Inserción síncrona en la tx o por evento del outbox? Recomendación: síncrona en la misma tx del caso de uso (el interceptor llama a `AuditoriaPort.registrar` con el `EntityManager` de la UoW), así cumple "100 % auditadas" y una tx revertida no deja rastro; el consumo por outbox queda solo para productos externos (SazónPOS, spec 25) con un suscriptor idempotente por `event_id`.
2. ¿Append-only cómo? Recomendación: tres capas: REVOKE UPDATE/DELETE/TRUNCATE a todos los roles de aplicación, trigger que lanza excepción, y RLS por tenant; probar TR-CA-210 con el rol de plataforma. Sin borrado ni siquiera por retención dentro de 5 años.
3. ¿Hash encadenado cómo? Recomendación: SHA-256 sobre JSON canónico (campos ordenados) + `hash_anterior`; cadena por tenant con `numero` secuencial por tenant, e inserción serializada con `pg_advisory_xact_lock(hashtext(tenant_id))` o fila de cabeza `aud.cadena_tenant`. Documentar el costo de contención y medir con carga.
4. ¿Particionado? Recomendación: particionar por rango mensual de `ocurrido_en` (con `tenant_id` en la clave de índice) desde el inicio, para facilitar retención y archivado; la cadena es por tenant, no por partición, así que el hash cruza particiones. Si E-01 no cabe en 5 h con particionado, dejarlo como Fase siguiente y solo dejar el DDL listo.
5. ¿Retención y archivado? Recomendación: mínimo 5 años (TR-RN-028); sin purga automática en R1; documentar política y mover particiones antiguas a almacenamiento frío en un spec posterior. Parámetro de retención en TR-CFG (spec 09) solo si ya está disponible.
6. ¿Verificación diaria de integridad (RNF-112)? Recomendación: incluir un servicio `VerificarIntegridad` por tenant y una tarea programada diaria en el worker, con prueba de manipulación directa en BD de pruebas; meta < 15 min por tenant. Si no cabe, dejar el servicio y la prueba, y la programación al spec 21.
7. ¿Acceso sensible (085) en tabla propia o misma tabla? Recomendación: misma cadena de hash y misma tabla con `tipo` (`OPERACION` | `ACCESO_SENSIBLE`) y campos específicos en JSON, para una sola cadena verificable; `ticket` obligatorio si finalidad = SOPORTE (TR-CA-212).
8. ¿Qué campos se enmascaran y qué operaciones son críticas? Recomendación: lista declarativa en el decorador `@Auditable({ accion, entidad, enmascarar: [...] })`; enmascarado por defecto de contraseñas, tokens y documentos; lista de acciones críticas de R1 (anulaciones, cambio de estado de tenant, asignaciones de rol) definida en el spec.
9. ¿Exportación (086) en R1? Recomendación: endpoint de exportación CSV/XLSX síncrono con límite de filas, aal2 y registro de la exportación en la propia auditoría; sin archivo persistido ni expiración de 72 h (depende de TR-ARC, R2); anotar la desviación frente a TR-RN-047.
