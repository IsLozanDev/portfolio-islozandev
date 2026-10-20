# Contexto para spec 18 · seg-bitacora-soporte

Paquete de contexto (no es el spec). Versiones vigentes: Angular 21, NestJS 12. Rutas de código relativas a `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/` (abreviado `PLAN/`).

## 1. Alcance y dependencias

- roadmap-specs.md (versión 2): spec 18 `seg-bitacora-soporte`, cubre historia S-06, RF 019 y 020, TR-RN-011. Estimado 4-6 h. Depende solo del spec 08 (seg-membresias); transitivas 07, 06, 05, 04, 03, 02. Ola 6 de implementación (junto a 12, 15, 19, 21).
- Nota: el paquete 07 aún llama "spec 11" a la bitácora (numeración vieja). Vigente: 18. El spec 11 actual es evt-outbox-relay.
- Presupuesto S-06: 4 h (tipo Full, sprint 5, R1). El sprint 5 (28/12/2026 a 10/01/2027, capacidad 14 h, factor 0,7) suma U-04 (4), U-05 (4), U-06 (2) y S-06 (4) = 14 h: sin holgura. La UI de bitácora (`admin-cliente/bitacora`) está en la estructura frontend, pero ninguna historia con horas la cubre (U-03..U-06 no citan RF 019/020).
- Fuera de alcance: tickets de soporte y su cierre (TR-SOP, R3, historia R3-08 y RF 111-118); envío de correo/avisos (TR-NOT, R2); exportación a Excel por motor de reportes (TR-REP, R3, R3-04); auditoría inmutable con hash (TR-AUD, spec 20, TR-RF-084/086, TR-RNF-112); sesiones activas (TR-RF-018, R2); transferir propiedad (TR-RF-021, R2).
- Reutiliza de spec 08: tabla `seg.membresia` (estados, `hasta`), puerto `proveedor-identidad` (cierre de sesiones), invalidación de caché de permisos y emisión de `ASIGNACION_*`.

## 2. RF

| ID | Nombre | Permiso | Prioridad | Fase SRS |
|---|---|---|---|---|
| TR-RF-019 | Consultar bitácora de seguridad | `plat.seguridad.bitacora` | Should | MVP |
| TR-RF-020 | Autorizar acceso temporal de soporte | `plat.soporte.autorizar` | Must | MVP |

Ambos: módulo MOD-02 (TR-SEG), app APP-02 (administración del cliente, embebible), proceso TR-P02 (RF-019 también TR-P11; RF-020 también TR-P08).

**TR-RF-019** (actores: administrador del cliente, responsable de datos personales del cliente; componentes TR-SEG, TR-AUD, TR-REP; regla TR-RN-047; RNF-002, 013)
- Precond.: existen eventos en `seg.evento_seguridad` del tenant.
- Flujo: (1) define filtros de fecha, usuario y tipo; (2) lista paginada por fecha descendente; (3) abre detalle con IP y datos del evento o exporta a Excel.
- Datos: fecha_desde, fecha_hasta (fecha); usuario (texto); tipo (LOGIN|ACCESO_DENEGADO|ASIGNACION_OTORGADA|ASIGNACION_REVOCADA|ACCESO_SOPORTE).
- Salida: listado paginado y exportación auditada.

