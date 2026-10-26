# Contexto para el spec 16a · usuarios-asignaciones

Paquete de contexto (no es el spec). Fuentes: `docs/roadmap-specs.md`, `specs/06-seg-autorizacion.md`, `specs/08-seg-membresias.md`, `specs/13-auth-cliente-angular.md`, `specs/14-auth-ui-minima.md`, `specs/15-shell-y-ui.md` (aprobado, en implementación), `docs/spec-context/08-seg-membresias.md`, `15-shell-y-ui.md` y `17a-org-http.md`, SRS xlsx (hojas Aplicaciones, Reglas de negocio, RF, Criterios GWT, RNF, Matriz RF-RNF), `3_plan.json`, `2_Estructura/estructura_frontend.txt`, `1_Mermaid/PL-xx`, código del repo (`libs/plataforma/seguridad`, `apps/plataforma-admin`, manifiesto PLAT). Ruta base del plan: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 1. Alcance y límites con otros specs

- Roadmap: spec 16a `usuarios-asignaciones`, cubre **U-03** (RF 009, 013, 014) y su back: listar y detalle de miembros, `POST /asignaciones`. Agrega a `confirmarDestructiva` del 15 la opción `longitudMinimaMotivo`. 10 h; depende de **08**, **15** y **17a**. Ola 6: después del 17a, en paralelo con el 17b (solo comparten `plat.manifiesto.json`); el 16b y el 17c van después y trabajan sobre la lib que crea este spec.
- Plan: U-03 (sprint 4, 6 h, Front, R1) "Usuarios: invitar, asignar rol por sucursal, revocar", RF 009, 013, 014. Las 6 h son solo front y suponen la API hecha. No lo está (sección 7). El spec 06 dejó explícito: "Controladores de administración `/v1/seg/roles`, `/perfiles` y `/asignaciones` (spec 16)". El spec 08 dejó fuera "Listado de miembros e invitaciones del tenant (`GET`)" y "UI de usuarios (spec 16)". El 16a hereda la parte de usuarios y asignaciones de esa deuda; roles y perfiles son del 16b.
- Aplicación SRS: **APP-02** "Administración del cliente (embebible)": librería Nx `plataforma-admin-cliente` con rutas lazy que cada `<cod>-backoffice` monta.
- **Límite con el 08** (seg-membresias, implementado): el 08 es dueño de invitar, aceptar, suspender, reactivar, finalizar y revocar en backend. El 16a consume sus rutas sin cambiarlas.
- **Límite con el 06** (seg-autorizacion, implementado): `OtorgarAsignacion` existe y está probado sin controlador. El 16a lo expone por HTTP; no toca dominio ni SQL salvo lecturas nuevas.
- **Límite con el 13** (shared/auth): `SesionService`, `permisoGuard`, `*siPermiso`, interceptor con step-up (`MFA_REQUERIDA` → `/auth/mfa?returnUrl`, sin reintento). Se usan tal cual.
- **Límite con el 14** (auth-ui): **la pantalla «aceptar invitación» (RF-010) es del 14**, no del 16a. Ver sección 2.
- **Límite con el 15** (shared/ui, shared/shell): usa `vit-tabla` (paginación y orden del lado del servidor), `vit-filtros`, `vit-acciones-formulario`, `mensajeValidacion`, `vit-cargando`, `vit-estado-vacio`, `AvisosService.confirmarDestructiva`, `erroresHttpInterceptor` y `OMITIR_AVISO_ERROR`. Pantallas hijas de `rutasDelShell`. El 15 dice: "`vit-tabla` ... el spec 16 la conecta a la API". **Única modificación al 15**: la opción `longitudMinimaMotivo` de `confirmarDestructiva` (decisión D1); el resto se consume sin cambios.
- **Límite con el 17a** (org-http): el 17a crea las lecturas de empresas, sucursales y unidades (`listar` en repositorios y `GET /v1/org/...`). El 16a las consume para el selector de alcance; no crea controladores `org`.
- **Límite con el 16b** (roles-perfiles): el 16b expone los controladores de gestión de roles y perfiles y su UI (`roles/`, `perfiles/` en `admin-cliente`). El 16a solo lee roles y perfiles asignables para el selector de invitar y asignar. El catálogo de permisos en árbol es del 16b, que es quien lo consume.
- **Límite con el 17c** (admin-org-cliente): el 17c agrega `organizacion/` a la lib que crea el 16a y una entrada en las rutas.
- Fuera de alcance: aceptar invitación (14), roles y perfiles (16b), empresas/sucursales/unidades en UI (17c) y en back (17a), consola de plataforma (17b), bitácora y soporte (18, `admin-cliente/bitacora/`), parámetros y series en UI, auditoría TR-AUD (20), cierre explícito de sesiones en Supabase (08 lo dejó fuera), e2e multinavegador y axe en CI (27).

