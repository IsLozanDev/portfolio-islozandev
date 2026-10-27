# Contexto para el spec 16b · roles-perfiles

Paquete de contexto (no es el spec). Fuentes: `docs/roadmap-specs.md`, `specs/06-seg-autorizacion.md`, `specs/13-auth-cliente-angular.md`, `specs/15-shell-y-ui.md` (aprobado, en implementación), `docs/spec-context/15-shell-y-ui.md` y `16a-usuarios-asignaciones.md`, SRS xlsx (hojas Aplicaciones, Reglas de negocio, RF, Criterios GWT, RNF), `3_plan.json`, `2_Estructura/estructura_frontend.txt`, código del repo (`libs/plataforma/seguridad`, manifiesto PLAT). Ruta base del plan: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 1. Alcance y límites con otros specs

- Roadmap: spec 16b `roles-perfiles`, cubre **U-04** (RF 011, 012) y sus controladores de roles y perfiles. 7-9 h; depende de **16a**. Ola 6: después del 16a, en paralelo con el 17c (los dos sobre `libs/plataforma/admin-cliente`).
- Plan: U-04 (sprint 5, 4 h, Front, R1) "Roles y perfiles de puesto", RF 011, 012. Las 4 h son solo front. El spec 06 dejó explícito: "Controladores de administración `/v1/seg/roles`, `/perfiles` y `/asignaciones` (spec 16)". `/asignaciones` lo hace el 16a; roles y perfiles, este spec.
- Aplicación SRS: **APP-02** "Administración del cliente (embebible)".
- **Límite con el 06** (seg-autorizacion, implementado): casos de uso `CrearRol`, `CopiarRol`, `CambiarPermisosRol`, `InactivarRol`, `CrearPerfil`, `CambiarRolesPerfil` existen y están probados sin controlador. El 16b los expone por HTTP; no toca dominio ni SQL salvo lecturas nuevas.
- **Límite con el 16a**: el 16a crea `libs/plataforma/admin-cliente`, el cliente HTTP base, las rutas montadas en `plataforma-admin` y la lectura de roles y perfiles asignables. El 16b agrega `roles/` y `perfiles/` a la lib y sus entradas de rutas, y crea el catálogo de permisos en árbol (`GET /v1/seg/catalogo/{producto}`, `GET /v1/seg/productos-contratados`) que usa su editor.
- **Límite con el 13 y el 15**: `permisoGuard`, `*siPermiso`, `vit-tabla`, `vit-acciones-formulario`, `mensajeValidacion`, `vit-estado-vacio`, `AvisosService.confirmarDestructiva` (con la opción `longitudMinimaMotivo` que agrega el 16a). No los modifica.
- **Límite con el 17c**: comparten `admin-cliente` y su archivo de rutas; conflicto de líneas, no de diseño.
- Fuera de alcance: usuarios y asignaciones (16a), organización (17c), renombrar rol o perfil, inactivar perfil y reactivar rol (no hay caso de uso, B2).

## 2. Requisitos funcionales

| ID | Nombre | Permiso | Prioridad | Fase | Historia | Back |
|---|---|---|---|---|---|---|
| TR-RF-011 | Gestionar roles propios del tenant | `plat.rol.gestionar` | Must | MVP | U-04 | 06, **sin ruta** |
| TR-RF-012 | Gestionar perfiles de puesto | `plat.perfil.gestionar` | **Should** | MVP | U-04 | 06, **sin ruta** |

Ambos MOD-02 TR-SEG, APP-02, proceso TR-P02, actor "Administrador del cliente".

**TR-RF-011** (roles). Descripción: crear, copiar desde predefinido, editar e inactivar roles propios de un producto, seleccionando permisos del catálogo del producto; los predefinidos no son editables. Precond.: suscripción vigente al producto del rol. Flujo: 1 elige producto y crea o copia; 2 marca permisos del **árbol módulo → opción → permiso**; 3 valida que los permisos sean del producto; 4 guarda, invalida caché y registra auditoría. Datos: producto_codigo (obligatorio); codigo (3-50, único por tenant); nombre (3-100); permisos[] (códigos del producto); activo. Reglas TR-RN-007, 009. RNF 101, **122**, 013. Salida: rol propio disponible para asignación.

**TR-RF-012** (perfiles). Agrupar roles de uno o varios productos contratados para asignar el acceso de un puesto en una operación. Precond.: existen roles activos de productos contratados. Flujo: 1 crea perfil con código y nombre; 2 selecciona uno o más roles; 3 guarda y recalcula permisos de quienes lo tienen. Datos: codigo (3-50, único por tenant); nombre (3-100); roles[] (uuid de roles activos). Regla TR-RN-007. RNF 101, 027. Es **Should**: candidato a recorte.

## 3. Criterios GWT (tal cual; todos "Pendiente" en el SRS)

