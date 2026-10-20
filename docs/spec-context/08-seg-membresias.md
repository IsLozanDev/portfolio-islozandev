# Contexto para el spec 08 · seg-membresias (antes "spec 07")

Paquete de contexto (no es el spec). Versiones vigentes: Angular 21, NestJS 12. Rutas de código relativas a `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/` (abreviado `PLAN/`).

## 1. Alcance y dependencias

- roadmap-specs.md: spec 07 `seg-membresias`, cubre historia S-04, RF 009, 010, 014. Depende del spec 06 (seg-autorizacion: S-01, S-02, S-03, S-05). Transitivas: 03 (org), 04 (auth back), 02 (kernel/outbox).
- Desbloquea: 09 (admin-usuarios-roles, U-03 invitar/revocar en UI), 11 (seg-bitacora-soporte), 19 (sazonpos-auth).
- Fuera de alcance (otros specs): UI de usuarios (09), roles/perfiles (RF 011-013, spec 06/09), bitácora/soporte (RF 019/020, spec 11), alta de tenant con invitación al propietario (O-02, spec 03), migración SazónPOS (PL-07, spec 19), envío de correo TR-NOT (R2).
- Presupuesto S-04: 4 h (Back, sprint 3, R1). Muy ajustado para 3 RF + puerto + handler.
- RF-009 y RF-014 también aparecen en U-03 (front, spec 09). RF-010 en el SRS vive en APP-05 (shell/auth-ui: pantalla "aceptar invitación").

## 2. RF

| ID | Nombre | Permiso | Prioridad | Fase |
|---|---|---|---|---|
| TR-RF-009 | Invitar usuario al tenant | `plat.usuario.invitar` | Must | MVP |
| TR-RF-010 | Aceptar invitación y vincular identidad | `publico.invitacion.aceptar` | Must | MVP |
| TR-RF-014 | Revocar acceso y suspender membresía | `plat.asignacion.revocar` | Must | MVP |

Los tres: módulo MOD-02 (TR-SEG), proceso TR-P02.

**TR-RF-009** (APP-02, actor: administrador del cliente; componentes TR-SEG, TR-NOT, TR-ORG; reglas TR-RN-006, 008; RNF-009, 013)
- Precond.: actor con alcance suficiente para el alcance que otorga; plan no alcanzó límite de usuarios.
- Flujo: (1) ingresa correo, nombre, perfil o rol con alcance; (2) verifica límite de usuarios del plan; (3) si el correo no existe en seg.usuario lo crea; crea membresía INVITADO y asignación propuesta; (4) envía invitación con enlace de un solo uso válido 72 h.
- Datos: correo (válido, obligatorio); nombre (3-150); perfil_id o rol_id (uno obligatorio); alcance TENANT|EMPRESA|SUCURSAL|UNIDAD; empresa_id/sucursal_id/unidad_id según alcance; vigente_hasta (fecha opcional).
- Salida: membresía INVITADO creada e invitación enviada.

**TR-RF-010** (APP-05, actores: usuario operativo, IdP; componentes TR-SEG, TR-AUD; regla TR-RN-008; RNF-009, 014)
- Precond.: invitación vigente y no usada.
- Flujo: (1) abre enlace; (2) shell redirige al IdP; (3) IdP devuelve token con sub y correo verificado; (4) sistema verifica que el correo coincida con la invitación y activa membresía y asignación; (5) registra evento ASIGNACION_OTORGADA.
- Datos: token_invitacion (cadena de un solo uso); sub (uuid); correo_verificado (bool).
- Salida: membresía ACTIVA y usuario con acceso.

**TR-RF-014** (APP-02, actor: administrador; componentes TR-SEG, TR-AUD; regla TR-RN-010; RNF-021, 014, 013)
- Precond.: el usuario tiene membresía en el tenant.
- Flujo: (1) selecciona asignación o membresía y acción; (2) pide confirmación y motivo; (3) valida TR-RN-010 si es propietario; (4) revoca o suspende, invalida caché, solicita al IdP cierre de sesiones y registra ASIGNACION_REVOCADA.
- Datos: membresia_id o asignacion_id (uuid); accion REVOCAR|SUSPENDER|FINALIZAR; motivo (5-300, obligatorio).
- Salida: usuario sin acceso en el alcance revocado y sesiones cerradas.

## 3. Criterios GWT (tal cual; todos "Pendiente")

