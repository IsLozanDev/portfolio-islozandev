# Contexto para el spec 17c · admin-org-cliente

Paquete de contexto (no es el spec). Fuentes: `docs/roadmap-specs.md`, specs `03`, `06`, `12`, `13`, `14` y `15` (este último en implementación), `docs/spec-context/03-org-dominio-y-alta-tenant.md`, `15-shell-y-ui.md`, `16a-usuarios-asignaciones.md`, `17a-org-http.md` y `17b-consola-plataforma.md`, SRS xlsx (hojas Aplicaciones, Actores, Reglas de negocio, RF, Criterios GWT, RNF), plan docx (secciones 6.1 y 7), `3_plan.json`, `2_Estructura/estructura_frontend.txt`, `1_Mermaid/PL-08`, y el código actual de `apps/` y `libs/`. Ruta base del plan: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 1. Alcance y límites con otros specs

- Roadmap: spec 17c `admin-org-cliente`, cubre **U-05** (RF 002-004) y **U-06** (app admin cliente con sesión compartida), solo front. 7 h; depende de **16a** y **17a**. Ola 6: después del 16a (comparte `libs/plataforma/admin-cliente`), en paralelo con el 16b.
- En el plan, U-05 «Empresas, sucursales y unidades operativas» (4 h, Front, Admin cliente, sprint 5, R1) y U-06 «App plataforma-admin autónoma (para SazónPOS) con sesión compartida» (2 h, Front, Admin cliente, sprint 5) van juntas y tratan de la misma app.
- Límite con el **17a**: el 17a deja los controladores `/v1/org/empresas`, `/sucursales`, `/unidades`, los listados y los permisos y opciones de menú en el manifiesto. Este spec no escribe backend ni toca el manifiesto.
- Límite con el **16a**: el 16a crea `libs/plataforma/admin-cliente`, su archivo de rutas y el montaje en `plataforma-admin`. Este spec agrega `organizacion/` y sus rutas.
- Límite con el **16b**: los dos agregan carpetas y rutas a `admin-cliente`; conflicto de líneas.
- Límite con el **17b**: U-06 se prueba entre `consola.` (app del 17b) y `admin.`.
- Límite con el **03**: casos de uso y reglas (`RegistrarEmpresa`, `EditarEmpresa`, `RegistrarSucursal`, `EditarSucursal`, `InactivarSucursal`, `MarcarSucursalPrincipal`, `RegistrarUnidad`, `EditarUnidad`, `InactivarUnidad`); la UI refleja sus decisiones.
- Límite con el **15**: consume `rutasDelShell`, `vit-tabla`, `vit-filtros`, `vit-acciones-formulario`, `vit-estado-vacio`, `vit-cargando`, `AvisosService` (`confirmarDestructiva`) y `erroresHttpInterceptor`. No los modifica.
- Fuera de alcance: backend (17a), inactivar empresa (decisión del 03), padrón RUC y advertencia NO HABIDO (TR-IDN, R2; TR-CA-006 diferido), catálogos `UBIGEO` y `TIPO_UNIDAD` (19a: aquí lista cerrada y formato), parámetros, series y catálogos propios (D-05), visor de auditoría (sección 9), agrupar el selector de sucursales por empresa (el 15 lo dejó fuera), montaje real en SazónPOS (spec 23/26).

## 2. Requisitos funcionales

Aplicación SRS: **APP-02** «Administración del cliente (embebible)»: librería Nx `plataforma-admin-cliente`, rutas lazy en `<cod>-backoffice`; usuario: administrador del cliente (ACT-03). Plan 6.1, R1, columna `plataforma-admin / admin-cliente`: «... empresas, sucursales, unidades ...».

| ID | Nombre | Permiso | Prioridad | Fase |
|---|---|---|---|---|
| TR-RF-002 | Registrar empresa del tenant | plat.empresa.crear | Must | MVP |
| TR-RF-003 | Registrar sucursal (establecimiento) | plat.sucursal.gestionar | Must | MVP |
| TR-RF-004 | Registrar unidad operativa | plat.unidad.gestionar | Must | MVP |

U-06 no tiene RF (`rf: "—"`). Su base es ADR-31 («la app plataforma-admin comparte sesión por cookie de dominio»); el spec 13 cita ADR-29, que no corresponde.