**TR-RF-011**
- **TR-CA-031** · Copia de rol predefinido · Positivo. DADO QUE existe el rol predefinido «REST_MOZO» · CUANDO copia el rol como «Mozo terraza» y quita el permiso rest.pedido.anular · ENTONCES el rol «Mozo terraza» queda activo sin el permiso de anular
- **TR-CA-032** · Edición de rol predefinido · Negativo. DADO QUE el actor abre el rol predefinido «REST_CAJERO» · CUANDO intenta quitarle un permiso · ENTONCES el sistema indica «Los roles predefinidos no se editan; cree una copia»
- **TR-CA-033** · Inactivar rol en uso · Borde. DADO QUE el rol «Mozo terraza» está asignado a 4 usuarios · CUANDO lo inactiva · ENTONCES el sistema pide confirmación indicando los 4 usuarios afectados y, al confirmar, sus permisos dejan de estar vigentes

**TR-RF-012**
- **TR-CA-034** · Perfil multiproducto · Positivo. DADO QUE el tenant tiene LIB y ECO contratados · CUANDO crea el perfil «Encargado de tienda» con los roles LIB_VENDEDOR y ECO_GESTOR_PEDIDOS · ENTONCES el perfil queda disponible y al asignarlo otorga permisos de ambos productos
- **TR-CA-035** · Rol de producto no contratado · Negativo. DADO QUE el tenant no tiene CLI contratado · CUANDO intenta agregar el rol CLI_RECEPCION al perfil · ENTONCES el sistema no muestra ni acepta roles de productos no contratados

Total: 5 GWT. La parte de dominio ya está cerrada en el 06 (031-035). Aquí se cierran por HTTP y por UI.

Notas sobre los GWT en UI:
- 032: en UI el rol predefinido se abre en solo lectura con botón «Copiar»; el mensaje exacto lo da la API (`ROL_PREDEFINIDO`, verificar código en 06) si se llama igual.
- 033: `InactivarRol` sin `confirmado` devuelve `{ requiereConfirmacion: true, afectados: N }`; la UI muestra N en `confirmarDestructiva` y repite con `confirmado`. `InactivarRol` no recibe motivo; si el diálogo lo pide, es solo de UI (B5).
- 034: «al asignarlo otorga permisos de ambos productos» se prueba con la asignación del 16a.
- 035: la UI no lista roles de productos no contratados (filtro en la lectura); la API rechaza `PRODUCTO_NO_CONTRATADO` si llega igual.

### GWT faltantes a proponer

| Propuesto | RF | Caso |
|---|---|---|
| Editar rol propio | 011 | Cambiar permisos de «Mozo terraza» se refleja en el siguiente `mi-contexto` del afectado (≤ 5 s) |
| Rol sin uso | 011 | Inactivar un rol sin asignaciones no pide conteo |
| Árbol de permisos | 011 | El editor agrupa módulo → opción → permiso y marca los sensibles |
| Perfil sin roles | 012 | Guardar sin roles: «Seleccione al menos un rol» |
| Acciones sin permiso | 011/012 | Actor sin `plat.rol.gestionar` no ve la opción «Roles»; la ruta va a 403 |
| Responsivo | todos | Roles, editor y perfiles usables a 360, 768 y 1280 px (TR-RNF-018) |

## 4. Reglas TR-RN y RNF

- **TR-RN-006**: filtrar productos no contratados en roles y perfiles.
- **TR-RN-007**: `producto.recurso.accion` por alcance. `plat.rol.gestionar` es `TENANT`.
- **TR-RN-009**: el árbol marca los permisos sensibles; un rol con sensibles exige MFA al otorgante al asignarlo (16a).
- RNF que aplican:
  - **TR-RNF-021**: confirmación explícita al inactivar rol (033).
  - **TR-RNF-122** (APP-02, Should): sin colores fijos, solo tokens de `shared/ui`; rutas montables en otro backoffice.
  - **TR-RNF-101**: efecto de cambios en ≤ 5 s (versión de seguridad del 06).
  - **TR-RNF-013**: auditoría por `seg.evento_seguridad` en back.
  - **TR-RNF-018**: responsiva ≥ 360 px, español de Perú.
  - **TR-RNF-027** (RF-012): configuración por tenant sin código.
  - **TR-RNF-020**: < 1 h de capacitación (fuera de CI).

## 5. Historias del backlog y horas

| ID | Sprint | Comp. | Horas | Tipo | RF | Descripción |
|---|---|---|---|---|---|---|
| **U-04** | 5 | Admin cliente | 4 | Front | TR-RF-011, 012 | Roles y perfiles de puesto |

**Estimación** (roadmap: 7-9 h):

| Bloque | h |
|---|---|
| Back: controladores de roles (listar, detalle, crear, copiar, cambiar permisos, inactivar) | 2 |
| Back: controladores de perfiles (listar, crear, cambiar roles) | 1 |
| Back: catálogo de permisos en árbol por producto y productos contratados | 1 |
| Front U-04: roles (lista, editor de árbol, copiar, inactivar) y perfiles | 3,5-4 |
| Verificación en navegador | 0,5 |
| **Total** | **8-8,5** |

Si se pasa, perfiles (RF-012, Should) es el recorte natural.

## 6. Estructura de código front y límites Nx

```
libs/plataforma/admin-cliente/     (la crea el 16a)
  src/lib/roles/                   lista · editor de permisos agrupados por módulo · perfiles de puesto ← 16b (U-04)
```

