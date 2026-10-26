# Contexto para el spec 16 · admin-usuarios-roles

Paquete de contexto (no es el spec). Fuentes: `docs/roadmap-specs.md`, `specs/06-seg-autorizacion.md`, `specs/08-seg-membresias.md`, `specs/13-auth-cliente-angular.md`, `specs/14-auth-ui-minima.md`, `specs/15-shell-y-ui.md` (aprobado, en implementación), `docs/spec-context/08-seg-membresias.md` y `15-shell-y-ui.md`, SRS xlsx (hojas Aplicaciones, Reglas de negocio, RF, Criterios GWT, RNF, Matriz RF-RNF), `3_plan.json`, `2_Estructura/estructura_frontend.txt`, `1_Mermaid/PL-xx`, código del repo (`libs/plataforma/seguridad`, `apps/plataforma-admin`, manifiesto PLAT). Ruta base del plan: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 1. Alcance y límites con otros specs

- Roadmap: spec 16 `admin-usuarios-roles`, cubre **U-03** y **U-04**; 10 h; depende de **08** y **15**. Ola 6, después de 12, 15, 18, 19, 21, en paralelo con 17.
- Plan: U-03 (sprint 4, 6 h, Front, R1) "Usuarios: invitar, asignar rol por sucursal, revocar", RF 009, 013, 014. U-04 (sprint 5, 4 h, Front, R1) "Roles y perfiles de puesto", RF 011, 012. Verificado en `3_plan.json`: 6 + 4 = 10 h.
- Aplicación SRS: **APP-02** "Administración del cliente (embebible)": librería Nx `plataforma-admin-cliente` con rutas lazy que cada `<cod>-backoffice` monta. Los cinco RF del spec son APP-02.
- **Las 10 h del plan son solo front y suponen la API hecha. No lo está** (sección 7). El spec 06 dejó explícito: "Controladores de administración `/v1/seg/roles`, `/perfiles` y `/asignaciones` (spec 16)". El spec 08 dejó fuera "Listado de miembros e invitaciones del tenant (`GET`)" y "UI de usuarios (spec 16)". El 16 hereda esa deuda de backend.
- **Límite con el 08** (seg-membresias, implementado): el 08 es dueño de invitar, aceptar, suspender, reactivar, finalizar y revocar en backend. El 16 consume sus 7 rutas sin cambiarlas.
- **Límite con el 06** (seg-autorizacion, implementado): casos de uso `CrearRol`, `CopiarRol`, `CambiarPermisosRol`, `InactivarRol`, `CrearPerfil`, `CambiarRolesPerfil`, `OtorgarAsignacion` existen y están probados sin controlador. El 16 los expone por HTTP; no toca dominio ni SQL salvo lecturas nuevas.
- **Límite con el 13** (shared/auth): `SesionService`, `permisoGuard`, `*siPermiso`, interceptor con step-up (`MFA_REQUERIDA` → `/auth/mfa?returnUrl`, sin reintento). El 16 los usa tal cual.
- **Límite con el 14** (auth-ui): **la pantalla «aceptar invitación» (RF-010) es del 14**, no del 16. Ver sección 2.
- **Límite con el 15** (shared/ui, shared/shell): el 16 usa `vit-tabla` (paginación y orden del lado del servidor), `vit-filtros`, `vit-acciones-formulario`, `mensajeValidacion`, `vit-cargando`, `vit-estado-vacio`, `AvisosService.confirmarDestructiva`, `erroresHttpInterceptor` y `OMITIR_AVISO_ERROR`. Las pantallas se montan como hijas de `rutasDelShell`. El 15 dice: "`vit-tabla` ... el spec 16 la conecta a la API".
- **Límite con el 17b (U-05, admin de organización: empresas, sucursales, unidades)**. El roadmap tiene un solo 17 (O-04, U-05, U-06, 11 h) y dice que se parte; aquí se asume 17b = U-05. Ver sección 6 y brecha B6.
- Fuera de alcance: aceptar invitación (14), empresas/sucursales/unidades (17b), consola de plataforma y app autónoma (17, O-04 y U-06), bitácora y soporte (18, `admin-cliente/bitacora/`), parámetros y series en UI (19b u otro), auditoría TR-AUD (20), cierre explícito de sesiones en Supabase (08 lo dejó fuera), e2e multinavegador y axe en CI (27).

## 2. Requisitos funcionales

