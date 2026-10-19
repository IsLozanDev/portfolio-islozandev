# Contexto para spec 06 · seg-autorizacion (TR-SEG, parte autorización)

Paquete de contexto (no es el spec). Fuentes: `roadmap-specs.md`, SRS xlsx, plan docx, `3_plan.json`, PL-xx, `codigo/`. Versiones vigentes: Angular 21, NestJS 12 (los docs dicen 22/12 o 19/22/11 según el caso).

## 1. Alcance y dependencias

- Roadmap: spec 06 `seg-autorizacion` cubre S-01, S-02, S-03, S-05 (RF 008, 011, 013, 015, 016): dominio, permisos efectivos, guard, aislamiento entre tenants. Depende de 03 (org-dominio-y-alta-tenant, RF 001-007) y 04 (seg-autenticacion-back: JWKS, hook de token, espejo auth.users, MFA).
- RF-012 (perfiles) NO figura en la columna "Cubre" del roadmap (el spec 09 lista RF 011, 012, 013 para la UI), pero S-01 del plan sí lo incluye (`TR-RF-008, 011, 012, 013`). Ver A1.
- Sprint 3, release R1. Horas del bloque: 6 + 5 + 3 + 2 = 16 h, por encima del tope de 10 h por spec (ver A2).
- Fuera de alcance (otros specs): RF-009/010/014 y membresías (07), RF-017 MFA (04), UI de roles/usuarios (09), bitácora/soporte RF-019/020 (11).
- Consumidores posteriores: 07, 08, 09, 12-14, 16, 20.

## 2. RF

| ID | Nombre | Permiso | Prioridad | Fase |
|---|---|---|---|---|
| TR-RF-008 | Aplicar manifiesto funcional del producto | plat.manifiesto.aplicar | Must | MVP |
| TR-RF-011 | Gestionar roles propios del tenant | plat.rol.gestionar | Must | MVP |
| TR-RF-012 | Gestionar perfiles de puesto | plat.perfil.gestionar | Should | MVP |
| TR-RF-013 | Asignar rol o perfil con alcance y vigencia | plat.asignacion.otorgar | Must | MVP |
| TR-RF-015 | Calcular permisos efectivos y menú | plat.permiso.consultar | Must | MVP |
| TR-RF-016 | Seleccionar empresa y sucursal de trabajo | plat.sesion.contexto | Must | MVP |

Todos: proceso TR-P02 (RF-008 también TR-P03). Componentes: SEG (+ORG en 013/015/016, +AUD en 011/013, +CFG/OBS/REP/EVT en 008).

**TR-RF-008** (actores: planificador, admin de plataforma; API de plataforma)
- Flujo: el pipeline envía el manifiesto con su versión; se valida esquema y códigos `producto.recurso.accion`; se calculan diferencias; se insertan/actualizan módulos, opciones, permisos y roles predefinidos y se marcan obsoletos los retirados; se registra la versión aplicada y se publica `manifiesto.aplicado`.
- Datos: producto_codigo (5 car.), version (semver), modulos[], opciones[] (codigo, ruta, icono, permisos requeridos), permisos[] (codigo, descripcion, alcance_minimo, sensible), roles_predefinidos[], parametros[], indicadores[], reportes[]. Reglas: TR-RN-007. RNF: 120, 119, 024.

**TR-RF-011** (admin del cliente; precondición: suscripción vigente al producto del rol)
- Flujo: elige producto, crea rol o copia uno predefinido; marca permisos (árbol módulo→opción→permiso); se valida que pertenezcan al producto; se guarda, se invalida la caché de permisos de los afectados y se registra auditoría.
- Datos: producto_codigo (obl.), codigo (3-50, único por tenant), nombre (3-100), permisos[], activo. Reglas: 007, 009. RNF: 101, 122, 013. Los predefinidos no son editables.

**TR-RF-012** (Should; admin del cliente; precondición: roles activos de productos contratados)
- Flujo: crea perfil (codigo, nombre), elige roles de productos contratados, guarda y recalcula permisos de quienes lo tienen.
- Datos: codigo (3-50, único por tenant), nombre (3-100), roles[] (uuid de roles activos). Reglas: 007. RNF: 101, 027.