**TR-RF-009**
- TR-CA-025 · Invitación a cajera de sucursal · Positivo. DADO QUE el administrador tiene alcance TENANT y el plan permite 10 usuarios con 6 activos · CUANDO invita a rosa.huaman@gmail.com con el perfil «Cajero» en la sucursal «Miraflores» · ENTONCES se crea la membresía en estado INVITADO y se envía el correo de invitación
- TR-CA-026 · Alcance superior al propio · Negativo. DADO QUE el actor tiene alcance SUCURSAL en «Miraflores» · CUANDO intenta invitar a un usuario con alcance TENANT · ENTONCES el sistema rechaza con «No puede otorgar un alcance mayor al suyo»
- TR-CA-027 · Usuario ya miembro de otro tenant · Borde. DADO QUE carlos.rojas@outlook.com es usuario activo del tenant «gym-norte» · CUANDO lo invitan al tenant «gym-sur» · ENTONCES se crea una segunda membresía sin duplicar el usuario

**TR-RF-010**
- TR-CA-028 · Aceptación exitosa · Positivo. DADO QUE rosa.huaman@gmail.com tiene una invitación vigente · CUANDO acepta e inicia sesión en el IdP con ese correo · ENTONCES su membresía queda ACTIVA y ve el menú del perfil «Cajero»
- TR-CA-029 · Invitación vencida · Negativo. DADO QUE la invitación fue emitida hace 80 horas · CUANDO el invitado abre el enlace · ENTONCES el sistema muestra «La invitación expiró; solicite una nueva al administrador»
- TR-CA-030 · Correo distinto · Negativo. DADO QUE la invitación es para rosa.huaman@gmail.com · CUANDO el invitado inicia sesión con rosa.h@hotmail.com · ENTONCES el sistema no activa la membresía y muestra «Esta invitación pertenece a otro correo»

**TR-RF-014**
- TR-CA-039 · Salida de colaborador · Positivo. DADO QUE Pedro Salazar tiene membresía ACTIVA y una sesión abierta · CUANDO el administrador finaliza su membresía con motivo «Cese» · ENTONCES la sesión de Pedro se invalida y no puede volver a ingresar al tenant
- TR-CA-040 · Último propietario · Negativo. DADO QUE Ana Torres es la única propietaria del tenant · CUANDO intenta suspender su propia membresía · ENTONCES el sistema rechaza con «El tenant debe tener al menos un propietario activo»

Total: 8 GWT (3 + 3 + 2), coinciden con "N.° criterios" de cada RF. No hay GWT para límite de plan excedido, MFA ni revocación de una asignación puntual (ver sección 9).

## 4. Reglas y RNF

| ID | Texto corto | Aplicación |
|---|---|---|
| TR-RN-006 | Sin suscripción vigente no hay permisos; no se crean usuarios por encima de los límites del plan | RF-009 (paso 2; `org.suscripcion.limite_usuarios`) |
| TR-RN-008 | Asignación = rol o perfil (nunca ambos ni ninguno); alcance coherente con empresa/sucursal/unidad; vigente_hasta >= vigente_desde | RF-009, 010. SQL: `ck_asig_rol_o_perfil`, `ck_asig_alcance`; no hay CHECK de fechas en 01b_seg.sql |
| TR-RN-010 | Todo tenant con al menos un propietario con membresía ACTIVA; no suspender/revocar/dar de baja al último | RF-014 |
| TR-RN-011 | Acceso de soporte a datos del tenant: autorización expresa, motivo, ticket, máx. 4 h, audita ACCESO_SOPORTE | No la referencia ninguno de los 3 RF (RF-009/010/014 citan solo 006, 008, 010). Pertenece a RF-019/020 (spec 11); aquí solo como límite de alcance |
| TR-RN-007 | Permisos `producto.recurso.accion` por alcance (TENANT cubre todo, etc.); PLAT no depende de suscripción | Contexto: base de "alcance superior al propio" (CA-026) |
| TR-RN-009 | Permisos sensibles exigen MFA <= 15 min y auditoría | Contexto: definir si invitar/revocar son `sensible` (no hay seed de permisos) |
| TR-RNF-009 | Autenticación OIDC centralizada; contraseñas en el IdP; bloqueo tras 5 fallos; MFA obligatorio para permisos sensibles | RF-009, 010 |
| TR-RNF-013 | Auditoría inmutable de operaciones críticas (usuario, fecha, origen, contexto) | RF-009, 014 |
| TR-RNF-014 | Sesiones con expiración por inactividad (30 min backoffice) y tokens cortos con renovación | RF-010, 014 |
| TR-RNF-021 | Confirmación explícita y motivo obligatorio en acciones destructivas | RF-014 |