| ID | Nombre | Permiso | Prioridad | Fase | Historia | Back |
|---|---|---|---|---|---|---|
| TR-RF-009 | Invitar usuario al tenant | `plat.usuario.invitar` | Must | MVP | U-03 | 08, ruta existe |
| TR-RF-013 | Asignar rol o perfil con alcance y vigencia | `plat.asignacion.otorgar` (sensible) | Must | MVP | U-03 | 06, **sin ruta** |
| TR-RF-014 | Revocar acceso y suspender membresía | `plat.asignacion.revocar` (sensible) | Must | MVP | U-03 | 08, rutas existen |
| TR-RF-011 | Gestionar roles propios del tenant | `plat.rol.gestionar` | Must | MVP | U-04 | 06, **sin ruta** |
| TR-RF-012 | Gestionar perfiles de puesto | `plat.perfil.gestionar` | **Should** | MVP | U-04 | 06, **sin ruta** |

Todos MOD-02 TR-SEG, APP-02, proceso TR-P02, actor "Administrador del cliente".

**TR-RF-009** (detalle en `spec-context/08`). Datos: correo, nombre (3-150), perfil_id o rol_id (uno), alcance TENANT|EMPRESA|SUCURSAL|UNIDAD, empresa/sucursal/unidad_id según alcance, vigente_hasta opcional. Precond.: alcance suficiente del actor; plan sin llegar al límite. Reglas TR-RN-006, 008. RNF 009, 013. En UI: formulario de invitación y manejo de `usuario_nuevo`, `correo_enviado: false`, `LIMITE_USUARIOS`, `ALCANCE_SUPERIOR`, `MEMBRESIA_EXISTENTE`, `MFA_REQUERIDA`.

**TR-RF-010** (aceptar invitación, SRS lo ubica en **APP-05**, no APP-02). **Decisión: no entra en el 16.** Ya la cubre el spec 14 (`libs/shared/auth-ui/pages/invitacion`, `InvitacionCliente`, mensajes de TR-CA-029 y 030, `refrescarSesion()`), con el contrato `GET /v1/seg/invitaciones/{token}` y `POST /v1/seg/invitaciones/aceptar` del 08; el roadmap lo dice ("invitación (pantalla del spec 08)") y el 14 la decidió ("Sí: la invitación entra"). `SEG_URL_INVITACION` apunta a `/auth/invitacion`. No queda sin dueño. Única pieza que el 14 dejó al 15: "ve el menú del perfil «Cajero»" (TR-CA-028), que el shell resuelve con `mi-contexto`. El 16 no suma horas por RF-010.

**TR-RF-011** (roles). Descripción: crear, copiar desde predefinido, editar e inactivar roles propios de un producto, seleccionando permisos del catálogo del producto; los predefinidos no son editables. Precond.: suscripción vigente al producto del rol. Flujo: 1 elige producto y crea o copia; 2 marca permisos del **árbol módulo → opción → permiso**; 3 valida que los permisos sean del producto; 4 guarda, invalida caché y registra auditoría. Datos: producto_codigo (obligatorio); codigo (3-50, único por tenant); nombre (3-100); permisos[] (códigos del producto); activo. Reglas TR-RN-007, 009. RNF 101, **122**, 013. Salida: rol propio disponible para asignación.

**TR-RF-012** (perfiles). Agrupar roles de uno o varios productos contratados para asignar el acceso de un puesto en una operación. Precond.: existen roles activos de productos contratados. Flujo: 1 crea perfil con código y nombre; 2 selecciona uno o más roles; 3 guarda y recalcula permisos de quienes lo tienen. Datos: codigo (3-50, único por tenant); nombre (3-100); roles[] (uuid de roles activos). Regla TR-RN-007. RNF 101, 027. Es **Should**: candidato a recorte.

**TR-RF-013** (asignar). Otorgar a un miembro rol o perfil con alcance y vigencia, validando coherencia y que el otorgante tenga alcance igual o mayor. Precond.: membresía ACTIVA o INVITADO. Flujo: 1 selecciona miembro y rol o perfil; 2 alcance, entidad y vigencia; 3 valida TR-RN-008 y alcance del otorgante; 4 si el rol tiene permisos sensibles pide MFA al otorgante; 5 guarda, `ASIGNACION_OTORGADA`, invalida caché. Datos: membresia_id; rol_id o perfil_id (exactamente uno); alcance; empresa_id, sucursal_id, unidad_id según alcance; vigente_desde (por defecto hoy); vigente_hasta (≥ desde, opcional). Reglas 007, 008, 009. RNF 101, 009, 013. Salida: efecto en permisos efectivos en ≤ 5 s.

**TR-RF-014** (detalle en `spec-context/08`). Datos: membresia_id o asignacion_id; accion REVOCAR|SUSPENDER|FINALIZAR; motivo (5-300, obligatorio). Flujo: selecciona asignación o membresía y acción; confirmación y motivo; valida TR-RN-010; revoca o suspende. Back del 08 suma REACTIVAR. RNF 021, 014, 013.