**TR-RF-020** (actores: administrador del cliente, agente de soporte N1/N2; componentes TR-SEG, TR-SOP, TR-AUD, TR-NOT; regla TR-RN-011; RNF-110, 013)
- Precond.: existe un ticket abierto del tenant asignado al agente.
- Flujo: (1) el agente solicita acceso desde el ticket con motivo y alcance (solo lectura o lectura y escritura); (2) el administrador del cliente recibe la solicitud y la aprueba con vigencia de hasta 4 h; (3) el sistema crea membresía temporal tipo SOPORTE y registra ACCESO_SOPORTE; (4) el agente opera con banner «Sesión de soporte», cada acción se audita con el n.° de ticket; (5) al vencer la vigencia o cerrar el ticket, el acceso se revoca automáticamente.
- Datos: ticket (SOP-######); motivo (texto 10-300); modo (LECTURA|ESCRITURA); vigencia_horas (1-4); aprobado_por (uuid).
- Salida: acceso de soporte vigente, visible y auditado, revocado automáticamente.

## 3. Criterios GWT (tal cual; todos "Pendiente")

**TR-RF-019**
- TR-CA-051 · Filtro por accesos denegados · Positivo. DADO QUE existen 15 eventos ACCESO_DENEGADO en la semana · CUANDO filtra por ese tipo y la última semana · ENTONCES se muestran los 15 eventos con usuario, permiso faltante y fecha
- TR-CA-052 · Rango sin eventos · Borde. DADO QUE no hubo accesos de soporte en septiembre de 2026 · CUANDO filtra ACCESO_SOPORTE en ese mes · ENTONCES el sistema muestra «Sin eventos para los filtros seleccionados»

**TR-RF-020**
- TR-CA-053 · Aprobación por 2 horas · Positivo. DADO QUE el agente Javier solicita acceso de lectura para el ticket SOP-000245 · CUANDO el administrador del cliente aprueba por 2 horas · ENTONCES Javier accede al tenant con banner de soporte y el acceso expira a las 2 horas
- TR-CA-054 · Vigencia mayor a 4 horas · Negativo. DADO QUE existe una solicitud de acceso pendiente · CUANDO el administrador intenta aprobarla por 8 horas · ENTONCES el sistema limita la vigencia y muestra «La vigencia máxima es 4 horas»
- TR-CA-055 · Cierre del ticket durante el acceso · Borde. DADO QUE Javier tiene acceso vigente por el ticket SOP-000245 · CUANDO el ticket pasa a CERRADO · ENTONCES el acceso de soporte se revoca de inmediato

Total: 5 GWT (2 + 3), coinciden con "N.° criterios". Relacionado fuera de este spec: TR-CA-212 (TR-RF-085, spec 20/AUD): acceso a expediente por agente con acceso temporal se registra con finalidad SOPORTE y n.° de ticket. No hay GWT para: acceso fuera del permiso de lectura (modo LECTURA intentando escribir), rechazo de solicitud, expiración automática verificable ni solicitud sin ticket (ver sección 9).

## 4. Reglas y RNF

| ID | Texto corto | Aplicación |
|---|---|---|
| TR-RN-011 | Acceso de soporte a datos del tenant: autorización expresa del administrador del cliente, motivo, ticket asociado, vigencia máx. 4 h; cada acción se audita como ACCESO_SOPORTE (fuente: Ley 29733 encargado de tratamiento; TR-RNF-013) | RF-020 |
| TR-RN-047 | Exportaciones con datos personales: permiso específico de exportación, auditadas, archivos expiran a las 72 h (Ley 29733) | RF-019 (exportación) |
| TR-RN-007 | Permisos `producto.recurso.accion` por alcance; los permisos PLAT no dependen de suscripción | `plat.seguridad.bitacora`, `plat.soporte.autorizar` son PLAT |
| TR-RN-009 | Permisos sensibles exigen MFA <= 15 min y auditoría | Decidir si `plat.soporte.autorizar` es sensible |
| TR-RNF-002 | Listados paginados p95 < 1,5 s con hasta 100 000 registros por tenant | RF-019 (índices sobre `evento_seguridad`) |
| TR-RNF-013 | Auditoría inmutable de operaciones críticas (usuario, fecha, origen, contexto) | RF-019, 020 |
| TR-RNF-110 | Acceso de soporte temporal, visible para el cliente y totalmente auditado: vigencia <= 4 h; banner visible en 100 % de pantallas; 100 % de acciones auditadas | RF-020 |
| TR-RNF-010 | Aislamiento por tenant con doble barrera (contexto + RLS) | RF-019 (solo eventos del tenant) y RF-020 (agente solo ve el tenant autorizado) |
| TR-RNF-014 | Sesiones con expiración por inactividad y tokens cortos | RF-020 (expiración de acceso) |
| TR-RNF-112 | Auditoría encadenada por hash (MOD-12, TR-AUD, spec 20) | Contexto: `seg.evento_seguridad` no lo cumple por sí sola |

Heredan además los RNF transversales de CLAUDE.md (008, 010, 011, 012, 013/112, 024/119, 025, 026, 101, 106).

## 5. Historias del backlog (3_plan.json)

| ID | Sprint | Comp. | Horas | Descripción | RF |
|---|---|---|---|---|---|
| **S-06** | 5 | TR-SEG | **4** (Full, R1) | Bitácora de seguridad y acceso temporal de soporte | TR-RF-019, 020 |
| U-03 | 4 | Admin cliente | 6 (Front) | Usuarios: invitar, asignar rol por sucursal, revocar | TR-RF-009, 013, 014 |
| R3-08 | 23 | TR-SOP | 14 (Full, R3) | Widget de soporte con contexto, bandeja por SLA, estados y comentarios | TR-RF-111, 113, 114, 115 |
| R3-04 | 20 | TR-REP | 8 (Full, R3) | Definiciones de reportes, ejecución y exportación | TR-RF-096, 097 |

Hito relacionado: H5 (pase a producción R3, sprint 25) incluye soporte en producción. Riesgo del plan: capacidad de un solo desarrollador a tiempo parcial; sprint 5 sin holgura.

## 6. Tablas SQL, eventos, puertos, permisos

**Tablas** (`PLAN/codigo/db/01b_seg.sql`)
- `seg.evento_seguridad`: `id bigserial`, `tenant_id uuid NULL`, `usuario_id uuid NULL`, `tipo varchar(30)` (comentario: LOGIN, ACCESO_DENEGADO, ASIGNACION_OTORGADA, ASIGNACION_REVOCADA, ACCESO_SOPORTE; sin CHECK), `detalle jsonb`, `ip inet`, `ocurrido_en timestamptz`. Sin índices, sin RLS, sin FK, sin protección de inmutabilidad.
- `seg.usuario.tipo` admite INTERNO|EXTERNO|SOPORTE (ya previsto); el trigger `trg_auth_usuario_creado` toma el tipo solo de `raw_app_meta_data.tipo_usuario`.
- `seg.membresia`: `estado` INVITADO|ACTIVO|SUSPENDIDO, `hasta timestamptz` (el hook y `tenant_para_token` ya excluyen membresías con `hasta` vencida o no ACTIVO). Es el vehículo natural de la "membresía temporal tipo SOPORTE" de RF-020.
- `seg.asignacion`: `vigente_hasta` es `date` (no timestamp): no sirve para vigencia en horas; la expiración de 4 h debe vivir en `membresia.hasta`.
- No existe tabla de solicitud/autorización de soporte (ticket, motivo, modo, solicitada_por, aprobado_por, vigencia, estado).

**Eventos**: ASIGNACION_OTORGADA y ASIGNACION_REVOCADA salen del spec 08; `ACCESO_SOPORTE` está en el catálogo del SRS (RF-019, TR-RN-011) pero no hay clase en `estructura_backend.txt` (`domain/eventos/` lista solo membresia-invitada, asignacion-otorgada, rol-permisos-cambiados). Faltan eventos de dominio para solicitud, aprobación, vencimiento y revocación de soporte. Entrega por outbox (regla 4 de CLAUDE.md); `sync.outbox` es del spec 02, relay del spec 11.

**Puertos** (`application/ports`): `membresia.repositorio`, `proveedor-identidad` (cierre de sesiones, del spec 08), `cache-permisos`; kernel (UnidadDeTrabajo, ContextoTenant, outbox). Para RF-020 hará falta un puerto hacia tickets (TR-SOP no existe hasta R3) y otro hacia notificaciones (TR-NOT, R2). Ambos con adaptador nulo/fake, como propone el roadmap para IDN y NOT en el spec 12.

**Estructura prevista**: backend `libs/plataforma/seguridad` (no lista casos de uso de bitácora ni soporte); frontend `libs/plataforma/admin-cliente/src/lib/bitacora/` ("bitácora de seguridad · acceso temporal de soporte"); `AuditoriaPort.registrar` pertenece a TR-AUD (spec 20), aún sin implementar.

**Permisos**: `plat.seguridad.bitacora` (RF-019), `plat.soporte.autorizar` (RF-020, el SRS lo asigna al administrador del cliente y al agente de soporte). No existe seed de `seg.permiso` en `codigo/`.

## 7. Código base relacionado

Existe en `PLAN/codigo/`:
- `db/01b_seg.sql`: CONSERVAR `evento_seguridad`, `usuario.tipo` con SOPORTE, `membresia.hasta`. FALTA/CAMBIAR: índices por `(tenant_id, ocurrido_en DESC)` y por tipo/usuario; RLS por tenant (sin ella la consulta de bitácora no cumple RNF-010); CHECK o catálogo de `tipo`; tabla de acceso de soporte; protección contra UPDATE/DELETE de eventos.
- `supabase/migrations/20261102000000_seg_supabase_auth.sql`: el hook `custom_access_token_hook` y `tenant_para_token` toman la primera membresía ACTIVO no vencida; con un agente de soporte con varias membresías temporales o su propio tenant, la elección del tenant activo debe revisarse. `tipo_usuario` SOPORTE viaja en el token (ADR-32: el token solo lleva `tenant_id` y `tipo_usuario`); el modo LECTURA|ESCRITURA y el n.° de ticket NO caben en el token, deben resolverse en backend/caché.
- `libs/plataforma/seguridad/src/interface/permiso.guard.ts` y `decoradores.ts` (`@Permiso`, `@UsuarioActual`): sirven para los dos permisos; no hay forma de forzar LECTURA vs ESCRITURA ni de auditar cada acción de un principal SOPORTE (haría falta interceptor, p. ej. `@Auditable` de TR-AUD o uno propio).
- `domain/principal.ts`: lleva usuario, tenant, tipo, aal; no lleva modo ni ticket de soporte.
- `domain/errores.ts`: solo TokenInvalidoError y AccesoDenegadoError; faltan errores de vigencia de soporte.
- `permisos.sql.repositorio.ts`/`resolver-permisos.use-case.ts`: caché de permisos por tenant con TTL 60 s; la expiración de 4 h debe invalidar caché y no depender del TTL.
- `libs/shared/auth` (Angular): `sesion.service.ts` y `si-permiso.directive.ts` sirven para ocultar el menú; no hay banner de soporte.

NO existe en `codigo/` (hay que crear): consulta de eventos (repositorio, caso de uso, controlador, DTO de filtros y paginación); casos de uso solicitar/aprobar/rechazar/revocar acceso de soporte; tarea de vencimiento (BullMQ/cron); tabla de solicitudes; banner de sesión de soporte; pantalla `bitacora` en Angular; exportación a Excel; plantilla de aviso al administrador; ningún sembrado de permisos.

## 8. Diagramas

- **PL-05** (solicitud autorizada): el guard escribe `ACCESO_DENEGADO` en `evento_seguridad`; es el origen de uno de los tipos consultables por RF-019.
- **PL-03/PL-04**: autenticación y token con tenant activo (aplica al ingreso del agente de soporte).
- **PL-06**: invitación; patrón de membresía + asignación creada desde backend que RF-020 puede reutilizar para la membresía SOPORTE.
- **PL-10**: orden kernel -> ORG -> SEG; TR-SOP/TR-NOT/TR-REP posteriores. No hay diagrama PL propio de soporte ni de bitácora.

## 9. Ambigüedades y preguntas candidatas para Fase 2

Ambigüedades:
1. RF-020 exige un ticket abierto (SOP-######) pero TR-SOP es R3 (R3-08); CA-055 (cierre de ticket) no se puede probar de extremo a extremo en R1.
2. RF-020 dice "el sistema crea una membresía temporal tipo SOPORTE", pero `seg.membresia` no tiene tipo (solo `usuario.tipo`), y `UNIQUE(usuario_id, tenant_id)` impide dos accesos de soporte sucesivos al mismo tenant sin reutilizar la fila.
3. El SRS cita TR-AUD para registrar cada acción del agente y para la bitácora, pero AUD es el spec 20 (depende de 07 y 11); este spec depende solo de 08 y `seg.evento_seguridad` no es inmutable ni encadenada (TR-RNF-112).
4. RF-019 pide "exporta a Excel" y TR-RN-047 (permiso específico, auditada, archivo expira a 72 h), pero el motor de exportación es TR-REP (R3) y el almacenamiento de archivos TR-ARC (R2). Prioridad Should.
5. "Auditoría de cada acción" del agente: el SRS no define granularidad (por request HTTP, solo escrituras) ni dónde (evento_seguridad vs TR-AUD).
6. "Alcance" de la solicitud: RF-020 dice "motivo y alcance de solo lectura o lectura y escritura" (campo `modo`), no alcance TENANT/EMPRESA/SUCURSAL; si el agente accede a todo el tenant o a una sucursal no está definido.
7. Solicitud y aprobación implican un estado intermedio (PENDIENTE) y notificación al administrador (TR-NOT, R2); el SRS no incluye el rechazo ni la caducidad de una solicitud sin aprobar.
8. CA-054 dice «el sistema limita la vigencia y muestra "La vigencia máxima es 4 horas"»: ambiguo entre rechazar y recortar a 4 h. El dato `vigencia_horas (1-4)` sugiere rechazar.
9. Los datos de `evento_seguridad.detalle` para "permiso faltante" (CA-051) no están definidos; hoy el guard solo inserta tipo y detalle libre. LOGIN aún no tiene productor claro.
10. RF-019 "usuario (texto)": coincidencia por email, nombre o id no está especificada.

Preguntas candidatas (con recomendación):
1. ¿Cómo se valida el ticket mientras no exista TR-SOP? Recomiendo puerto `VerificadorTicket` (valida formato SOP-###### y que esté abierto, asignado al agente) con adaptador fake/permisivo en R1 y el real en R3; el cierre de ticket (CA-055) expone un caso de uso `revocar-acceso-soporte` que TR-SOP invocará, probado con una llamada directa. Confirmar con el usuario.
2. ¿Cómo se modela el acceso de soporte? Recomiendo tabla nueva `seg.acceso_soporte` (id, tenant_id, agente_id, ticket, motivo, modo, estado PENDIENTE|APROBADO|RECHAZADO|REVOCADO|EXPIRADO, aprobado_por, desde, hasta, membresia_id) con RLS, y al aprobar crear/actualizar la membresía ACTIVO con `hasta` (no el `vigente_hasta date` de la asignación). Migración reversible.
3. ¿Cómo se aplica LECTURA vs ESCRITURA y el banner? Recomiendo resolver el acceso de soporte en backend (guard/caché por usuario+tenant, no en el token por ADR-32): LECTURA solo permite permisos de acción lectura; exponer `GET` de contexto con `{modo, ticket, hasta}` para el banner (RNF-110). Confirmar qué permisos cuentan como lectura.
4. ¿Cómo y dónde se audita cada acción del agente? Recomiendo, en este spec, interceptor sobre principales tipo SOPORTE que escribe `ACCESO_SOPORTE` en `seg.evento_seguridad` (con ticket, método, ruta, sin datos personales por RNF-026) en la misma transacción; migrar a TR-AUD en el spec 20. Alternativa: diferir la granularidad de acción y registrar solo inicio/fin.
5. ¿Cómo se revoca al vencer? Recomiendo doble barrera: `membresia.hasta` ya excluye del hook y de permisos (efecto inmediato en la validación) más una tarea programada que marca EXPIRADO, invalida caché, cierra sesiones (puerto del spec 08) y registra el evento. Ver si BullMQ (stack) ya está disponible tras el spec 11 o si se usa un barrido bajo demanda.
6. ¿Qué hacer con la vigencia > 4 h (CA-054)? Recomiendo rechazar con error de dominio «La vigencia máxima es 4 horas» (validación 1-4 en dominio y CHECK en BD), alineado con `vigencia_horas (1-4)`.
7. ¿Cómo se consulta la bitácora (RF-019) y cumple p95? Recomiendo paginación por cursor (`ocurrido_en DESC, id`), índice `(tenant_id, ocurrido_en DESC)`, RLS por tenant, filtros fecha/tipo/usuario (por email o id); detalle con IP en endpoint aparte. Definir `detalle.permiso_faltante` para ACCESO_DENEGADO (CA-051).
8. ¿Exportación a Excel dentro de este spec? Recomiendo diferirla a TR-REP/R3 (o CSV simple detrás de un puerto) y documentar que TR-RN-047 queda pendiente; RF-019 es Should. Si entra, exigir permiso específico y registrar la exportación.
9. ¿Es sensible `plat.soporte.autorizar` y quién puede aprobar? Recomiendo marcarlo sensible (aal2, TR-RN-009) para aprobar, y exigir que quien aprueba tenga alcance TENANT; el agente nunca se autoaprueba. Decidir junto con el seed de permisos del spec 06/07.
10. ¿Cabe en 4-6 h y cómo se parte? Recomiendo: Back (consulta de bitácora + tabla/casos de uso de soporte + expiración + pruebas) y dejar fuera UI, exportación y TR-SOP real. La UI `admin-cliente/bitacora` y el banner van a spec 16/17 (no tienen horas hoy; avisar al usuario de la brecha en el backlog). Con 4 h la estimación es muy ajustada; esperar 6 h.