Además heredan los RNF transversales de CLAUDE.md (008 idempotencia, 010 aislamiento, 101 caché de permisos, 106 outbox, etc.).

## 5. Historias del backlog (3_plan.json)

| ID | Sprint | Comp. | Horas | Descripción | RF |
|---|---|---|---|---|---|
| **S-04** | 3 | TR-SEG | **4** (Back, R1) | Invitar, aceptar, revocar y suspender membresía | TR-RF-009, 010, 014 |
| U-03 | 4 | Admin cliente | 6 (Front) | Usuarios: invitar, asignar rol por sucursal, revocar | TR-RF-009, 013, 014 (spec 09) |
| O-02 | 2 | TR-ORG | 5 | Alta de tenant transaccional con siembra e invitación al propietario (Admin API) | TR-RF-001 (spec 03; reutiliza el puerto proveedor-identidad) |

Dependencias del spec 06 en el mismo sprint 3: S-01, S-02, S-03 (3 h), S-05 (2 h).

## 6. Tablas SQL, eventos, puertos, permisos

**Tablas** (`PLAN/codigo/db/01b_seg.sql`, `01a_org.sql`)
- `seg.usuario` (id = sub = auth.users.id; email UNIQUE; tipo INTERNO|EXTERNO|SOPORTE; estado ACTIVO|BLOQUEADO|BAJA; la migración Supabase agrega tenant_preferido y creado_en).
- `seg.membresia` (usuario_id, tenant_id, `estado` CHECK INVITADO|ACTIVO|SUSPENDIDO, es_propietario, invitado_por, desde, hasta; UNIQUE(usuario_id, tenant_id)).
- `seg.asignacion` (membresia_id ON DELETE CASCADE, rol_id xor perfil_id, alcance, empresa/sucursal/unidad_id, vigente_desde, vigente_hasta, otorgado_por).
- `seg.evento_seguridad` (tipo: LOGIN, ACCESO_DENEGADO, ASIGNACION_OTORGADA, ASIGNACION_REVOCADA, ACCESO_SOPORTE; detalle jsonb).
- Consulta: `org.suscripcion.limite_usuarios` (por tenant+producto, NULL = sin límite), `org.tenant`, `seg.rol`, `seg.perfil`, `seg.permiso`.
- Funciones: `seg.permisos_efectivos`, `seg.sucursales_accesibles` (solo membresías `ACTIVO`), `seg.tenant_para_token`, `seg.custom_access_token_hook`.

**Eventos** (estructura_backend.txt, `seguridad/src/domain/eventos/`): `membresia-invitada`, `asignacion-otorgada`, `rol-permisos-cambiados`. PL-06 lo nombra `seg.membresia.invitada`. El SRS cita ASIGNACION_OTORGADA (RF-010) y ASIGNACION_REVOCADA (RF-014). No hay archivo `asignacion-revocada` en la estructura: falta. Entrega por outbox (regla 4 de CLAUDE.md); la tabla outbox está planeada en `db/01e_sync_outbox.sql`, que no existe en `codigo/`.

**Puertos** (`application/ports`): `proveedor-identidad` (Admin API), `membresia.repositorio`, `permisos.repositorio`, `cache-permisos`, `verificador-token`; del kernel: UnidadDeTrabajo, ContextoTenant, outbox.
**Handler**: `application/handlers/invalidar-cache-permisos.handler.ts` (por tenant; `resolver-permisos.use-case.ts` documenta eventos `seg.asignacion.*` / `seg.rol.permisos_cambiados`).
**Casos de uso**: `invitar-usuario`, `aceptar-invitacion`, `asignar-rol`, `revocar-acceso`. Dominio: `membresia.ts` (invitar, aceptar, suspender, revocar), `asignacion.ts`.
**HTTP**: `interface/http/invitaciones.controller`, `usuarios.controller`, `dto/`. Endpoints citados: `POST /v1/seg/usuarios/invitar` (PL-05), `POST /v1/seg/invitaciones/aceptar` (PL-06). No hay endpoint documentado para revocar/suspender.