## 3. Criterios GWT (tal cual; todos "Pendiente" en el SRS)

**TR-RF-009**
- **TR-CA-025** · Invitación a cajera de sucursal · Positivo. DADO QUE el administrador tiene alcance TENANT y el plan permite 10 usuarios con 6 activos · CUANDO invita a rosa.huaman@gmail.com con el perfil «Cajero» en la sucursal «Miraflores» · ENTONCES se crea la membresía en estado INVITADO y se envía el correo de invitación
- **TR-CA-026** · Alcance superior al propio · Negativo. DADO QUE el actor tiene alcance SUCURSAL en «Miraflores» · CUANDO intenta invitar a un usuario con alcance TENANT · ENTONCES el sistema rechaza con «No puede otorgar un alcance mayor al suyo»
- **TR-CA-027** · Usuario ya miembro de otro tenant · Borde. DADO QUE carlos.rojas@outlook.com es usuario activo del tenant «gym-norte» · CUANDO lo invitan al tenant «gym-sur» · ENTONCES se crea una segunda membresía sin duplicar el usuario

**TR-RF-011**
- **TR-CA-031** · Copia de rol predefinido · Positivo. DADO QUE existe el rol predefinido «REST_MOZO» · CUANDO copia el rol como «Mozo terraza» y quita el permiso rest.pedido.anular · ENTONCES el rol «Mozo terraza» queda activo sin el permiso de anular
- **TR-CA-032** · Edición de rol predefinido · Negativo. DADO QUE el actor abre el rol predefinido «REST_CAJERO» · CUANDO intenta quitarle un permiso · ENTONCES el sistema indica «Los roles predefinidos no se editan; cree una copia»
- **TR-CA-033** · Inactivar rol en uso · Borde. DADO QUE el rol «Mozo terraza» está asignado a 4 usuarios · CUANDO lo inactiva · ENTONCES el sistema pide confirmación indicando los 4 usuarios afectados y, al confirmar, sus permisos dejan de estar vigentes

**TR-RF-012**
- **TR-CA-034** · Perfil multiproducto · Positivo. DADO QUE el tenant tiene LIB y ECO contratados · CUANDO crea el perfil «Encargado de tienda» con los roles LIB_VENDEDOR y ECO_GESTOR_PEDIDOS · ENTONCES el perfil queda disponible y al asignarlo otorga permisos de ambos productos
- **TR-CA-035** · Rol de producto no contratado · Negativo. DADO QUE el tenant no tiene CLI contratado · CUANDO intenta agregar el rol CLI_RECEPCION al perfil · ENTONCES el sistema no muestra ni acepta roles de productos no contratados

**TR-RF-013**
- **TR-CA-036** · Asignación temporal por reemplazo · Positivo. DADO QUE Luis Paredes es miembro ACTIVO del tenant · CUANDO le asignan el rol «Cajero» en la unidad «CAJA-02» del 15/10/2026 al 31/10/2026 · ENTONCES Luis tiene permisos de caja solo en «CAJA-02» y solo en ese rango de fechas
- **TR-CA-037** · Rol y perfil a la vez · Negativo. DADO QUE el actor selecciona un rol y un perfil · CUANDO intenta guardar la asignación · ENTONCES el sistema rechaza con «Seleccione un rol o un perfil, no ambos»
- **TR-CA-038** · Vigencia hasta anterior a desde · Borde. DADO QUE el actor define vigente_desde 20/10/2026 · CUANDO ingresa vigente_hasta 19/10/2026 · ENTONCES el sistema rechaza con «La vigencia hasta no puede ser anterior a la vigencia desde»

**TR-RF-014**
- **TR-CA-039** · Salida de colaborador · Positivo. DADO QUE Pedro Salazar tiene membresía ACTIVA y una sesión abierta · CUANDO el administrador finaliza su membresía con motivo «Cese» · ENTONCES la sesión de Pedro se invalida y no puede volver a ingresar al tenant
- **TR-CA-040** · Último propietario · Negativo. DADO QUE Ana Torres es la única propietaria del tenant · CUANDO intenta suspender su propia membresía · ENTONCES el sistema rechaza con «El tenant debe tener al menos un propietario activo»

Total: 15 GWT (3 + 3 + 2 + 3 + 2). La parte de dominio ya está cerrada en 06 (031-038) y 08 (025-027, 039, 040). En el 16 se cierran por HTTP (las rutas nuevas) y por UI (mensaje visible, campo bloqueado, confirmación). TR-CA-028 a 030 son del 14.