**TR-RF-013** (admin del cliente; precondición: membresía ACTIVA o INVITADO)
- Flujo: elige miembro y rol/perfil; define alcance, entidad y vigencia; se valida TR-RN-008 y que el otorgante tenga alcance igual o mayor; si el rol tiene permisos sensibles se pide MFA al otorgante; se guarda, se registra ASIGNACION_OTORGADA y se invalida la caché.
- Datos: membresia_id; rol_id o perfil_id (exactamente uno); alcance TENANT|EMPRESA|SUCURSAL|UNIDAD; empresa_id/sucursal_id/unidad_id según alcance; vigente_desde (def. hoy); vigente_hasta (>= desde, opcional). Salida: efecto en permisos efectivos en <= 5 s. Reglas: 007, 008, 009. RNF: 101, 009, 013.

**TR-RF-015** (actor: módulo de producto consumidor; precondición: token válido + contexto tenant/sucursal)
- Flujo: el guard pide permisos efectivos; busca en caché Redis y si falta ejecuta `seg.permisos_efectivos` y `seg.menu_usuario`; guarda con la versión de seguridad del tenant; autoriza o deniega y registra ACCESO_DENEGADO.
- Datos: usuario_id, tenant_id, sucursal_id, unidad_id (opcional); respuesta permisos[] y menu[] (ruta, icono). Salida 200, o 403 con código de permiso faltante. Reglas: 006, 007. RNF: 101, 010, 001.

**TR-RF-016** (actor: usuario operativo; app APP-05, shell)
- Flujo: el shell obtiene sucursales con `seg.sucursales_accesibles`; si hay una la selecciona sola; si hay varias muestra el selector con la última preseleccionada; al confirmar fija el contexto en el token de aplicación y carga el menú.
- Datos: tenant_id, empresa_id, sucursal_id, ultima_seleccion (por usuario). Reglas: 007. RNF: 101, 018, 020. El selector es frontend (spec 08); en 06 solo el contexto back (S-03).

## 3. Criterios GWT (tal cual)

**TR-RF-008**
- TR-CA-022 · Aplicación de nueva versión (Positivo). DADO QUE REST tiene registrado el manifiesto 1.4.0 · CUANDO el pipeline aplica el manifiesto 1.5.0 con el permiso nuevo rest.propina.configurar · ENTONCES el permiso queda registrado y la versión aplicada es 1.5.0
- TR-CA-023 · Aplicación idempotente (Borde). DADO QUE el manifiesto 1.5.0 ya fue aplicado · CUANDO se aplica nuevamente el mismo manifiesto · ENTONCES el sistema reporta 0 cambios
- TR-CA-024 · Código de permiso mal formado (Negativo). DADO QUE el manifiesto contiene el permiso «rest-caja-cerrar» · CUANDO el pipeline lo aplica · ENTONCES el sistema rechaza el manifiesto completo indicando el permiso inválido y el despliegue se detiene

**TR-RF-011**
- TR-CA-031 · Copia de rol predefinido (Positivo). DADO QUE existe el rol predefinido «REST_MOZO» · CUANDO copia el rol como «Mozo terraza» y quita el permiso rest.pedido.anular · ENTONCES el rol «Mozo terraza» queda activo sin el permiso de anular
- TR-CA-032 · Edición de rol predefinido (Negativo). DADO QUE el actor abre el rol predefinido «REST_CAJERO» · CUANDO intenta quitarle un permiso · ENTONCES el sistema indica «Los roles predefinidos no se editan; cree una copia»
- TR-CA-033 · Inactivar rol en uso (Borde). DADO QUE el rol «Mozo terraza» está asignado a 4 usuarios · CUANDO lo inactiva · ENTONCES el sistema pide confirmación indicando los 4 usuarios afectados y, al confirmar, sus permisos dejan de estar vigentes