## 2. Requisitos funcionales

| ID | Nombre | Permiso | Prioridad | Fase | Historia | Back |
|---|---|---|---|---|---|---|
| TR-RF-009 | Invitar usuario al tenant | `plat.usuario.invitar` | Must | MVP | U-03 | 08, ruta existe |
| TR-RF-013 | Asignar rol o perfil con alcance y vigencia | `plat.asignacion.otorgar` (sensible) | Must | MVP | U-03 | 06, **sin ruta** |
| TR-RF-014 | Revocar acceso y suspender membresía | `plat.asignacion.revocar` (sensible) | Must | MVP | U-03 | 08, rutas existen |

Todos MOD-02 TR-SEG, APP-02, proceso TR-P02, actor "Administrador del cliente".

**TR-RF-009** (detalle en `spec-context/08`). Datos: correo, nombre (3-150), perfil_id o rol_id (uno), alcance TENANT|EMPRESA|SUCURSAL|UNIDAD, empresa/sucursal/unidad_id según alcance, vigente_hasta opcional. Precond.: alcance suficiente del actor; plan sin llegar al límite. Reglas TR-RN-006, 008. RNF 009, 013. En UI: formulario de invitación y manejo de `usuario_nuevo`, `correo_enviado: false`, `LIMITE_USUARIOS`, `ALCANCE_SUPERIOR`, `MEMBRESIA_EXISTENTE`, `MFA_REQUERIDA`.

**TR-RF-010** (aceptar invitación, SRS lo ubica en **APP-05**, no APP-02). **No entra.** Ya la cubre el spec 14 (`libs/shared/auth-ui/pages/invitacion`, `InvitacionCliente`, mensajes de TR-CA-029 y 030, `refrescarSesion()`), con el contrato `GET /v1/seg/invitaciones/{token}` y `POST /v1/seg/invitaciones/aceptar` del 08; el roadmap lo dice ("invitación (pantalla del spec 08)") y el 14 la decidió ("Sí: la invitación entra"). `SEG_URL_INVITACION` apunta a `/auth/invitacion`. Única pieza que el 14 dejó al 15: "ve el menú del perfil «Cajero»" (TR-CA-028), que el shell resuelve con `mi-contexto`. No suma horas.

**TR-RF-013** (asignar). Otorgar a un miembro rol o perfil con alcance y vigencia, validando coherencia y que el otorgante tenga alcance igual o mayor. Precond.: membresía ACTIVA o INVITADO. Flujo: 1 selecciona miembro y rol o perfil; 2 alcance, entidad y vigencia; 3 valida TR-RN-008 y alcance del otorgante; 4 si el rol tiene permisos sensibles pide MFA al otorgante; 5 guarda, `ASIGNACION_OTORGADA`, invalida caché. Datos: membresia_id; rol_id o perfil_id (exactamente uno); alcance; empresa_id, sucursal_id, unidad_id según alcance; vigente_desde (por defecto hoy); vigente_hasta (≥ desde, opcional). Reglas 007, 008, 009. RNF 101, 009, 013. Salida: efecto en permisos efectivos en ≤ 5 s.