Notas sobre los GWT en UI:
- 032: en UI el rol predefinido se abre en solo lectura con botón «Copiar»; el mensaje exacto lo da la API (`ROL_PREDEFINIDO`, verificar código en 06) si se llama igual.
- 033: `InactivarRol` sin `confirmado` devuelve `{ requiereConfirmacion: true, afectados: N }`; la UI muestra N en `confirmarDestructiva` y repite con `confirmado`.
- 035: la UI no lista roles de productos no contratados (filtro en la lectura); la API rechaza `PRODUCTO_NO_CONTRATADO` si llega igual.
- 037: la UI hace rol y perfil excluyentes (no se puede seleccionar ambos); la prueba de la API cubre el rechazo.
- 039: el motivo «Cese» tiene **4 caracteres**. El back del 08 acepta 4-300 justamente por esto; el SRS dice 5-300; `confirmarDestructiva` del 15 exige **10**. Con el 15 tal cual, TR-CA-039 no se puede ejecutar desde la UI (brecha B4).

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
| Step-up en acción sensible | 013/014 | MFA de hace 40 min: otorgar o revocar lleva a `/auth/mfa`, y al volver el formulario o la acción no se pierde (o se avisa antes de enviar) |
| Acciones sin permiso | todos | Actor sin `plat.asignacion.revocar` no ve suspender/finalizar/revocar (`*siPermiso`); la ruta sin permiso va a 403 |
| Editar rol propio | 011 | Cambiar permisos de «Mozo terraza» se refleja en el siguiente `mi-contexto` del afectado (≤ 5 s) |
| Rol sin uso | 011 | Inactivar un rol sin asignaciones no pide conteo |
| Árbol de permisos | 011 | El editor agrupa módulo → opción → permiso y marca los sensibles |
| Perfil sin roles | 012 | Guardar sin roles: «Seleccione al menos un rol» |
| Responsivo | todos | Usuarios, roles y asignación usables a 360, 768 y 1280 px (TR-RNF-018) |

## 4. Reglas TR-RN y RNF

- **TR-RN-006**: sin suscripción vigente no hay permisos; no se crean usuarios por encima del plan. UI: mostrar `LIMITE_USUARIOS`; filtrar productos no contratados en roles y perfiles.
- **TR-RN-007**: `producto.recurso.accion` por alcance (TENANT > EMPRESA > SUCURSAL > UNIDAD). UI: el selector de alcance solo ofrece lo que el actor cubre (el back decide igual).
- **TR-RN-008**: rol o perfil, nunca ambos ni ninguno; alcance coherente; hasta ≥ desde. UI: validación local con los mensajes del SRS (037, 038).
- **TR-RN-009**: sensibles exigen MFA ≤ 15 min ("otorgar roles" está en el texto de la regla). `plat.asignacion.otorgar` y `plat.asignacion.revocar` son `sensible: true` en el manifiesto; invitar es sensible solo si el rol invitado trae un permiso sensible.
- **TR-RN-010**: al menos un propietario activo (040). Solo back; la UI muestra el mensaje.
- RNF que aplican:
  - **TR-RNF-021**: confirmación explícita y motivo obligatorio en suspender, finalizar, revocar e inactivar rol. Back exige `confirmar: true` y motivo.
  - **TR-RNF-018**: responsiva ≥ 360 px, español de Perú.
  - **TR-RNF-122** (propio de APP-02, Should): la administración embebible adopta los tokens de diseño del producto anfitrión y cumple WCAG 2.1 AA (axe sin errores críticos), cambio de tema sin recompilar. Implica: sin colores fijos, solo tokens de `shared/ui`; las rutas deben poder montarse en otro backoffice (SazónPOS, spec 26).
  - **TR-RNF-101**: efecto de cambios en ≤ 5 s (lo garantiza la versión de seguridad del 06); la UI no cachea permisos propios del actor más allá de `mi-contexto`.
  - **TR-RNF-013**: auditoría por `seg.evento_seguridad` en back; nada en UI.
  - **TR-RNF-014**: el finalizado pierde el tenant en el siguiente refresh (≤ 900 s) y los permisos al commit; la UI no puede prometer "sesión invalidada" al instante (039).
  - **TR-RNF-020**: tareas principales con < 1 h de capacitación (prueba con usuarios, fuera de CI).
  - **TR-RNF-027** (RF-012): configuración por tenant sin código.
  - **TR-RNF-026/012**: no loguear correos ni tokens; textos de la API como texto plano.

## 5. Historias del backlog (3_plan.json)

| ID | Sprint | Comp. | Horas | Tipo | RF | Descripción |
|---|---|---|---|---|---|---|
| **U-03** | 4 | Admin cliente | 6 | Front | TR-RF-009, 013, 014 | Usuarios: invitar, asignar rol por sucursal, revocar |
| **U-04** | 5 | Admin cliente | 4 | Front | TR-RF-011, 012 | Roles y perfiles de puesto |