**TR-RF-012**
- TR-CA-034 · Perfil multiproducto (Positivo). DADO QUE el tenant tiene LIB y ECO contratados · CUANDO crea el perfil «Encargado de tienda» con los roles LIB_VENDEDOR y ECO_GESTOR_PEDIDOS · ENTONCES el perfil queda disponible y al asignarlo otorga permisos de ambos productos
- TR-CA-035 · Rol de producto no contratado (Negativo). DADO QUE el tenant no tiene CLI contratado · CUANDO intenta agregar el rol CLI_RECEPCION al perfil · ENTONCES el sistema no muestra ni acepta roles de productos no contratados

**TR-RF-013**
- TR-CA-036 · Asignación temporal por reemplazo (Positivo). DADO QUE Luis Paredes es miembro ACTIVO del tenant · CUANDO le asignan el rol «Cajero» en la unidad «CAJA-02» del 15/10/2026 al 31/10/2026 · ENTONCES Luis tiene permisos de caja solo en «CAJA-02» y solo en ese rango de fechas
- TR-CA-037 · Rol y perfil a la vez (Negativo). DADO QUE el actor selecciona un rol y un perfil · CUANDO intenta guardar la asignación · ENTONCES el sistema rechaza con «Seleccione un rol o un perfil, no ambos»
- TR-CA-038 · Vigencia hasta anterior a desde (Borde). DADO QUE el actor define vigente_desde 20/10/2026 · CUANDO ingresa vigente_hasta 19/10/2026 · ENTONCES el sistema rechaza con «La vigencia hasta no puede ser anterior a la vigencia desde»

**TR-RF-015**
- TR-CA-041 · Alcance de empresa cubre sucursal (Positivo). DADO QUE María tiene el rol «Supervisor» con alcance EMPRESA en «Sabores del Sur SAC» · CUANDO el producto consulta sus permisos para la sucursal «Cayma» de esa empresa · ENTONCES la respuesta incluye los permisos del rol «Supervisor»
- TR-CA-042 · Suscripción vencida (Negativo). DADO QUE la suscripción GYM del tenant está VENCIDA · CUANDO se consultan los permisos de un usuario con rol GYM_RECEPCION · ENTONCES la respuesta no incluye permisos gym.* y el intento de acceso se registra como ACCESO_DENEGADO
- TR-CA-043 · Asignación que vence hoy (Borde). DADO QUE la asignación de Luis tiene vigente_hasta igual a la fecha actual · CUANDO se consultan sus permisos durante ese día · ENTONCES la respuesta incluye los permisos de la asignación

**TR-RF-016**
- TR-CA-044 · Usuario con una sola sucursal (Positivo). DADO QUE Rosa solo tiene acceso a la sucursal «Miraflores» · CUANDO inicia sesión · ENTONCES ingresa directamente a «Miraflores» sin ver el selector
- TR-CA-045 · Cambio de sucursal en sesión (Positivo). DADO QUE Carmen tiene acceso a «Miraflores» y «Surco» · CUANDO cambia a «Surco» desde el encabezado · ENTONCES el menú y los datos se recargan con el contexto de «Surco» sin pedir nueva autenticación
- TR-CA-046 · Sin sucursales accesibles (Negativo). DADO QUE todas las asignaciones de Jorge vencieron · CUANDO inicia sesión · ENTONCES el shell muestra «No tiene accesos vigentes; contacte a su administrador»

Total: 17 GWT (3+3+2+3+3+3). Los GWT 044-046 son de shell (UI): su verificación completa depende del spec 08; en 06 solo se prueba el contrato back. No existe GWT propio para RNF-010 / S-05 (aislamiento); se verifica por RNF.

## 4. Reglas y RNF aplicables

Reglas (hoja "Reglas de negocio"):
- TR-RN-006: producto sin suscripción vigente (ACTIVA o PRUEBA) no otorga permisos; no se crean sucursales/usuarios sobre los límites del plan (la parte de límites es de ORG/membresías, no de 06).
- TR-RN-007: permiso `producto.recurso.accion`; cobertura por alcance (TENANT todo; EMPRESA sus sucursales y unidades; SUCURSAL sus unidades; UNIDAD solo esa). Los permisos PLAT no dependen de suscripción.
- TR-RN-008: asignación con un rol o un perfil (nunca ambos ni ninguno); alcance coherente con empresa/sucursal/unidad; vigente_hasta >= vigente_desde. En SQL: `ck_asig_rol_o_perfil`, `ck_asig_alcance` (falta CHECK de fechas, ver sección 7).
- TR-RN-009: permisos sensibles exigen MFA con antigüedad máxima de 15 min y quedan auditados.