**TR-RF-014** (detalle en `spec-context/08`). Datos: membresia_id o asignacion_id; accion REVOCAR|SUSPENDER|FINALIZAR; motivo (SRS 5-300, obligatorio; implementado 4-300, ver D1). Flujo: selecciona asignación o membresía y acción; confirmación y motivo; valida TR-RN-010; revoca o suspende. Back del 08 suma REACTIVAR. RNF 021, 014, 013.

## 3. Criterios GWT (tal cual; todos "Pendiente" en el SRS)

**TR-RF-009**
- **TR-CA-025** · Invitación a cajera de sucursal · Positivo. DADO QUE el administrador tiene alcance TENANT y el plan permite 10 usuarios con 6 activos · CUANDO invita a rosa.huaman@gmail.com con el perfil «Cajero» en la sucursal «Miraflores» · ENTONCES se crea la membresía en estado INVITADO y se envía el correo de invitación
- **TR-CA-026** · Alcance superior al propio · Negativo. DADO QUE el actor tiene alcance SUCURSAL en «Miraflores» · CUANDO intenta invitar a un usuario con alcance TENANT · ENTONCES el sistema rechaza con «No puede otorgar un alcance mayor al suyo»
- **TR-CA-027** · Usuario ya miembro de otro tenant · Borde. DADO QUE carlos.rojas@outlook.com es usuario activo del tenant «gym-norte» · CUANDO lo invitan al tenant «gym-sur» · ENTONCES se crea una segunda membresía sin duplicar el usuario

**TR-RF-013**
- **TR-CA-036** · Asignación temporal por reemplazo · Positivo. DADO QUE Luis Paredes es miembro ACTIVO del tenant · CUANDO le asignan el rol «Cajero» en la unidad «CAJA-02» del 15/10/2026 al 31/10/2026 · ENTONCES Luis tiene permisos de caja solo en «CAJA-02» y solo en ese rango de fechas
- **TR-CA-037** · Rol y perfil a la vez · Negativo. DADO QUE el actor selecciona un rol y un perfil · CUANDO intenta guardar la asignación · ENTONCES el sistema rechaza con «Seleccione un rol o un perfil, no ambos»
- **TR-CA-038** · Vigencia hasta anterior a desde · Borde. DADO QUE el actor define vigente_desde 20/10/2026 · CUANDO ingresa vigente_hasta 19/10/2026 · ENTONCES el sistema rechaza con «La vigencia hasta no puede ser anterior a la vigencia desde»

**TR-RF-014**
- **TR-CA-039** · Salida de colaborador · Positivo. DADO QUE Pedro Salazar tiene membresía ACTIVA y una sesión abierta · CUANDO el administrador finaliza su membresía con motivo «Cese» · ENTONCES la sesión de Pedro se invalida y no puede volver a ingresar al tenant
- **TR-CA-040** · Último propietario · Negativo. DADO QUE Ana Torres es la única propietaria del tenant · CUANDO intenta suspender su propia membresía · ENTONCES el sistema rechaza con «El tenant debe tener al menos un propietario activo»

Total: 10 GWT (3 + 3 + 2). La parte de dominio ya está cerrada en 06 (036-038) y 08 (025-027, 039, 040). En el 16a se cierran por HTTP (`POST /asignaciones`) y por UI (mensaje visible, campo bloqueado, confirmación). TR-CA-028 a 030 son del 14; 031 a 035 son del 16b.

Notas sobre los GWT en UI:
- 036: la unidad «CAJA-02» sale de `GET /v1/org/unidades` del 17a.
- 037: la UI hace rol y perfil excluyentes (no se puede seleccionar ambos); la prueba de la API cubre el rechazo.
- 039: el motivo «Cese» tiene 4 caracteres. Se ejecuta desde la UI con `longitudMinimaMotivo: 4` (D1). La UI no puede prometer "sesión invalidada" al instante (RNF-014).

### GWT faltantes a proponer