Total del plan: 10 h, el tope. Relacionadas fuera: U-05 (4 h, empresas/sucursales/unidades, RF 002-004), U-06 (2 h, app plataforma-admin autónoma), S-06 (4 h, bitácora), S-01 (6 h, dominio de rol/perfil/asignación, ya hecho en 06), S-04 (4 h, membresías, ya hecho en 08).

**Estimación real** (el plan no cuenta la API que falta):

| Bloque | h |
|---|---|
| Back: lecturas de miembros con asignaciones e invitación pendiente (paginado, filtro, alcance del actor) | 2-2,5 |
| Back: controladores de asignaciones (otorgar, listar por membresía) | 1-1,5 |
| Back: controladores de roles (listar, detalle, crear, copiar, cambiar permisos, inactivar) y catálogo de permisos por producto (árbol) | 2-2,5 |
| Back: controladores de perfiles (listar, crear, cambiar roles) | 1 |
| Back: lectura de estructura org para el selector de alcance (empresas, sucursales, unidades) | 1 |
| Front: lib `admin-cliente` + cliente HTTP + rutas | 1 |
| Front U-03: lista, invitar, detalle con asignaciones, otorgar, suspender/reactivar/finalizar/revocar | 5-6 |
| Front U-04: roles (lista, editor de árbol, copiar, inactivar) y perfiles | 3,5-4 |
| **Total** | **~17-20 h** |

No cabe en 10 h. Propuesta de corte (sección 11, P1).

## 6. Estructura de código front y límites Nx

`estructura_frontend.txt`:

```
libs/plataforma/admin-cliente/     type:feature, scope:plataforma · rutas lazy que cada <producto>-backoffice embebe
  src/lib/admin.routes.ts          usuarios · roles · perfiles · empresas · sucursales · parámetros · series · catálogos
  src/lib/usuarios/                lista · invitar · detalle con asignaciones por sucursal · revocar     ← 16 (U-03)
  src/lib/roles/                   lista · editor de permisos agrupados por módulo · perfiles de puesto ← 16 (U-04)
  src/lib/organizacion/            empresas · sucursales · unidades operativas                          ← 17b (U-05)
  src/lib/parametros/ · series/ · catalogos/ · bitacora/                                                 ← otros
libs/plataforma/data-access/       type:data-access · cliente HTTP generado desde OpenAPI + stores con signals
apps/plataforma-admin/             monta libs/plataforma/admin-cliente
```

Estado real del repo (`portfolio/`):
- **No existen** `libs/plataforma/admin-cliente` ni `libs/plataforma/data-access`. El primero que llegue los crea.
- `apps/plataforma-admin` existe (spec 14): `app.routes.ts` con `/auth`, `seleccionar-sucursal`, `sin-accesos`, `403` e `inicio`; el 15 lo cambia a `rutasDelShell(hijas)` y mueve las páginas al shell.
- `libs/shared/ui` existe en stub (`index.ts`), el 15 lo llena; `libs/shared/shell` lo crea el 15.
- Rutas del menú ya declaradas en el manifiesto PLAT `1.5.0` (`libs/plataforma/seguridad/manifiesto/plat.manifiesto.json`), módulo «Seguridad»: `/admin/roles` (`plat.rol.gestionar`), `/admin/perfiles` (`plat.perfil.gestionar`), `/admin/asignaciones` (`plat.asignacion.otorgar`), `/admin/usuarios` (`plat.usuario.invitar`). El 16 debe registrar esas cuatro rutas o el shell las tratará como 404.

Límites Nx (`eslint.boundaries.snippet.js`, `estructura_frontend.txt`): `type:feature` → feature, ui, data-access, util; `scope:plataforma` nunca importa de un producto; `scope:shared` no importa fuera de shared. `admin-cliente` puede usar `shared/ui`, `shared/auth` (data-access) y `shared/shell` (feature). El cliente HTTP: o `plataforma/data-access` (OpenAPI generado, como dice la estructura) o servicios a mano dentro de `admin-cliente` (más barato; decisión P3).

Estructura interna sugerida (sigue "Estructura de libs Angular" de `CLAUDE.md`): `usuarios/pages/{lista,invitar,detalle}`, `usuarios/components/{form-asignacion,selector-alcance}`, `roles/pages/{lista,editor}`, `perfiles/pages/{lista,editor}`, `services/*.cliente.ts`, `models/*.ts`, `admin.routes.ts` con `permisoGuard` por ruta.