RNF (hoja "RNF"):
- TR-RNF-010 (Must): aislamiento por tenant con doble barrera (contexto de aplicación + RLS); 0 accesos cruzados en pruebas automatizadas.
- TR-RNF-101 (Must, MOD-02): permisos efectivos y menú con caché Redis, invalidación tras cambio de rol/asignación/suscripción; p95 < 20 ms con caché; invalidación efectiva <= 5 s; verificación k6 + prueba de integración de invalidación.
- TR-RNF-119 (Must): API pública por puertos; ningún producto accede a tablas de un esquema transversal; 0 violaciones de límites (lint Nx).
- TR-RNF-120 (Must, MOD-02): manifiesto versionado con aplicación idempotente (0 cambios al repetir), < 30 s.
- Citados por los RF (texto no leído, solo referencia): TR-RNF-001 (015), 009 (013), 013 (011, 013), 018 y 020 (016), 024 (008), 027 (012), 122 (011).

## 5. Historias del backlog (3_plan.json, sprint 3, R1)

| ID | h | Tipo | Descripción |
|---|---|---|---|
| S-01 | 6 | Back | Dominio seg: permiso, rol, perfil, asignación con alcance y vigencia; manifiesto de producto. RF: 008, 011, 012, 013 |
| S-02 | 5 | Back | Permisos efectivos y menú con caché Redis e invalidación por versión. RF: 015 |
| S-03 | 3 | Back | Guard @Permiso y contexto de empresa/sucursal (X-Sucursal-Id). RF: 016 |
| S-05 | 2 | QA | Pruebas de aislamiento entre tenants (RLS y API). RF: "TR-RNF" (genérico) |

S-04 (membresías) queda en spec 07. El plan registra S-01 con RF-012; el roadmap lo omite.

## 6. Tablas SQL, eventos, puertos y permisos

Tablas (`db/01b_seg.sql`, esquema `seg`): `producto`, `modulo`, `opcion` (padre_id, ruta, icono), `permiso` (codigo PK, alcance_minimo, sensible), `opcion_permiso`, `rol` (tenant_id NULL = predefinido, editable, activo), `rol_permiso`, `perfil`, `perfil_rol`, `usuario`, `membresia`, `asignacion` (rol_id/perfil_id, alcance, empresa/sucursal/unidad, vigente_desde/hasta, otorgado_por), `evento_seguridad`. Funciones: `seg.permisos_efectivos(usuario, tenant, sucursal, unidad)`, `seg.menu_usuario(usuario, tenant, sucursal)`, `seg.sucursales_accesibles(usuario, tenant)`. De `01a_org.sql`: `org.tenant`, `org.empresa`, `org.sucursal`, `org.unidad_operativa`, `org.suscripcion` (con RLS por `app.tenant_id`).

No existe en el esquema: tabla de versión de manifiesto aplicada, columna de obsolescencia (permiso/opción/rol), "versión de seguridad" por tenant, ni tabla de última selección de sucursal por usuario.

Eventos (nombres tal como aparecen en las fuentes):
- `manifiesto.aplicado` (RF-008).
- `ASIGNACION_OTORGADA` y `ACCESO_DENEGADO` (tipos de `seg.evento_seguridad`; el comentario del SQL también lista LOGIN, ASIGNACION_REVOCADA, ACCESO_SOPORTE, fuera de 06).
- Estructura (plan): `membresia-invitada`, `asignacion-otorgada`, `rol-permisos-cambiados`; el código/PL-05 hablan de `seg.asignacion.*` / `seg.rol.permisos_cambiados`. Los nombres no coinciden (A5). Eventos por outbox en la misma transacción (constitución, regla 4); el relay es el spec 15.