**TR-RF-002** (admin del cliente, alcance TENANT; tenant ACTIVO o PRUEBA). Reglas 001, 002, 003, 019. RNF 010, 007. Flujo: ingresa RUC; valida formato y consulta padrón (TR-IDN, R2: no hay); muestra razón social, estado y condición; completa nombre comercial; crea empresa y sucursal principal 0000; publica `empresa.creada`. Datos: `ruc` 11, único por tenant; `razon_social` 1-200 (del padrón; aquí manual); `nombre_comercial` 0-150; `direccion_fiscal` 0-250; `ubigeo` 6 dígitos. El 03 agregó `EditarEmpresa`.

**TR-RF-003** (admin del cliente; empresa activa; tope de sucursales no alcanzado). Reglas 001, 003, 006. RNF 010, 027. Flujo: elige empresa; ingresa código, nombre, establecimiento SUNAT, dirección y ubigeo; valida unicidad, formato y límite del plan; guarda y publica `sucursal.creada`. La descripción dice «registrar, editar e inactivar». Datos: `codigo` 1-20 único por empresa; `nombre` 3-150; `codigo_establecimiento_sunat` 4 dígitos opcional; `direccion` 0-250; `ubigeo`; `telefono` 0-30; `zona_horaria` IANA (por defecto `America/Lima`); `es_principal`.

**TR-RF-004** (admin del cliente). Reglas 004, 001. RNF 010, 027. Flujo: elige sucursal y tipo; ingresa código, nombre, padre opcional y atributos; valida pertenencia (RN-004) y unicidad por empresa + tipo + código; guarda y publica `unidad.creada`. Datos: `tipo` obligatorio; `codigo` 1-20; `nombre` 3-150; `sucursal_id` obligatorio salvo `ALMACEN`; `padre_id` opcional; `atributos` JSON (impresora, capacidad, piso).

## 3. Criterios GWT (tal cual)

**TR-CA-004** · TR-RF-002 · Registro con datos del padrón · Positivo
DADO QUE el administrador del cliente tiene alcance TENANT en «grupo-sabores» · CUANDO registra la empresa con RUC 20512345678 · ENTONCES la empresa queda activa con la razón social devuelta por el padrón y su sucursal principal 0000

**TR-CA-005** · TR-RF-002 · RUC ya registrado en el tenant · Negativo
DADO QUE la empresa con RUC 20512345678 ya existe en el tenant · CUANDO intenta registrarla nuevamente · ENTONCES el sistema rechaza la operación con «La empresa ya está registrada en este tenant»

**TR-CA-006** · TR-RF-002 · Contribuyente no habido · Borde
DADO QUE el padrón devuelve condición NO HABIDO para el RUC 20498765432 · CUANDO el actor confirma el registro · ENTONCES el sistema registra la empresa y muestra la advertencia «Contribuyente NO HABIDO: no podrá emitir comprobantes hasta regularizar»

**TR-CA-007** · TR-RF-003 · Nueva sucursal en Arequipa · Positivo
DADO QUE la empresa «Sabores del Sur SAC» tiene 1 sucursal y su plan permite 3 · CUANDO registra la sucursal «Cayma» con establecimiento 0002 y ubigeo 040103 · ENTONCES la sucursal «Cayma» queda activa y aparece en el selector de sucursales

**TR-CA-008** · TR-RF-003 · Límite de sucursales del plan · Negativo
DADO QUE la suscripción REST del tenant tiene limite_sucursales = 2 y ya existen 2 sucursales activas · CUANDO intenta registrar una tercera sucursal · ENTONCES el sistema rechaza con «Su plan permite 2 sucursales; amplíe su plan»

**TR-CA-009** · TR-RF-003 · Segunda sucursal principal · Borde
DADO QUE la empresa ya tiene la sucursal principal «Centro» · CUANDO marca como principal la sucursal «Cayma» · ENTONCES el sistema traslada la marca de principal a «Cayma» y la retira de «Centro» en la misma operación

**TR-CA-010** · TR-RF-004 · Caja en sucursal · Positivo
DADO QUE la sucursal «Cayma» existe · CUANDO registra la unidad tipo CAJA con código «CAJA-01» · ENTONCES la unidad «CAJA-01» queda activa en la sucursal «Cayma»

**TR-CA-011** · TR-RF-004 · Consultorio sin sucursal · Negativo
DADO QUE el actor no selecciona sucursal · CUANDO intenta registrar una unidad tipo CONSULTORIO · ENTONCES el sistema rechaza con «Solo los almacenes pueden registrarse sin sucursal»

**TR-CA-012** · TR-RF-004 · Almacén central de empresa · Borde
DADO QUE la empresa «Librería Amauta EIRL» existe · CUANDO registra una unidad tipo ALMACEN sin sucursal · ENTONCES el almacén queda registrado a nivel de empresa y visible para todas sus sucursales