| Propuesto | RF | Caso |
|---|---|---|
| Lista de miembros | 009/014 | Lista paginada en servidor con estado (INVITADO, ACTIVO, SUSPENDIDO, FINALIZADO), filtros por estado y búsqueda por nombre o correo; solo miembros que el actor cubre por alcance |
| Límite de plan alcanzado | 009 | Plan de 10 con 10 usados: la UI muestra «El plan de <producto> permite <n> usuarios» y no crea nada (TR-RN-006; el SRS no tiene GWT) |
| Correo no enviado | 009 | Usuario existente, falla el magic link: la invitación queda y la UI avisa «Invitación creada; el correo no se envió. Reenvíe invitando otra vez» (`correo_enviado: false`) |
| Reinvitar | 009 | Miembro INVITADO o FINALIZADO: «Reenviar invitación» anula el token anterior |
| Miembro ya activo | 009 | Correo con membresía ACTIVO o SUSPENDIDO: «El usuario ya es miembro» (`MEMBRESIA_EXISTENTE`) |
| Suspender y reactivar | 014 | Suspender con motivo pasa a SUSPENDIDO; reactivar vuelve a ACTIVO y recupera permisos (no hay GWT) |
| Revocar una asignación | 014 | Revocar «Cajero» en «Miraflores» deja intactas sus otras asignaciones |
| Motivo de 4 caracteres | 014 | Finalizar con «Cese» se acepta; con «Ces» el diálogo no habilita confirmar (D1) |
| Default del 15 intacto | 014 | `confirmarDestructiva` sin `longitudMinimaMotivo` sigue exigiendo 10 (las pruebas del 15 pasan sin cambios) |
| Step-up en acción sensible | 013/014 | MFA de hace 40 min: otorgar o revocar lleva a `/auth/mfa`, y al volver el formulario o la acción no se pierde (o se avisa antes de enviar) |
| Acciones sin permiso | todos | Actor sin `plat.asignacion.revocar` no ve suspender/finalizar/revocar (`*siPermiso`); la ruta sin permiso va a 403 |
| Responsivo | todos | Usuarios y asignación usables a 360, 768 y 1280 px (TR-RNF-018) |

## 4. Reglas TR-RN y RNF

- **TR-RN-006**: sin suscripción vigente no hay permisos; no se crean usuarios por encima del plan. UI: mostrar `LIMITE_USUARIOS`; el selector de rol o perfil solo ofrece productos contratados.
- **TR-RN-007**: `producto.recurso.accion` por alcance (TENANT > EMPRESA > SUCURSAL > UNIDAD). UI: el selector de alcance solo ofrece lo que el actor cubre (el back decide igual).
- **TR-RN-008**: rol o perfil, nunca ambos ni ninguno; alcance coherente; hasta ≥ desde. UI: validación local con los mensajes del SRS (037, 038).
- **TR-RN-009**: sensibles exigen MFA ≤ 15 min ("otorgar roles" está en el texto de la regla). `plat.asignacion.otorgar` y `plat.asignacion.revocar` son `sensible: true` en el manifiesto; invitar es sensible solo si el rol invitado trae un permiso sensible.
- **TR-RN-010**: al menos un propietario activo (040). Solo back; la UI muestra el mensaje.
- RNF que aplican:
  - **TR-RNF-021**: confirmación explícita y motivo obligatorio en suspender, finalizar y revocar. Back exige `confirmar: true` y motivo.
  - **TR-RNF-018**: responsiva ≥ 360 px, español de Perú.
  - **TR-RNF-122** (propio de APP-02, Should): la administración embebible adopta los tokens de diseño del producto anfitrión y cumple WCAG 2.1 AA (axe sin errores críticos), cambio de tema sin recompilar. Implica: sin colores fijos, solo tokens de `shared/ui`; las rutas deben poder montarse en otro backoffice (SazónPOS, spec 26).
  - **TR-RNF-101**: efecto de cambios en ≤ 5 s (lo garantiza la versión de seguridad del 06); la UI no cachea permisos propios del actor más allá de `mi-contexto`.
  - **TR-RNF-013**: auditoría por `seg.evento_seguridad` en back; nada en UI.
  - **TR-RNF-014**: el finalizado pierde el tenant en el siguiente refresh (≤ 900 s) y los permisos al commit (039).
  - **TR-RNF-020**: tareas principales con < 1 h de capacitación (prueba con usuarios, fuera de CI).
  - **TR-RNF-026/012**: no loguear correos ni tokens; textos de la API como texto plano.