**Permisos**: `plat.usuario.invitar`, `plat.asignacion.revocar`, `publico.invitacion.aceptar` (SRS). No existe seed de `seg.permiso` en `codigo/` (solo aparece `plat.usuario.invitar` como ejemplo en decoradores y pruebas).

## 7. Código base relacionado

Existe en `PLAN/codigo/`:
- `db/01b_seg.sql`: CONSERVAR usuario/membresia/asignacion/evento_seguridad y funciones. FALTA/CAMBIAR: sin estado FINALIZADO (CHECK solo INVITADO|ACTIVO|SUSPENDIDO; `hasta` podría cubrirlo); sin tabla/columna de invitación (expiración 72 h, usada); sin CHECK vigente_hasta >= vigente_desde (TR-RN-008); sin motivo ni revocado_por; sin RLS ni tenant_id en asignacion; sin garantía de "al menos un propietario"; `es_propietario` existe sin lógica.
- `supabase/migrations/20261102000000_seg_supabase_auth.sql`: CONSERVAR `trg_auth_usuario_creado` (auth.users -> seg.usuario, ON CONFLICT DO NOTHING; nombre de `raw_user_meta_data.nombre`; `tipo` solo de `raw_app_meta_data.tipo_usuario`, por defecto EXTERNO) y `trg_auth_usuario_correo`. Implicación: invitar debe fijar `app_metadata.tipo_usuario = INTERNO` desde el backend (PL-06); un usuario ya existente conserva su tipo. El hook y `tenant_para_token` ya excluyen membresías no ACTIVO o con `hasta` vencida (pruebas 4.3/4.4 en `supabase/tests/99_pruebas_auth.sql`): suspender cambia el tenant del próximo token pero no cierra sesiones vigentes.
- `libs/plataforma/seguridad/src/application/ports/permisos.port.ts`: CONSERVAR `CachePermisos.invalidarTenant`; `infrastructure/cache-permisos.redis.ts` (SET índice por tenant) y `cache-permisos.memoria.ts` sirven al handler. TTL 60 s en `resolver-permisos.use-case.ts`. Falta invalidación por usuario (hoy solo por tenant).
- `domain/errores.ts`: solo TokenInvalidoError y AccesoDenegadoError (códigos fijos); faltan errores de membresía (invitación vencida, correo distinto, último propietario, alcance superior, límite de plan).
- `domain/principal.ts`, `interface/decoradores.ts` (`@Publico`, `@Permiso`, `@UsuarioActual`), `interface/permiso.guard.ts`, `seguridad.module.ts` (cableado useFactory; no registra casos de uso de membresía), `index.ts` (no exporta nada de membresías).
- `libs/shared/auth` (Angular): `sesion.service.ts` con `signOut({scope:'local'})` y `si-permiso.directive.ts`. No hay pantalla "aceptar invitación" (planeada en `shared/auth-ui`). El README dice Angular 22; vigente 21.
- `test/seguridad.integracion.spec.ts`: prueba 17 valida revocación tras `invalidarTenant` con un controlador de prueba, no con lógica real de membresías.

NO existe en `codigo/` (hay que crear): puerto y adaptador `proveedor-identidad` / `supabase-admin.proveedor.ts` (inviteUserByEmail, cierre de sesiones); `domain/membresia.ts`, `asignacion.ts`, `eventos/*`; los 4 casos de uso; `membresia.repositorio` y persistencia TypeORM; `invalidar-cache-permisos.handler.ts`; controladores y DTO; outbox (`01e_sync_outbox.sql`); plantillas `supabase/templates`; scripts de rollback; kernel (UnidadDeTrabajo, Resultado).

## 8. Diagramas

- **PL-06** (invitación): AD -> API `invitar(correo, rol, alcance sucursal)` con `@Permiso plat.usuario.invitar` -> `inviteUserByEmail(correo, app_metadata.tipo_usuario=INTERNO)` -> INSERT auth.users -> trigger -> seg.usuario -> API crea membresía INVITADO + asignación con vigencia + evento `seg.membresia.invitada` -> correo de Supabase -> invitado abre enlace, define clave u OAuth -> `POST /v1/seg/invitaciones/aceptar` -> membresía ACTIVO + `usuario.tenant_preferido` -> `refreshSession()` -> token con tenant_id. Nota: si el correo ya existe en Supabase, no se crea otra cuenta, solo la membresía.
- **PL-05** (solicitud autorizada): `@Permiso` y `X-Sucursal-Id`; muestra `POST /v1/seg/usuarios/invitar`.
- **PL-03/PL-04**: contexto de autenticación y token con tenant activo.
- **PL-07**: migración SazónPOS; crea membresía ACTIVO por script. No aplica a este spec, comparte el puerto Admin API (spec 19).
- **PL-10**: orden kernel -> ORG -> SEG; TR-NOT (correo) es R2.
- El flujo de revocación (RF-014) no tiene diagrama PL.