Notas:
- El 03 los prueba en dominio e integración (CA-004 adaptado, CA-006 diferido); el 17a, por HTTP. Aquí se prueban en la UI.
- RUC de prueba del 03: 20512345671 (no 20512345678, que no pasa módulo 11) y 20498765433.
- CA-004 «razón social devuelta por el padrón»: sin padrón (R2), la razón social se escribe a mano; queda adaptado como en el 03.
- CA-007 «aparece en el selector de sucursales»: el selector del 15 lee `sucursales` de `mi-contexto`. Un usuario con alcance TENANT ve la nueva sucursal si el cliente recarga el contexto tras el alta y si la caché de permisos (60 s, RNF-101) no la oculta (17a, brecha 4).
- CA-011: en la UI, el campo sucursal es obligatorio salvo para `ALMACEN`; la API repite la regla.

### GWT faltantes a proponer

- Lista de sucursales: DADO QUE «Sabores del Sur SAC» tiene «Centro» (principal) y «Cayma» · CUANDO el administrador abre sus sucursales · ENTONCES ve ambas con «Centro» marcada como principal y el establecimiento de cada una.
- Inactivar principal: DADO QUE «Centro» es la principal · CUANDO intenta inactivarla · ENTONCES ve «Marque otra sucursal como principal antes de inactivar esta» y la sucursal sigue activa.
- Inactivar con confirmación: DADO QUE «Cayma» no es principal · CUANDO la inactiva y confirma · ENTONCES deja de aparecer en el selector de sucursales.
- Sin permiso: DADO QUE el usuario no tiene `plat.sucursal.gestionar` · CUANDO abre sucursales · ENTONCES no ve las acciones de alta, edición ni inactivación, y la API responde 403 si las llama.
- Conflicto de versión: DADO QUE otro usuario editó la empresa · CUANDO guarda su edición · ENTONCES ve «Otro usuario modificó el registro; recargue» y no se pierde lo del otro.
- Unidad con padre: DADO QUE «SALON-1» existe en «Cayma» · CUANDO registra la mesa con padre «SALON-1» · ENTONCES la unidad queda bajo «SALON-1»; y un padre de otra empresa se rechaza.
- Sucursal nueva en el selector (precisa CA-007): tras registrar «Cayma», el selector la muestra sin cerrar sesión.
- U-06: DADO QUE Carmen ingresó en `consola.vitrina.test` · CUANDO abre `admin.vitrina.test` · ENTONCES entra sin volver a autenticarse; y al salir en una, la otra pide ingresar.
- U-06 retorno: una entrada profunda `/admin/usuarios?returnUrl=` con un origen fuera de la lista blanca no ofrece enlace de vuelta.

## 4. Reglas de negocio

- **TR-RN-001** jerarquía tenant → empresa (RUC) → sucursal → unidad; todo con `tenant_id`.
- **TR-RN-002** RUC módulo 11 (`validarRuc` de `libs/shared/util` en el cliente; el dominio lo repite).
- **TR-RN-003** una sola principal por empresa, establecimiento 0000 solo en la principal. Decisiones del 03 que la UI refleja: la principal no se puede inactivar («Marque otra sucursal como principal antes de inactivar esta»); al trasladar la principal la anterior queda sin establecimiento y hay que asignarle uno al editarla.
- **TR-RN-004** unidad en una sucursal, salvo `ALMACEN`.
- **TR-RN-005** tenant `SUSPENDIDO`: solo lectura. Con el hook actual, un tenant suspendido no llega en el token, así que el usuario no entra a la app; la UI no necesita un modo de solo lectura en R1.
- **TR-RN-006** tope de sucursales por tenant (17a).
- **TR-RN-007** permisos por alcance (17a, P2).
- **TR-RN-019** advertir NO HABIDO: R2.

## 5. RNF

- **TR-RNF-008** 409 de conflicto en la UI: «Otro usuario modificó el registro; recargue».
- **TR-RNF-021** inactivar sucursal o unidad con `confirmarDestructiva`. El 03 no guarda motivo de inactivación (P3). Si se pide motivo, default 10 (D1).
- **TR-RNF-122** (APP-02): sin colores fijos, rutas montables en otro backoffice.
- **TR-RNF-018** responsiva 360/768/1280 px, español de Perú; **TR-RNF-019** axe-core sin `critical`/`serious` (criterio propio, como el 15); **TR-RNF-020** < 1 h de capacitación (no se prueba en CI).
- **TR-RNF-014** inactividad y cierre: salir en una app cierra la otra (misma cookie).