## 5. Historias del backlog y horas

| ID | Sprint | Comp. | Horas | Tipo | RF | Descripción |
|---|---|---|---|---|---|---|
| **U-03** | 4 | Admin cliente | 6 | Front | TR-RF-009, 013, 014 | Usuarios: invitar, asignar rol por sucursal, revocar |

Relacionadas fuera: U-04 (16b), U-05 y U-06 (17c), S-06 (18), S-01 (06, hecho), S-04 (08, hecho).

**Estimación** (roadmap: 10 h):

| Bloque | h |
|---|---|
| Back: lecturas de miembros con asignaciones e invitación pendiente (paginado, filtro, alcance del actor) | 2 |
| Back: `POST /v1/seg/asignaciones` (`OtorgarAsignacion`) | 1 |
| Back: lectura de roles y perfiles asignables (selector de invitar y asignar) | 0,5 |
| Front: lib `admin-cliente` + cliente HTTP + rutas montadas en `plataforma-admin` | 0,5-1 |
| Front: `longitudMinimaMotivo` en `confirmarDestructiva` (15) con prueba | 0,5 |
| Front U-03: lista, invitar, detalle con asignaciones, otorgar, suspender/reactivar/finalizar/revocar | 4-4,5 |
| **Total** | **8,5-9,5** |

Cabe con margen tras pasar el catálogo en árbol al 16b. La estimación original de U-03 en el paquete 16 era 5-6 h de front; aquí queda en 4-4,5 porque la lectura org pasó al 17a y roles/perfiles al 16b. Si se pasa, recortar primero `/admin/asignaciones` (redirige, D5) y el reenvío de invitación.

## 6. Estructura de código front y límites Nx

`estructura_frontend.txt`:

```
libs/plataforma/admin-cliente/     type:feature, scope:plataforma · rutas lazy que cada <producto>-backoffice embebe   ← la crea el 16a
  src/lib/admin.routes.ts          usuarios · roles · perfiles · empresas · sucursales · parámetros · series · catálogos
  src/lib/usuarios/                lista · invitar · detalle con asignaciones por sucursal · revocar     ← 16a (U-03)
  src/lib/roles/                   lista · editor de permisos agrupados por módulo · perfiles de puesto ← 16b (U-04)
  src/lib/organizacion/            empresas · sucursales · unidades operativas                          ← 17c (U-05)
  src/lib/parametros/ · series/ · catalogos/ · bitacora/                                                 ← otros
libs/plataforma/data-access/       type:data-access · cliente HTTP generado desde OpenAPI + stores con signals
apps/plataforma-admin/             monta libs/plataforma/admin-cliente
```

Estado real del repo (`portfolio/`):
- **No existen** `libs/plataforma/admin-cliente` ni `libs/plataforma/data-access`. El 16a crea `admin-cliente` (generador, `project.json`, tags, alias en `tsconfig.base.json`, `index.ts`, rutas). `data-access` no se crea (D4).
- `apps/plataforma-admin` existe (spec 14): `app.routes.ts` con `/auth`, `seleccionar-sucursal`, `sin-accesos`, `403` e `inicio`; el 15 lo cambia a `rutasDelShell(hijas)` y mueve las páginas al shell.
- `libs/shared/ui` existe en stub (`index.ts`), el 15 lo llena; `libs/shared/shell` lo crea el 15.
- Rutas del menú ya declaradas en el manifiesto PLAT `1.5.0` (`libs/plataforma/seguridad/manifiesto/plat.manifiesto.json`), módulo «Seguridad»: `/admin/roles` (`plat.rol.gestionar`), `/admin/perfiles` (`plat.perfil.gestionar`), `/admin/asignaciones` (`plat.asignacion.otorgar`), `/admin/usuarios` (`plat.usuario.invitar`). El 16a registra `/admin/usuarios` y `/admin/asignaciones`; `/admin/roles` y `/admin/perfiles` las registra el 16b. Mientras tanto el shell del 15 las trata como 404.