## 9. Ambigüedades y preguntas candidatas para Fase 2

Ambigüedades:
1. SRS habla de "IdP OIDC" y "enlace de un solo uso 72 h"; el plan usa Supabase Auth, cuyo enlace de invitación gestiona Supabase (vigencia configurable, a verificar en docs). No hay tabla propia de invitaciones.
2. RF-010 fija permiso `publico.invitacion.aceptar` (público), pero PL-06 hace el POST de aceptación ya autenticado (con sub).
3. RF-014 incluye FINALIZAR y "cerrar sesiones en el IdP"; el CHECK de membresía no admite FINALIZADO y no hay código de cierre de sesiones. ADR-32 dice que la revocación surte efecto en segundos por caché (60 s), pero un JWT vigente sigue válido hasta expirar para lo que no pase por permisos.
4. RF-009 cita TR-NOT (R2); el plan envía con la plantilla de Supabase.
5. Límite de usuarios: qué se cuenta (ACTIVO+INVITADO) y por producto o tenant; `limite_usuarios` está en `org.suscripcion` por producto.
6. TR-RN-011 fue pedida para este spec pero pertenece a soporte (RF-019/020).
7. ASIGNACION_REVOCADA (SRS) no tiene clase en estructura_backend.txt; los nombres de evento mezclan `ASIGNACION_OTORGADA` (SRS) y `asignacion-otorgada` / `seg.membresia.invitada` (plan).
8. Revocar una asignación vs suspender membresía son operaciones distintas bajo un solo permiso `plat.asignacion.revocar`.

Preguntas candidatas (con recomendación):
1. ¿Invitación con `inviteUserByEmail` de Supabase o token propio de 72 h? Recomiendo Admin API (ADR-29) y guardar expiración en la membresía para validar los 72 h en backend (CA-029); verificar con ctx7 el máximo configurable del OTP de invitación.
2. ¿Dónde se valida "correo distinto" (CA-030)? Recomiendo en `aceptar-invitacion`: comparar el email verificado del JWT con el de la membresía INVITADO; endpoint autenticado (`@UsuarioActual`) y documentar la desviación frente a `publico.invitacion.aceptar`.
3. ¿Cómo se modela FINALIZAR y el motivo? Recomiendo migración reversible que agregue estado FINALIZADO (o `hasta = now()`) y columnas `motivo`/`revocado_por`; afecta hook y funciones SQL, confirmar con el usuario.
4. ¿Cómo se cierran las sesiones? Recomiendo método `cerrarSesiones(usuarioId)` en el puerto proveedor-identidad (auth.admin.signOut) + invalidar caché; como el hook ya excluye membresías no ACTIVO, el siguiente refresh queda sin tenant. Aclarar que con usuario multi-tenant (CA-027) no debe afectar otros tenants.
5. ¿Cómo se garantiza TR-RN-010? Recomiendo chequeo en el caso de uso dentro de la transacción con bloqueo (`SELECT … FOR UPDATE` sobre propietarios activos del tenant), sin trigger; cubrir caso autosuspensión (CA-040).
6. ¿Qué cuenta para el límite (TR-RN-006)? Recomiendo membresías ACTIVO + INVITADO vigentes del tenant frente a `limite_usuarios` (NULL = ilimitado); falta GWT, proponer uno.
7. ¿Qué eventos y qué handler? Recomiendo `membresia-invitada`, `asignacion-otorgada`, `asignacion-revocada` (nuevo) por outbox; `invalidar-cache-permisos` escucha otorgada/revocada y membresía suspendida; idempotente por event_id. Si el outbox (spec 15) no estuviera, escribir en `seg.evento_seguridad` en la misma transacción como puente.
8. ¿Cabe en 4 h/10 h y qué permisos son sensibles? Recomiendo dominio + casos de uso + puerto (adaptador Supabase fake en pruebas) + controladores/OpenAPI, sin UI (spec 09); decidir en el seed de permisos del spec 06 que revocar sea `sensible` (TR-RN-009).