Puertos: existentes `permisos.port.ts` (`PermisosRepositorio`, `CachePermisos`) y `verificador-token.port.ts` (de 04). Previstos en la estructura y no existentes: repositorios de rol/perfil/asignación/membresía, caché con versión.

Permisos: `plat.manifiesto.aplicar`, `plat.rol.gestionar`, `plat.perfil.gestionar`, `plat.asignacion.otorgar` (sensible según RN-009, "otorgar roles"), `plat.permiso.consultar`, `plat.sesion.contexto`. Inconsistencias: el docx muestra `plat.rol.asignar` y el código/test usan `plat.rol.editar`; el SRS llama al guard `@RequierePermiso` y el código y la constitución usan `@Permiso` (A6).

## 7. Código base (`docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/`)

**En el ejemplo NO existe código de los agregados `rol`, `perfil`, `asignacion`, `membresia` ni `manifiesto-producto`.** Solo figuran en `2_Estructura/estructura_backend.txt` (`domain/rol.ts`, `perfil.ts`, `asignacion.ts`, `membresia.ts`, `manifiesto-producto.ts`, `eventos/`). Tampoco existen `aplicar-manifiesto.use-case.ts`, `obtener-mi-contexto.use-case.ts`, `cambiar-tenant.use-case.ts`, `handlers/invalidar-cache-permisos.handler.ts`, `interface/http/*` (controladores y DTO), `infrastructure/persistence` (TypeORM) ni la librería Angular de seguridad. `libs/shared/auth` (sesion.service, guards, si-permiso.directive) es cliente: pertenece a 05/08.

Base en `codigo/libs/plataforma/seguridad/src/`:

| Archivo | Conservar | Cambiar / falta |
|---|---|---|
| `application/resolver-permisos.use-case.ts` | Clave `perm:{tenant}:{usuario}:{sucursal}`; chequeo `sucursalesAccesibles` antes de resolver; TTL 60 s | No recibe `unidadId` (RF-015 lo pide) ni lo pone en la clave; no devuelve menú; no usa "versión de seguridad" del tenant; con TTL 60 s y sin invalidación activa no cumple RNF-101 (<= 5 s) |
| `application/ports/permisos.port.ts` | `PermisosRepositorio`, `CachePermisos`, tokens DI | Añadir `menuUsuario`, unidad, versión de seguridad; puertos de rol/perfil/asignación/manifiesto |
| `interface/permiso.guard.ts` | Orden de chequeos (SIN_TENANT, SIN_SUCURSAL con regex UUID, MFA, SUCURSAL_NO_ASIGNADA, SIN_PERMISO) y `req.contexto` | `registrar` (ACCESO_DENEGADO) es hook opcional y `SeguridadModule` no se lo pasa: hoy la denegación NO se persiste; el cuerpo del 403 trae `codigo` y `mensaje` (el permiso faltante solo va en el mensaje); MFA solo mira `aal2`, no la antigüedad de 15 min (RN-009) |
| `interface/decoradores.ts` | `@Publico`, `@Permiso(codigo, {mfa})`, `@UsuarioActual` | El comentario cita `plat.rol.editar` (no está en el SRS); no valida el formato `producto.recurso.accion` |
| `infrastructure/cache-permisos.memoria.ts` | Caché de pruebas | Solo invalida por tenant; sin versión |
| `infrastructure/cache-permisos.redis.ts` | SET índice `perm-idx:{tenant}` (sin KEYS/SCAN) | Invalidación por versión (S-02); nada dispara hoy `invalidarTenant` desde un cambio de rol/asignación (sin handler ni evento) |
| `infrastructure/permisos.sql.repositorio.ts` | Llamadas a `seg.permisos_efectivos` y `seg.sucursales_accesibles` | No usa `seg.menu_usuario`; no pasa unidad; no hace `SET LOCAL app.tenant_id`; usa `EjecutorSql` genérico y no la UnidadDeTrabajo del kernel (spec 02) |
| `domain/errores.ts`, `domain/principal.ts` | Conservar | Añadir errores de dominio (rol predefinido no editable, rol+perfil, vigencia, alcance inválido) |
| `seguridad.module.ts`, `index.ts` | Cableado `useFactory`, API pública única | Registrar casos de uso/controladores nuevos, pasar `registrar`, exportar lo que consuman 07/08/09 |
| `test/seguridad.integracion.spec.ts` | 18 casos; los 11-17 son de autorización (sucursal, permiso, MFA, tenant, revocación con `invalidarTenant`) | Es un script con `assert`, no usa el runner del monorepo; no hay pruebas de dominio, aislamiento entre tenants ni invalidación <= 5 s |