Límites Nx (`eslint.boundaries.snippet.js`, `estructura_frontend.txt`): `type:feature` → feature, ui, data-access, util; `scope:plataforma` nunca importa de un producto; `scope:shared` no importa fuera de shared. `admin-cliente` puede usar `shared/ui`, `shared/auth` (data-access) y `shared/shell` (feature). La opción `longitudMinimaMotivo` se agrega en `shared/ui` (o donde el 15 deje `AvisosService`), con valor por defecto 10.

Estructura interna sugerida (sigue "Estructura de libs Angular" de `CLAUDE.md`): `pages/usuarios-lista`, `pages/usuarios-invitar`, `pages/usuario-detalle`, `components/form-asignacion`, `components/selector-alcance`, `services/*.cliente.ts`, `models/*.ts`, `admin-cliente.routes.ts` con `permisoGuard` por ruta (el nombre exacto del archivo de rutas difiere entre `estructura_frontend.txt` y `CLAUDE.md`; manda `CLAUDE.md`: `<lib>.routes.ts`).

Orden con otros specs (Ola 6): el 16a corre después del 17a y en paralelo con el 17b. Solo choca con el 17b en `plat.manifiesto.json` si el 16a agrega permisos (D3: no agrega). El 16b y el 17c arrancan tras el merge del 16a y solo agregan carpetas y entradas de rutas.

## 7. Endpoints backend por pantalla

Existentes (repo: `libs/plataforma/seguridad/src/interface/`, `apps/api/src/`):

| Ruta | Dueño | Uso en el 16a |
|---|---|---|
| `GET /v1/seg/mi-contexto` | 06 | Permisos del actor, `mfa_vigente`, sucursales accesibles (`id`, `empresa_id`, `codigo`, `nombre`; sin nombre de empresa ni unidades) |
| `POST /v1/seg/invitaciones` | 08 | Invitar (201 `{ membresia_id, invitacion_id, expira_en, usuario_nuevo, correo_enviado }`); también reinvitar |
| `POST /v1/seg/membresias/{id}/suspender` · `/reactivar` · `/finalizar` | 08 | `{ motivo, confirmar: true }`; sensibles; motivo 4-300 |
| `POST /v1/seg/asignaciones/{id}/revocar` | 08 | `{ motivo, confirmar: true }`; sensible; motivo 4-300 |
| `GET /v1/seg/invitaciones/{token}`, `POST /v1/seg/invitaciones/aceptar` | 08 | No las usa (son del 14) |

De otro spec (17a, va antes):

| Pantalla | Ruta | Uso |
|---|---|---|
| Selector de alcance | `GET /v1/org/empresas`, `GET /v1/org/empresas/:id/sucursales`, `GET /v1/org/unidades?sucursal_id=` | Empresas, sucursales y unidades del tenant para elegir la entidad de la asignación (TR-CA-036) |

**Faltan** (las crea el 16a):

| Pantalla | Ruta propuesta | Caso de uso | Permiso propuesto |
|---|---|---|---|
| Usuarios: lista | `GET /v1/seg/miembros?estado&busqueda&pagina&orden` | Lectura nueva: membresía + `seg.usuario` (nombre, correo) + resumen de asignaciones + invitación pendiente (`expira_en`) | `plat.usuario.invitar` (D3) |
| Usuarios: detalle | `GET /v1/seg/miembros/{membresiaId}` con asignaciones (rol/perfil, alcance, entidad, vigencia, revocada) | Lectura nueva | Ídem |
| Asignar | `POST /v1/seg/asignaciones` | `OtorgarAsignacion` (06) | `plat.asignacion.otorgar` (sensible) |
| Asignaciones (`/admin/asignaciones`) | Redirige a Usuarios (D5) | Ninguna | `plat.asignacion.otorgar` |
| Invitar y asignar: selector de rol/perfil | `GET /v1/seg/roles?activo=true` y `GET /v1/seg/perfiles` (solo productos contratados) | Lectura nueva + `ProductosContratados` | `plat.usuario.invitar` (D3); `plat.rol.gestionar` es `TENANT` y dejaría fuera al admin de SUCURSAL. Choca con la lista de gestión del 16b (B11) |