**Riesgo con el 17b** si van en paralelo (Ola 6 los pone juntos): ambos crearían `libs/plataforma/admin-cliente` (generador, `project.json`, tags, `index.ts`, `admin.routes.ts`), ambos editarían `apps/plataforma-admin/src/app/app.routes.ts`, `tsconfig.base.json` (alias) y, si se elige, `plataforma/data-access`. Y el 16 necesita leer la estructura org (selector de alcance, TR-CA-036 en «CAJA-02») que el 17b también expone para su CRUD: dos controladores `org` distintos para lo mismo. Mitigación (P5): el 16 crea la lib y la lectura de estructura org; el 17b arranca después del merge del 16 y solo agrega `organizacion/` y una entrada en `admin.routes.ts`. Si se paraleliza, crear antes un commit chico con la lib vacía y las rutas, y acordar quién es dueño de la lectura org.

## 7. Endpoints backend por pantalla

Existentes (repo: `libs/plataforma/seguridad/src/interface/`, `apps/api/src/`):

| Ruta | Dueño | Uso en el 16 |
|---|---|---|
| `GET /v1/seg/mi-contexto` | 06 | Permisos del actor, `mfa_vigente`, sucursales accesibles (`id`, `empresa_id`, `codigo`, `nombre`; sin nombre de empresa ni unidades) |
| `POST /v1/seg/invitaciones` | 08 | Invitar (201 `{ membresia_id, invitacion_id, expira_en, usuario_nuevo, correo_enviado }`); también reinvitar |
| `POST /v1/seg/membresias/{id}/suspender` · `/reactivar` · `/finalizar` | 08 | `{ motivo, confirmar: true }`; sensibles |
| `POST /v1/seg/asignaciones/{id}/revocar` | 08 | `{ motivo, confirmar: true }`; sensible |
| `GET /v1/seg/invitaciones/{token}`, `POST /v1/seg/invitaciones/aceptar` | 08 | No las usa el 16 (son del 14) |

**Faltan** (el 16 debe crearlas o alguien antes):

| Pantalla | Ruta propuesta | Caso de uso | Permiso propuesto |
|---|---|---|---|
| Usuarios: lista | `GET /v1/seg/miembros?estado&busqueda&pagina&orden` | Lectura nueva: membresía + `seg.usuario` (nombre, correo) + resumen de asignaciones + invitación pendiente (`expira_en`) | No hay permiso de lectura; reusar `plat.usuario.invitar` (es el de la opción de menú) o agregar `plat.usuario.consultar` (manifiesto 1.6.0) |
| Usuarios: detalle | `GET /v1/seg/miembros/{membresiaId}` con asignaciones (rol/perfil, alcance, entidad, vigencia, revocada) | Lectura nueva | Ídem |
| Asignar | `POST /v1/seg/asignaciones` | `OtorgarAsignacion` (06) | `plat.asignacion.otorgar` (sensible) |
| Asignaciones (`/admin/asignaciones`) | `GET /v1/seg/asignaciones?...` o redirigir a Usuarios | Lectura nueva o ninguna | `plat.asignacion.otorgar` |
| Invitar y asignar: selector de rol/perfil | `GET /v1/seg/roles?activo=true` y `GET /v1/seg/perfiles` (solo productos contratados) | Lectura nueva + `ProductosContratados` | `plat.rol.gestionar` es `TENANT`: un admin de SUCURSAL que invita no podría listar roles. Hace falta una lectura con `plat.usuario.invitar` o `plat.asignacion.otorgar` |
| Selector de alcance | `GET /v1/org/estructura` (empresas → sucursales → unidades activas, filtradas por el alcance del actor) | Lectura nueva en `org` | `plat.usuario.invitar` u `plat.asignacion.otorgar`; solapa con 17b |
| Roles: lista y detalle | `GET /v1/seg/roles`, `GET /v1/seg/roles/{id}` (con permisos y `predefinido`) | Lectura nueva | `plat.rol.gestionar` |
| Roles: crear / copiar | `POST /v1/seg/roles`, `POST /v1/seg/roles/{id}/copia` | `CrearRol`, `CopiarRol` | `plat.rol.gestionar` |
| Roles: editar permisos | `PUT /v1/seg/roles/{id}/permisos` | `CambiarPermisosRol` | `plat.rol.gestionar` |
| Roles: inactivar | `POST /v1/seg/roles/{id}/inactivar` `{ confirmado }` | `InactivarRol` (devuelve `requiereConfirmacion`, `afectados`) | `plat.rol.gestionar` |
| Roles: árbol de permisos | `GET /v1/seg/catalogo/{producto}` (módulo → opción → permiso, `sensible`, `alcance_minimo`) y `GET /v1/seg/productos-contratados` | Lectura nueva sobre `seg.modulo`, `seg.opcion`, `seg.opcion_permiso`, `seg.permiso`; `ProductosContratados.vigentes()` | `plat.rol.gestionar` |
| Perfiles | `GET /v1/seg/perfiles`, `POST /v1/seg/perfiles`, `PUT /v1/seg/perfiles/{id}/roles` | `CrearPerfil`, `CambiarRolesPerfil` | `plat.perfil.gestionar` |