- Estructura interna sugerida (`CLAUDE.md`, "Estructura de libs Angular"): `pages/roles-lista`, `pages/rol-editor`, `pages/perfiles-lista`, `pages/perfil-editor`, `components/arbol-permisos`, `services/roles.cliente.ts`, `services/perfiles.cliente.ts`, `models/*.ts`.
- Rutas del menú ya declaradas en el manifiesto PLAT `1.5.0`, módulo «Seguridad»: `/admin/roles` (`plat.rol.gestionar`) y `/admin/perfiles` (`plat.perfil.gestionar`). El 16b las registra con `permisoGuard`.
- Límites Nx: `type:feature` → feature, ui, data-access, util; `scope:plataforma` no importa de productos.
- Conflictos: archivo de rutas de `admin-cliente` con el 17c (líneas). No toca el manifiesto.

## 7. Endpoints backend

**Faltan** (los crea el 16b):

| Pantalla | Ruta propuesta | Caso de uso | Permiso |
|---|---|---|---|
| Roles: lista y detalle | `GET /v1/seg/roles`, `GET /v1/seg/roles/{id}` (con permisos y `predefinido`) | Lectura nueva | `plat.rol.gestionar` |
| Roles: crear / copiar | `POST /v1/seg/roles`, `POST /v1/seg/roles/{id}/copia` | `CrearRol`, `CopiarRol` | `plat.rol.gestionar` |
| Roles: editar permisos | `PUT /v1/seg/roles/{id}/permisos` | `CambiarPermisosRol` | `plat.rol.gestionar` |
| Roles: inactivar | `POST /v1/seg/roles/{id}/inactivar` `{ confirmado }` | `InactivarRol` (devuelve `requiereConfirmacion`, `afectados`) | `plat.rol.gestionar` |
| Perfiles | `GET /v1/seg/perfiles`, `POST /v1/seg/perfiles`, `PUT /v1/seg/perfiles/{id}/roles` | `CrearPerfil`, `CambiarRolesPerfil` | `plat.perfil.gestionar` |

Nuevos en el 16b: `GET /v1/seg/catalogo/{producto}` y `GET /v1/seg/productos-contratados` (árbol del editor).

Lecturas nuevas con TypeORM (regla 11 de `CLAUDE.md`); los puertos de repositorio no tienen métodos de listado.

## 8. Código base relacionado

- `libs/plataforma/seguridad/src/application/rol.casos-de-uso.ts` y `perfil.casos-de-uso.ts`; patrón de controlador y DTO en `interface/membresias.controller.ts` y `membresias.http.ts`; errores `{ codigo, mensaje }`.
- Ningún diagrama PL cubre roles ni perfiles en UI.

## 9. Decisiones tomadas

- **D1. Longitud del motivo** (decisión del usuario, ver 16a D1): SEG 4-300, ORG 10-500; `confirmarDestructiva` con `longitudMinimaMotivo`. `InactivarRol` no recibe motivo, así que no aplica salvo que el diálogo lo pida (B5).
- **D2. Operador vs. cliente** (decisión del usuario): por permiso (`OPERADOR_REQUERIDO`, 17a), no por `tipo_usuario`. No afecta al 16b.
- **D3. División** (roadmap): 16b = U-04 con sus controladores; depende del 16a.
- **D4. Listas** (P8 del paquete 16): roles y perfiles sin paginar (pocos por tenant).

## 10. Brechas restantes

- **B1. Controladores de roles y perfiles inexistentes** (sección 7); duplican las 4 h del plan.
- **B2. "Editar" rol (RF-011)**: no hay caso de uso para renombrar rol o perfil, ni inactivar perfil, ni reactivar rol.
- **B3. Rol predefinido vs propio en la lectura**: confirmar en el 06 cómo se marca (`tenant_id` nulo o `predefinido`) para pintar solo lectura (032).
- **B4. Misma ruta, dos permisos**: la lectura de roles para el selector del 16a (`plat.usuario.invitar`) y la de gestión (`plat.rol.gestionar`); `@Permiso` admite un solo código (16a B11).
- **B5. Motivo al inactivar rol**: TR-RNF-021 pide motivo en acciones destructivas, pero `InactivarRol` no lo guarda. Pedirlo solo en UI o no pedirlo.
- **B6. GWT de UI**: los 5 GWT no cubren editor, árbol, perfil vacío ni responsivo (sección 3).

## 11. Preguntas candidatas para la Fase 2 de /spec

- **P1. ¿Perfiles dentro o fuera?** (Dentro si las horas dan; es Should y el recorte natural.)
- **P2. ¿Motivo al inactivar rol?** (Confirmación con el conteo de afectados; sin motivo, como el caso de uso.)
- **P3. ¿Pruebas y evidencia?** (Supertest de cada ruta y de 031-035 por HTTP, aislamiento entre tenants; Vitest de páginas y del árbol; Playwright contra Supabase dev: copiar «REST_MOZO» como «Mozo terraza», inactivar con conteo, perfil multiproducto; 360/768/1280 px.)