Los puertos de repositorio (`repositorios.ts`) no tienen ningún método de listado: toda lectura es nueva, con TypeORM (regla 11 de `CLAUDE.md`; SQL crudo solo si el ORM no lo expresa bien, con la razón en el spec).

## 8. Diagramas

- **PL-06** (invitación): administrador → `POST invitar(correo, rol, alcance sucursal)` con `@Permiso plat.usuario.invitar` → Admin API de Supabase → membresía INVITADO + asignación → correo → aceptar (14). Es el flujo detrás del formulario de invitar.
- **PL-05** (solicitud autorizada): `@Permiso` y `X-Sucursal-Id`. Todas las rutas llevan la cabecera; el alcance del actor se evalúa con la sucursal actual.
- **PL-04** (ingreso con MFA): el step-up de acciones sensibles vuelve a `/auth/mfa`.
- **PL-10**: `admin-cliente` cuelga de TR-SEG y TR-ORG.
- Ningún diagrama cubre revocación ni asignación en UI.

## 9. Código base relacionado

- `docs/.../codigo/` no trae nada de `admin-cliente` (solo `shared/auth`).
- Repo: `libs/plataforma/seguridad/src/application/` tiene `otorgar-asignacion.ts`, `invitar-usuario.ts`, `membresia.casos-de-uso.ts`, `alcance-actor.ts`; `interface/` tiene `invitaciones.controller.ts`, `membresias.controller.ts`, `membresias.http.ts` (patrón de DTO y errores a seguir), `mi-contexto.controller.ts`, `respuestas.ts`. Errores de dominio con `{ codigo, mensaje }` y mensajes del SRS ya definidos en 06 y 08.
- `libs/plataforma/seguridad/src/domain/texto.ts`: `motivo()` valida 4-300 (comentario: «Mínimo 4, no 5 como TR-RF-014: TR-CA-039 usa «Cese»»).
- Formato de errores HTTP: `{ codigo, mensaje }`; 400 `SOLICITUD_INVALIDA` con campos (zod). La UI mapea `codigo` a texto o muestra `mensaje` como texto plano.

## 10. Decisiones tomadas

- **D1. Longitud del motivo** (decisión del usuario). Se respeta lo implementado: SEG valida 4-300 (`libs/plataforma/seguridad/src/domain/texto.ts`), ORG valida 10-500 (`libs/plataforma/org/src/domain/tenant.ts`). El 16a agrega a `confirmarDestructiva` del 15 la opción `longitudMinimaMotivo` (por defecto 10, sin cambiar el comportamiento ni las pruebas del 15) y la usa con 4 en suspender, reactivar, finalizar y revocar. Así TR-CA-039 («Cese») se ejecuta desde la UI. 17b y 17c usan el default 10 donde el back es ORG. El SRS (5-300) queda superado por el back.
- **D2. Operador vs. cliente** (decisión del usuario): se distingue por permiso (`OPERADOR_REQUERIDO` en la API, spec 17a), no por `tipo_usuario`. No afecta al 16a: todo corre en el tenant del token.
- **D3. Permisos de lectura** (recomendación heredada del paquete 16, P2): lista y detalle de miembros, y roles/perfiles asignables con `plat.usuario.invitar`; sin tocar el manifiesto. Alternativa: `plat.usuario.consultar` en una versión nueva del manifiesto (chocaría con 17a y 17b).
- **D4. Cliente HTTP** (P3 del paquete 16): servicios a mano en `admin-cliente/services/*.cliente.ts`, como `InvitacionCliente` del 14, con mapeo snake_case → camelCase. Sin `plataforma/data-access`.
- **D5. `/admin/asignaciones`** (P7 del paquete 16): redirige a `/admin/usuarios`; las asignaciones se gestionan en el detalle del miembro. Quitar la opción del manifiesto requeriría versión nueva.
- **D6. División** (roadmap): el 16 original se partió en 16a (este) y 16b; la lectura org pasó al 17a.