Huecos de casos de uso: no hay `RenombrarRol` ni `RenombrarPerfil` (el RF-011 dice "editar"; los del 06 solo cambian permisos o roles), ni `InactivarPerfil`, ni reactivar rol. Los puertos de repositorio (`repositorios.ts`) no tienen ningún método de listado: toda lectura es nueva (con TypeORM o SQL de lectura según la regla de persistencia vigente desde el spec 10).

## 8. Diagramas

- **PL-06** (invitación): administrador → `POST invitar(correo, rol, alcance sucursal)` con `@Permiso plat.usuario.invitar` → Admin API de Supabase → membresía INVITADO + asignación → correo → aceptar (14). Es el flujo detrás del formulario de invitar.
- **PL-05** (solicitud autorizada): `@Permiso` y `X-Sucursal-Id`. Todas las rutas del 16 llevan la cabecera; el alcance del actor se evalúa con la sucursal actual.
- **PL-04** (ingreso con MFA): el step-up de acciones sensibles vuelve a `/auth/mfa`.
- **PL-10**: `admin-cliente` cuelga de TR-SEG y TR-ORG.
- Ningún diagrama cubre revocación, roles ni perfiles en UI.

## 9. Código base relacionado

- `docs/.../codigo/` no trae nada de `admin-cliente` (solo `shared/auth`).
- Repo: `libs/plataforma/seguridad/src/application/` tiene `rol.casos-de-uso.ts`, `perfil.casos-de-uso.ts`, `otorgar-asignacion.ts`, `invitar-usuario.ts`, `membresia.casos-de-uso.ts`, `alcance-actor.ts`; `interface/` tiene `invitaciones.controller.ts`, `membresias.controller.ts`, `membresias.http.ts` (patrón de DTO y errores a seguir), `mi-contexto.controller.ts`, `respuestas.ts`. Errores de dominio con `{ codigo, mensaje }` y mensajes del SRS ya definidos en 06 y 08.
- Formato de errores HTTP: `{ codigo, mensaje }`; 400 `SOLICITUD_INVALIDA` con campos (zod). La UI mapea `codigo` a texto o muestra `mensaje` como texto plano.
- `apps/api/src/org/alta-tenant.controller.ts` es el único controlador `org`: no hay lectura de empresas, sucursales ni unidades por HTTP.

## 10. Brechas y ambigüedades

- **B1. API de administración inexistente.** Controladores de roles, perfiles, asignaciones y todas las lecturas (sección 7). El plan los da por hechos; el 06 y el 08 los empujaron al 16. Es la causa de que el spec no quepa.
- **B2. Sin permiso de lectura de usuarios ni de roles para quien invita.** La opción «Usuarios» exige `plat.usuario.invitar`; listar roles con `plat.rol.gestionar` (`TENANT`) deja fuera al admin de SUCURSAL que sí puede invitar (`SUCURSAL`).
- **B3. Step-up sin reintento.** `plat.asignacion.otorgar` y `plat.asignacion.revocar` son sensibles; ante `MFA_REQUERIDA` el 13 navega a `/auth/mfa?returnUrl` y no reintenta: el formulario de asignación se pierde. Opciones: chequear `mfa_vigente` de `mi-contexto` antes de abrir la acción y mandar primero a MFA, o guardar borrador.
- **B4. Longitud del motivo.** SRS 5-300; back 08 4-300 (por «Cese», TR-CA-039); `confirmarDestructiva` del 15 exige 10 fijo. Con 10, TR-CA-039 no se puede reproducir en UI. Requiere que el 15 acepte la longitud mínima como opción o baje a 4 (no se toca desde aquí; el 15 está en implementación).
- **B5. Selector de alcance sin datos.** `mi-contexto` da sucursales del actor con `empresa_id` pero sin nombre de empresa ni unidades; TR-CA-036 necesita la unidad «CAJA-02». Falta una lectura org.
- **B6. Solape con 17b.** Lib `admin-cliente`, `admin.routes.ts`, `app.routes.ts` y la lectura org (sección 6).
- **B7. `/admin/asignaciones`** está en el menú pero la estructura pone las asignaciones dentro del detalle de usuario. Decidir si es una pantalla propia o redirige.
- **B8. "Editar" rol (RF-011)**: no hay caso de uso para renombrar rol o perfil, ni inactivar perfil.
- **B9. Rol predefinido vs propio en la lectura**: confirmar en el 06 cómo se marca (`tenant_id` nulo o `predefinido`) para pintar solo lectura (032).
- **B10. RF-010** no es del 16 (14). APP-05 vs APP-02 en el SRS lo confirma.
- **B11. Embebible (RNF-122)**: el SRS pide que las rutas se monten en cualquier `<cod>-backoffice` con sus tokens; hoy solo existe `plataforma-admin`. Basta con no fijar colores y exportar `ADMIN_ROUTES`; el montaje en SazónPOS es del 26.
- **B12. GWT de UI**: ninguno de los 15 GWT cubre listas, filtros, reenvío, suspender/reactivar, step-up ni responsivo (tabla de la sección 3).
- **B13. Versión**: SRS dice Angular 19, estructura 22; el proyecto va en 21.