## 6. U-06: app autónoma con sesión compartida

- SRS: APP-02 es una **librería** embebible; no prevé app propia. El plan agrega la app porque SazónPOS (otro repositorio, Angular de otra versión) no puede embeber la lib (ADR-31, PL-08: «menú Administración (misma cookie .dominio.pe)»).
- U-06 es la app del **cliente** (`plataforma-admin`), no la consola. El spec 14 la leyó como consola; esa lectura contradice el plan (brecha 1; no se edita el 14).
- Ya existe: `apps/plataforma-admin` (spec 14, tags `scope:app`, `type:app`, puerto 4200, proxy `/v1` → 3000), `ConfigAuth.dominioCookie?` y cookie `@supabase/ssr` con `domain` solo si se configura (spec 13). `environment.ts` de dev no define `dominioCookie`; `environment.prod.ts` está vacío.
- Trabajo (2 h): `dominioCookie` por ambiente (`.<dominio>` en staging y prod, sin valor en local); URLs de retorno de Supabase por subdominio (`/auth/callback`, `/auth/nueva-clave`); CORS de `apps/api` para `admin.` y `consola.`; entrada profunda desde otra app (`/admin/usuarios?returnUrl=`) y enlace de vuelta al origen con lista blanca de orígenes; salir en una app cierra la otra (misma cookie).
- CORS de `apps/api` es configuración, no backend de dominio; se mantiene aquí como en el plan.
- Verificación: SazónPOS no usa Supabase Auth hasta el spec 23 (CC-10). La sesión compartida solo se prueba entre `consola.` (17b) y `admin.` en subdominios hermanos, con un dominio local que acepte cookies de dominio padre (archivo hosts con `*.vitrina.test`; `localhost` no sirve).
- Riesgo: la cookie no es `httpOnly` (cliente de navegador). Con `domain=.<dominio>`, cualquier subdominio con XSS lee la sesión. Los sitios públicos de tenants (CMS, R3) no deben vivir bajo el mismo dominio padre.

## 7. Horas

| ID | Sprint | Horas | Tipo | Componente | RF | Descripción |
|---|---|---|---|---|---|---|
| **U-05** | 5 | 4 | Front | Admin cliente | TR-RF-002, 003, 004 | Empresas, sucursales y unidades operativas |
| **U-06** | 5 | 2 | Front | Admin cliente | — | App plataforma-admin autónoma (para SazónPOS) con sesión compartida |

Estimación (roadmap: 7 h):

| Pieza | h |
|---|---|
| UI en `admin-cliente/organizacion`: lista y formulario de empresas; lista por empresa, formulario, inactivar y marcar principal de sucursales; lista por sucursal, formulario e inactivar de unidades | 4 |
| U-06 (sesión compartida, CORS, retorno) | 2 |
| Verificación en navegador (incluye subdominios locales) | 0,5-1 |
| **Total** | **6,5-7** |

## 8. Estructura, endpoints y límites Nx

### Endpoints que consume (todos del 17a salvo `mi-contexto`)

| Pantalla | Endpoint | Permiso |
|---|---|---|
| Empresas: lista, alta, edición | `GET`/`POST /v1/org/empresas`, `PUT /v1/org/empresas/:id` | lectura, `plat.empresa.crear` |
| Sucursales: lista, alta, edición | `GET`/`POST /v1/org/empresas/:id/sucursales`, `PUT /v1/org/sucursales/:id` | lectura, `plat.sucursal.gestionar` |
| Sucursales: inactivar, principal | `POST /v1/org/sucursales/:id/inactivar`, `POST .../principal` | `plat.sucursal.gestionar` |
| Unidades: lista, alta, edición, inactivar | `GET /v1/org/unidades?...`, `POST /v1/org/unidades`, `PUT /v1/org/unidades/:id`, `POST .../inactivar` | lectura, `plat.unidad.gestionar` |
| Tipos de unidad | — | `TIPOS_UNIDAD` repetida en el front hasta 19a |
| Selector tras alta de sucursal | `GET /v1/seg/mi-contexto` | sin `@Permiso` |

`tipo_usuario` no interviene: la autorización es por permiso y alcance en el tenant del token (D2).

### Libs y límites Nx