## 11. Brechas restantes

- **B1. API de usuarios y asignaciones inexistente** (sección 7). El plan la da por hecha; es la causa de que U-03 ocupe 10 h y no 6.
- **B2. Selector de alcance con permiso ajeno.** Las lecturas del 17a llevan su propio permiso de lectura (`plat.organizacion.consultar` propuesto). Un admin de seguridad sin ese permiso no podría llenar el selector. Hay que sumar ese permiso a los roles que invitan (`PLAT_ADMIN_SEGURIDAD`) en el 17a, o que el 17a acepte también `plat.usuario.invitar`; `@Permiso` admite un solo código.
- **B3. Selector filtrado por alcance del actor.** Las lecturas del 17a devuelven todo el tenant (RLS); filtrar por lo que cubre el actor queda en la UI con `mi-contexto` y el back de `OtorgarAsignacion` decide igual.
- **B4. Step-up sin reintento.** `plat.asignacion.otorgar` y `revocar` son sensibles; ante `MFA_REQUERIDA` el 13 navega a `/auth/mfa?returnUrl` y no reintenta: el formulario se pierde. Recomendación (P4 del paquete 16): si `mfa_vigente` es falso, avisar y llevar a MFA antes de abrir la acción; se acepta perder el formulario corto si igual llega `MFA_REQUERIDA`.
- **B5. Catálogo en árbol:** resuelto, pasó al 16b junto con su consumidor.
- **B6. RF-010** no es del 16a (14). APP-05 vs APP-02 en el SRS lo confirma.
- **B7. Embebible (RNF-122)**: hoy solo existe `plataforma-admin`. Basta con no fijar colores y exportar las rutas; el montaje en SazónPOS es del 26.
- **B8. GWT de UI**: ninguno de los 10 GWT cubre listas, filtros, reenvío, suspender/reactivar, step-up ni responsivo (tabla de la sección 3).
- **B9. Versión**: SRS dice Angular 19, estructura 22; el proyecto va en 21.
- **B10. Lecturas del 13 y 14 a corregir** (no se editan aquí): el spec 14 leyó `plataforma-admin` como la consola (es la app del cliente, ver 17c) y el 13 cita ADR-29 donde corresponde ADR-31 para la sesión compartida.
- **B11. Misma ruta, dos permisos.** El selector (16a, `plat.usuario.invitar`) y la gestión de roles (16b, `plat.rol.gestionar`) leen roles; `@Permiso` admite un solo código. Separar rutas o que el 16b reuse la lectura del 16a con su propio permiso para el detalle. Decidir al redactar el 16a.

## 12. Preguntas candidatas para la Fase 2 de /spec

- **P1. ¿Paginación y búsqueda?** (Servidor, porque `vit-tabla` ya lo soporta: `pagina`, `tamano` (20), `orden`, `busqueda` por nombre o correo (ILIKE), `estado`.)
- **P2. ¿Permiso del selector de alcance?** (B2: pedir al 17a que `PLAT_ADMIN_SEGURIDAD` tenga el permiso de lectura de organización.)
- **P3. ¿Pruebas y evidencia?** (Back: integración HTTP con supertest de cada ruta nueva y de 036-038 por HTTP, aislamiento entre tenants en las lecturas (0 filas cruzadas, RNF-010). Front: Vitest + TestBed zoneless con `HttpTestingController` para los 10 GWT en su parte de UI y los propuestos; prueba de `longitudMinimaMotivo` con 4 y con el default. Verificación en navegador con el MCP `playwright` contra Supabase dev: invitar, asignar en «CAJA-02», finalizar con «Cese»; sin navegador se declara como no probado. RNF-018 en 360/768/1280 px; axe (RNF-122) solo si cabe.)