## 11. Preguntas candidatas para la Fase 2 de /spec

- **P1. ¿Cómo se recorta a 10 h?** (Partir en dos specs verticales, cada uno con su API y su UI: **16a `admin-usuarios-asignaciones`** (U-03: lecturas de miembros, `POST /asignaciones`, lectura de roles/perfiles asignables, lectura org para el alcance, lib `admin-cliente` y pantallas de usuarios; ~10-11 h) y **16b `admin-roles-perfiles`** (U-04: controladores de roles y perfiles, catálogo de permisos en árbol, editor; ~7-9 h). Alternativa más barata si se queda en uno: perfiles (RF-012, Should) fuera, sin pantalla `/admin/asignaciones`, alcance solo TENANT y SUCURSAL (sin unidades, deja TR-CA-036 en back); ~12-13 h, sigue pasando. El 15 ya pasó el tope por decisión del usuario; preguntar.)
- **P2. ¿Permisos de lectura?** (Reusar los existentes para no tocar el manifiesto: lista y detalle de miembros con `plat.usuario.invitar`; roles y perfiles asignables con `plat.usuario.invitar` o `plat.asignacion.otorgar`; gestión con `plat.rol.gestionar` / `plat.perfil.gestionar`. Alternativa limpia: `plat.usuario.consultar` en manifiesto 1.6.0 y sumarlo a `PLAT_ADMIN_SEGURIDAD` y `PLAT_PROPIETARIO`.)
- **P3. ¿Cliente HTTP generado desde OpenAPI (`plataforma/data-access`) o servicios a mano?** (A mano en `admin-cliente/services/*.cliente.ts`, como `InvitacionCliente` del 14, con mapeo snake_case → camelCase; el generador OpenAPI es un spec aparte. Evita crear otra lib que el 17b también tocaría.)
- **P4. ¿Step-up en acciones sensibles?** (Antes de abrir otorgar/suspender/finalizar/revocar, si `mfa_vigente` es falso, avisar y llevar a `/auth/mfa?returnUrl=<pantalla>`; sin reintento automático, como decidió el 13. Si igual llega `MFA_REQUERIDA`, el interceptor del 13 navega; el formulario de asignación es corto, se acepta perderlo.)
- **P5. ¿Quién crea `admin-cliente` y la lectura org?** (El 16, con `admin.routes.ts` exportando `ADMIN_ROUTES` y montado en `plataforma-admin` dentro de `rutasDelShell`. Lectura org mínima `GET /v1/org/estructura` en el 16; el 17b la reutiliza y agrega el CRUD. 16 y 17b en serie, no en paralelo.)
- **P6. ¿Motivo mínimo?** (Pedir al 15 un parámetro `longitudMinimaMotivo` en `OpcionesConfirmacionDestructiva` y usar 4 en el 16 para alinearse con el back y TR-CA-039; si no, documentar 039 como solo back.)
- **P7. ¿`/admin/asignaciones`?** (Redirigir a `/admin/usuarios`: las asignaciones se gestionan en el detalle del miembro, como dice la estructura. Quitar la opción del manifiesto requiere versión nueva; redirigir no.)
- **P8. ¿Paginación y búsqueda?** (Servidor, porque `vit-tabla` ya lo soporta: `pagina`, `tamano` (20), `orden`, `busqueda` por nombre o correo (ILIKE), `estado`. Roles y perfiles: lista completa sin paginar (pocos por tenant).)
- **P9. ¿Pruebas y evidencia?** (Back: integración HTTP con supertest de cada ruta nueva y de 031-038 por HTTP, aislamiento entre tenants en las lecturas (0 filas cruzadas, RNF-010). Front: Vitest + TestBed zoneless con `HttpTestingController` para los 15 GWT en su parte de UI y los propuestos. Verificación en navegador con el MCP `playwright` contra Supabase dev: invitar, asignar, finalizar con «Cese», copiar un rol; sin navegador se declara como no probado. RNF-018 en 360/768/1280 px; axe (RNF-122) solo si cabe.)