```
apps/plataforma-admin/                    scope:app, type:app (spec 14); rutas hijas del layout del 15
  src/environments/ · app.config.ts       dominioCookie por ambiente (U-06)
libs/plataforma/admin-cliente/            scope:plataforma, type:feature  (la crea el 16a)
  src/lib/pages/empresas/ · sucursales/ · unidades/ (lista y formulario por carpeta)
  src/lib/services/organizacion.cliente.ts   HttpClient
  src/lib/models/                         DTO y mapeos
apps/api/src/main.ts (o donde viva CORS)  orígenes admin. y consola. (U-06)
```

- `type:feature` usa `shared/ui`, `shared/auth` y `shared/util`; no importa `libs/plataforma/org` (`type:backend`). DTO en `models/` (P4).
- Estructura por tipo de artefacto (CLAUDE.md), sin `template` inline.
- Rutas con prefijo `/admin`: `/admin/empresas`, `/admin/empresas/:id/sucursales`, `/admin/unidades` con filtro por sucursal; opciones de menú en el módulo `organizacion` que declara el 17a.
- Conflictos: archivo de rutas de `admin-cliente` con el 16b (líneas). `apps/plataforma-admin` (`environments`, `app.config.ts`) no lo toca otro spec de la ola tras el 16a.

## 9. Visor de auditoría

**No entra.** El paquete 20 lo deja en «spec 17 / U-06 si aplica», pero ni U-05 ni U-06 son un visor, E-01 no tiene historia de UI y el backend de auditoría (spec 20) no está implementado. Por función pertenece a `admin-cliente` (APP-02 lista «auditoría»; RF-086, TR-CA-214 filtra por sucursal), así que irá en un spec propio de UI después del 20, en esta misma lib. La consola (17b) tampoco lo lleva: el plan pone allí solo «integridad de auditoría», R2/R3.

## 10. Decisiones tomadas

- **D1. Longitud del motivo** (decisión del usuario): ORG valida 10-500 (`tenant.ts`), SEG 4-300 (`texto.ts`). Aquí el back es ORG: si se pide motivo, `confirmarDestructiva` con el default 10, sin `longitudMinimaMotivo`.
- **D2. Operador vs. cliente** (decisión del usuario): por permiso (`OPERADOR_REQUERIDO`, 17a), no por `tipo_usuario`. El operador no administra organizaciones de clientes desde aquí.
- **D3. División** (roadmap): 17c = U-05 + U-06, solo front; el back está en el 17a; va después del 16a.

## 11. Brechas restantes

1. El spec 14 leyó `plataforma-admin` como consola y el 13 cita ADR-29 donde corresponde ADR-31. No se corrigen aquí; anotado.
2. CA-007 depende de recargar `mi-contexto` y de la caché de permisos; nadie invalida al crear una sucursal.
3. `ubigeo` sin catálogo (19a): la UI solo valida 6 dígitos.
4. CA-004 y CA-006 suponen padrón (R2).
5. La sucursal que deja de ser principal queda sin establecimiento: la UI debe pedirlo al editarla.
6. `atributos` JSON de la unidad sin esquema por tipo.
7. U-06 no se puede probar con SazónPOS hasta el spec 23; solo entre apps de Vitrina con hosts locales.
8. Las URLs de retorno de Supabase dev están registradas para `127.0.0.1:4200`; los subdominios locales necesitan alta en el panel (manual).
9. Inactivar sucursal o unidad no guarda motivo (03).

## 12. Preguntas candidatas para la Fase 2 de /spec

- **P1. ¿Listas paginadas?** (Sí para unidades; empresas y sucursales con el mismo contrato `{ items, total }` de `vit-tabla`.)
- **P2. ¿CA-007 y la caché?** (Tras alta, edición o inactivación de sucursal, la página llama a `SesionService.cargarContexto()`; si `sucursales_accesibles` pasa por la caché de 60 s, aceptar el retraso.)
- **P3. ¿Motivo al inactivar?** (Confirmación sí; motivo no, porque el 03 no lo guarda y TR-RNF-021 habla de anular, eliminar y reembolsar.)
- **P4. ¿Dónde viven los DTO del front?** (En `models/` de `admin-cliente`; `shared/contracts` está vacía y su uso no está decidido.)
- **P5. ¿Ubigeo y atributos?** (Ubigeo como texto de 6 dígitos hasta 19a; atributos con tres campos fijos opcionales, sin editor JSON.)
- **P6. ¿Pruebas y evidencia?** (Vitest de páginas; Playwright en 360/768/1280 con CA-004, 005, 007 a 012 y los propuestos; sesión compartida entre `consola.vitrina.test` y `admin.vitrina.test`; axe-core; datos de prueba borrados al final.)