`codigo/db/01b_seg.sql` (conservar casi todo; es base probada con `supabase/tests`):
- Ya cumple: `ck_asig_rol_o_perfil`, `ck_asig_alcance`, cobertura de alcances, filtro por suscripción PRUEBA/ACTIVA con `vigente_hasta`, PLAT sin suscripción, vigencia inclusiva con `BETWEEN` (cubre TR-CA-043), `sucursales_accesibles`.
- Falta o cambiar: (a) sin CHECK `vigente_hasta >= vigente_desde` (RN-008, TR-CA-038); (b) RLS solo en `org.*`: `seg.rol`, `perfil`, `membresia`, `asignacion` no tienen RLS y `asignacion` no tiene `tenant_id`; (c) `permisos_efectivos` lee `org.suscripcion`, que tiene RLS por `app.tenant_id`: sin `SET LOCAL app.tenant_id` en la conexión, un rol sin BYPASSRLS vería cero suscripciones y los permisos de producto saldrían vacíos (solo PLAT pasaría); a verificar; (d) para alcance UNIDAD compara solo `unidad_id = p_unidad`, sin comprobar que la unidad pertenezca a la sucursal; (e) un perfil puede contener roles de productos no contratados (TR-CA-035 es regla de aplicación, no de BD); (f) sin columna de obsolescencia ni tablas de versión de manifiesto; (g) sin script de rollback (la constitución exige migración reversible; `db/rollback/` solo existe en la estructura); (h) `permiso.alcance_minimo` se guarda pero nada lo valida al asignar.

Resumen de lo que falta construir en 06: agregados `rol`, `perfil`, `asignacion` (con TR-RN-008 y regla "otorgante con alcance >=") y `manifiesto-producto` + caso de uso `aplicar-manifiesto` (idempotente, diff, obsoletos, versión); repositorios de persistencia; eventos de dominio y outbox; casos de uso de menú y mi-contexto/sucursales; invalidación de caché por versión + handler; controladores `/v1` con OpenAPI y `@Permiso`; migración y rollback (CHECK de fechas, versión de manifiesto, versión de seguridad, RLS en seg); pruebas de dominio, k6 e integración (S-05).

## 8. Diagramas

- PL-03 (`1_Mermaid/PL-03_Autenticacion_con_Supabase_Auth_y_autorizacion_propia.mmd`, flowchart): AutenticacionGuard → PermisoGuard (tenant + X-Sucursal-Id + permiso + aal2) → ResolverPermisosUseCase ↔ Redis; el resolver llama `seg.permisos_efectivos()`; el token solo lleva tenant_id y tipo_usuario; SazónPOS usa las mismas funciones seg.
- PL-05 (`PL-05_Secuencia_solicitud_autorizada_en_la_API.mmd`, secuencia): el guard valida tenant, cabecera de sucursal y MFA si el permiso es sensible; caché `perm:tenant:usuario:sucursal` con 60 s + índice del tenant; la denegación escribe `evento_seguridad ACCESO_DENEGADO` y responde 403 `{codigo: SIN_PERMISO}`; el caso de uso hace `SET LOCAL app.tenant_id` (RLS) + transacción + outbox; el evento `seg.asignacion.*` invalida el tenant. Es la única fuente de `SET LOCAL app.tenant_id`; el código del guard no lo hace.
- PL-10 (dependencias entre componentes) respalda el orden kernel, ORG, SEG; no se analizó en detalle.

## 9. Ambigüedades y preguntas para la Fase 2

Ambigüedades:
- A1. RF-012 está en S-01 (plan) pero no en el roadmap del spec 06; existen GWT 034/035.
- A2. 16 h de historias frente al tope de 10 h por spec; S-01 (6 h) cubre 4 agregados + manifiesto, que no existen en código.
- A3. RF-016 mezcla back (S-03) y shell (APP-05, spec 08); GWT 044-046 son de UI. "Fija el contexto en el token de aplicación" choca con ADR-32 (el token solo lleva tenant; la sucursal viaja en `X-Sucursal-Id`).
- A4. RNF-101 pide invalidación <= 5 s y S-02 dice "invalidación por versión"; el código usa TTL 60 s + borrado por tenant; "versión de seguridad del tenant" no tiene dónde guardarse.
- A5. Nombres de eventos inconsistentes (`manifiesto.aplicado`, `asignacion-otorgada`, `ASIGNACION_OTORGADA`, `seg.asignacion.*`, `rol-permisos-cambiados`).
- A6. Nombres de permiso y decorador inconsistentes (SRS `plat.asignacion.otorgar`, docx `plat.rol.asignar`, código `plat.rol.editar`; `@RequierePermiso` vs `@Permiso`).
- A7. "Auditoría" (RF-011/013, TR-AUD) llega en el spec 16; en 06 solo existe `seg.evento_seguridad`.
- A8. MFA "antigüedad 15 min" (RN-009) vs `aal2` de sesión sin marca de tiempo en `Principal`.
- A9. RF-008 incluye parámetros, indicadores y reportes en el manifiesto, cuyos destinos (CFG spec 12, REP en R3) llegan después.
- A10. La función SQL depende de RLS sobre `org.suscripcion`; el repositorio de ejemplo no fija `app.tenant_id`.

Preguntas candidatas (recomendación entre paréntesis):
1. ¿Entra RF-012 (perfiles) con GWT 034/035? (Sí, solo dominio y puerto; la UI queda en 09. Es parte de S-01 y `permisos_efectivos` ya usa perfiles.)
2. ¿Cómo encajar 16 h en un spec de 10 h? (Un spec, recortando el manifiesto a permisos/opciones/roles predefinidos/versión; parámetros, indicadores y reportes se validan por esquema y se aplican en 12/REP. Si no cabe, partir en 06a dominio+manifiesto y 06b permisos+guard+aislamiento.)
3. ¿Invalidación de caché por versión en BD o por borrado del índice Redis? (Versión de seguridad por tenant incluida en la clave y leída por solicitud, más TTL 60 s: cumple <= 5 s sin depender del relay del spec 15; el handler por evento queda para cuando exista.)
4. ¿Qué se hace con auditoría y eventos mientras no existan TR-AUD ni el relay? (Escribir en `seg.evento_seguridad` + outbox en la misma transacción; fijar un solo juego de nombres de evento, el de la estructura, y dejar los del SRS como alias.)
5. ¿Se exige la antigüedad de 15 min de RN-009 en 06? (No: usar `aal2` de 04, documentar la brecha y añadir marca de tiempo al `Principal` solo si 04 ya la expone.)
6. Aislamiento (S-05): ¿RLS en tablas `seg` y cómo llega `app.tenant_id` a `permisos_efectivos`? (RLS en `rol`, `perfil`, `membresia`, `asignacion` (añadiendo `tenant_id`); toda lectura dentro de la UnidadDeTrabajo del kernel con `SET LOCAL app.tenant_id`; pruebas con dos tenants en SQL y por API.)
7. ¿Contrato de mi-contexto? (Un endpoint `GET /v1/seg/mi-contexto` con permisos + menú + sucursales usando `X-Sucursal-Id` y unidad opcional por query; la unidad entra a la clave de caché solo si viene.)
8. ¿Qué fuente manda para nombres de permiso y decorador? (SRS para permisos: `plat.asignacion.otorgar`, `plat.rol.gestionar`; `@Permiso` como en la constitución; corregir el comentario `plat.rol.editar`.)
9. ¿Entran la validación "otorgante con alcance igual o mayor" y `alcance_minimo` del permiso? (Sí en el dominio de `asignacion`, con pruebas; son parte de RF-013 aunque sin GWT propio. Si se agregan GWT extra, marcarlos como no-SRS.)
