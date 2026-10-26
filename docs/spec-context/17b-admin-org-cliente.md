# Contexto para el spec 17b · admin-org-cliente

Paquete de contexto (no es el spec). Fuentes: `docs/roadmap-specs.md`, specs `03`, `06`, `12`, `13`, `14` y `15` (este último en implementación), `docs/spec-context/03-org-dominio-y-alta-tenant.md`, `15-shell-y-ui.md` y `17a-consola-plataforma.md`, SRS xlsx (hojas Aplicaciones, Actores, Reglas de negocio, RF, Criterios GWT, RNF), plan docx (secciones 6.1 y 7), `3_plan.json`, `2_Estructura/estructura_frontend.txt`, `1_Mermaid/PL-08`, y el código actual de `apps/` y `libs/`. Ruta base del plan: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 1. Alcance y límites con otros specs

- Roadmap: parte del spec 17 original (O-04, U-05, U-06 = 11 h). Encargo: **17b = U-05**. En el plan, **U-05** es «Empresas, sucursales y unidades operativas» (TR-RF-002, 003, 004), 4 h, Front, componente «Admin cliente», sprint 5, R1. Depende de **15** (shell y ui), **03** (dominio org) y **16** (crea `libs/plataforma/admin-cliente`; ver sección 8). El **12** no es dependencia técnica de U-05; solo sirve para tener en dev un tenant con propietario que pruebe la UI.
- Propuesta de `17a-consola-plataforma.md` (P1): mover **U-06** (app `plataforma-admin` autónoma con sesión compartida, 2 h) a este spec. En el plan U-06 es «Admin cliente», va en el sprint 5 con U-05 y trata de la misma app. Si se adopta, la sección 6 del paquete 17a aplica aquí y este spec depende también del 17a (para probar la cookie compartida entre `consola.` y `admin.`).
- Límite con el **03**: el 03 dejó los casos de uso completos (`RegistrarEmpresa`, `EditarEmpresa`, `RegistrarSucursal`, `EditarSucursal`, `InactivarSucursal`, `MarcarSucursalPrincipal`, `RegistrarUnidad`, `EditarUnidad`, `InactivarUnidad`) con sus pruebas, pero **sin HTTP** («Controladores `/v1/org/*` ... spec 07 en adelante; consola en el spec 17»). Nadie los expuso después. Este spec hace los controladores y la UI.
- Límite con el **15**: consume `rutasDelShell`, `vit-tabla` (paginación y orden del lado del servidor), `vit-filtros`, `vit-acciones-formulario`, `vit-estado-vacio`, `vit-cargando`, `AvisosService` (`confirmarDestructiva`) y `erroresHttpInterceptor`. No los modifica.
- Límite con el **16**: comparte app y lib (sección 8).
- Fuera de alcance: inactivar empresa (decisión del 03), padrón RUC y advertencia NO HABIDO (TR-IDN, R2; TR-CA-006 diferido), catálogos `UBIGEO` y `TIPO_UNIDAD` (19a: aquí lista cerrada y formato), parámetros, series y catálogos propios (D-05), visor de auditoría (sección 9), agrupar el selector de sucursales por empresa (el 15 lo dejó fuera).

## 2. Requisitos funcionales

Aplicación SRS: **APP-02** «Administración del cliente (embebible)»: librería Nx `plataforma-admin-cliente`, rutas lazy en `<cod>-backoffice`; usuario: administrador del cliente (ACT-03). Plan 6.1, R1, columna `plataforma-admin / admin-cliente`: «... empresas, sucursales, unidades ...».

| ID | Nombre | Permiso | Prioridad | Fase |
|---|---|---|---|---|
| TR-RF-002 | Registrar empresa del tenant | plat.empresa.crear | Must | MVP |
| TR-RF-003 | Registrar sucursal (establecimiento) | plat.sucursal.gestionar | Must | MVP |
| TR-RF-004 | Registrar unidad operativa | plat.unidad.gestionar | Must | MVP |

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
- El 03 ya prueba todos en dominio e integración (CA-004 adaptado, CA-006 diferido). Aquí se prueban de punta a punta por HTTP y en la UI.
- RUC de prueba del 03: 20512345671 (no 20512345678, que no pasa módulo 11) y 20498765433.
- CA-004 «razón social devuelta por el padrón»: sin padrón (R2), la razón social se escribe a mano; queda adaptado como en el 03.
- CA-007 «aparece en el selector de sucursales»: el selector del 15 lee `sucursales` de `mi-contexto`. Un usuario con alcance TENANT ve la nueva sucursal si el cliente recarga el contexto tras el alta y si la caché de permisos (60 s, RNF-101) no la oculta. Ningún consumidor de `seguridad` escucha `sucursal.creada` (grep sin resultados): hay que verificar si `seg.sucursales_accesibles` pasa por la caché.
- CA-011: en la UI, el campo sucursal es obligatorio salvo para `ALMACEN`; la API repite la regla.

No hay GWT para listados, edición, inactivación, tenant suspendido ni permisos de pantalla. Ver sección 10.

## 4. Reglas de negocio

- **TR-RN-001** jerarquía tenant → empresa (RUC) → sucursal → unidad; todo con `tenant_id`.
- **TR-RN-002** RUC módulo 11 (`validarRuc` de `libs/shared/util` en el cliente; el dominio lo repite).
- **TR-RN-003** una sola principal por empresa, establecimiento 0000 solo en la principal. Decisiones del 03 que la UI debe reflejar: la principal no se puede inactivar («Marque otra sucursal como principal antes de inactivar esta»); al trasladar la principal la anterior queda sin establecimiento y hay que asignarle uno al editarla.
- **TR-RN-004** unidad en una sucursal, salvo `ALMACEN`.
- **TR-RN-005** tenant `SUSPENDIDO`: solo lectura. `RegistrarEmpresa` ya falla en `SUSPENDIDO` o `BAJA` (03). Con el hook actual, un tenant suspendido no llega en el token, así que el usuario no entra a la app; la UI no necesita un modo de solo lectura en R1.
- **TR-RN-006** tope de sucursales por tenant: el menor `limite_sucursales` entre suscripciones vigentes (decisión del 03, marcada para confirmar).
- **TR-RN-007** permisos por alcance: `plat.empresa.crear` TENANT; los otros dos a decidir (P4).
- **TR-RN-019** advertir NO HABIDO: R2.

## 5. RNF

- **TR-RNF-010** todo endpoint corre con el tenant del token y RLS; ninguna lista cruza tenants.
- **TR-RNF-027** límites por suscripción sin cambiar código (tope de sucursales).
- **TR-RNF-008** altas chocan por `UNIQUE`; ediciones por `version` (409 de conflicto en la UI: «Otro usuario modificó el registro; recargue»).
- **TR-RNF-021** inactivar sucursal o unidad con `confirmarDestructiva` y motivo (el 03 no guarda motivo de inactivación: decidir si el motivo se pide solo en la UI o no se pide, P6).
- **TR-RNF-018** responsiva 360/768/1280 px, español de Perú; **TR-RNF-019** axe-core sin `critical`/`serious` (criterio propio, como el 15); **TR-RNF-020** tareas principales en < 1 h de capacitación (no se prueba en CI).
- **TR-RNF-007** integraciones externas con timeout y reintento: aplica al padrón, R2.

## 6. U-06 (si se adopta P1 del 17a)

Ver `17a-consola-plataforma.md`, sección 6. Resumen: `dominioCookie` por ambiente, URLs de retorno de Supabase por subdominio, CORS de la API, entrada profunda y vuelta al origen con lista blanca, salida compartida; prueba entre `consola.vitrina.test` y `admin.vitrina.test` con archivo hosts; SazónPOS recién en el spec 23. Toca `apps/plataforma-admin` (`environments`, `app.config.ts`), que también toca el 16.

## 7. Horas del plan

| ID | Sprint | Horas | Tipo | Componente | RF | Descripción |
|---|---|---|---|---|---|---|
| **U-05** | 5 | 4 | Front | Admin cliente | TR-RF-002, 003, 004 | Empresas, sucursales y unidades operativas |
| U-06 (propuesto) | 5 | 2 | Front | Admin cliente | — | App plataforma-admin autónoma (para SazónPOS) con sesión compartida |

El plan cuenta 4 h solo de front. Falta el backend HTTP, que nadie hizo. Estimación:

| Pieza | h |
|---|---|
| Controladores `/v1/org/empresas`, `/sucursales`, `/unidades` en `libs/plataforma/org/src/interface` (10 operaciones + 3 listados), DTO zod, OpenAPI, `@Permiso` | 2,5-3 |
| Listados: métodos `listar` en los repositorios (hoy solo `buscar` y `buscarPrincipal`), paginación y filtros | 0,5-1 |
| Manifiesto PLAT: permisos `plat.empresa.crear`, `plat.sucursal.gestionar`, `plat.unidad.gestionar` (hoy solo constantes), módulo `organizacion` con opciones `/admin/empresas`, `/admin/sucursales`, `/admin/unidades`, y sumarlos a `PLAT_PROPIETARIO` | 0,5 |
| UI en `admin-cliente/organizacion`: lista y formulario de empresas; lista por empresa, formulario, inactivar y marcar principal de sucursales; lista por sucursal, formulario e inactivar de unidades | 4 |
| Verificación en navegador | 0,5 |
| **Total U-05** | **8-9** |
| U-06 si se adopta P1 | +2 → 10-11 |

Conclusión: con el backend dentro, U-05 solo ya da 8-9 h. U-05 + U-06 queda en el tope o lo pasa. Opciones (P1): (a) 17b = U-05 con su backend (8-9 h) y U-06 queda en el 17a como pidió el encargo, pero entonces el 17a pasa de 10 h; (b) mover los controladores de org a un spec de backend propio (≈ 3,5-4 h, puede ir en paralelo con el 16 porque no toca front) y dejar 17b = U-05 front + U-06 (≈ 6,5-7 h). Recomendación: **(b)** si se quiere U-06 aquí; si no, **(a)** y U-06 en el 17a sin el backend de consola (que también conviene sacar a ese spec de backend). Un único spec de backend «org-http» (consola + cliente, ≈ 7 h) libera a 17a y 17b para ser solo front y es la división más limpia.

## 8. Estructura, endpoints y límites Nx

### Endpoints que consume cada pantalla

Todos con `@Permiso`, `X-Sucursal-Id` (lo exige `PermisoGuard`), tenant del token y OpenAPI. Ninguno existe: hoy `apps/api` y las libs solo exponen `org/tenants` (POST), `seg/*`, `cfg/parametros`, `seq/series`, `evt/fallidos` y `salud`.

| Pantalla | Endpoint propuesto | Caso de uso (03) | Permiso |
|---|---|---|---|
| Empresas: lista | `GET /v1/org/empresas` | falta `listar` | lectura (P4) |
| Empresas: alta | `POST /v1/org/empresas` | `RegistrarEmpresa` | `plat.empresa.crear` |
| Empresas: edición | `PUT /v1/org/empresas/:id` | `EditarEmpresa` | `plat.empresa.crear` (no hay `editar`; P4) |
| Sucursales: lista | `GET /v1/org/empresas/:id/sucursales` | falta `listar` | lectura |
| Sucursales: alta, edición | `POST /v1/org/empresas/:id/sucursales`, `PUT /v1/org/sucursales/:id` | `RegistrarSucursal`, `EditarSucursal` | `plat.sucursal.gestionar` |
| Sucursales: inactivar, principal | `POST /v1/org/sucursales/:id/inactivar`, `POST .../principal` | `InactivarSucursal`, `MarcarSucursalPrincipal` | `plat.sucursal.gestionar` |
| Unidades: lista | `GET /v1/org/unidades?sucursal_id=&empresa_id=&tipo=` | falta `listar` | lectura |
| Unidades: alta, edición, inactivar | `POST /v1/org/unidades`, `PUT /v1/org/unidades/:id`, `POST .../inactivar` | `RegistrarUnidad`, `EditarUnidad`, `InactivarUnidad` | `plat.unidad.gestionar` |
| Tipos de unidad | — | `TIPOS_UNIDAD` | constante repetida en el front hasta 19a |
| Selector tras alta de sucursal | `GET /v1/seg/mi-contexto` | existe | sin `@Permiso` |

Permisos y `tipo_usuario`:
- El manifiesto PLAT `1.5.0` no declara `plat.empresa.crear`, `plat.sucursal.gestionar` ni `plat.unidad.gestionar`; `PERMISOS_ORG` dice que sí. `PLAT_PROPIETARIO` no los tiene: hoy el propietario no podría usar estas pantallas.
- `@Permiso` recibe un solo código (`decoradores.ts`): para lecturas hace falta un permiso propio (`plat.organizacion.consultar`, propuesto) o reutilizar uno de gestión.
- `tipo_usuario` no interviene: el admin del cliente es `INTERNO` igual que el operador. La autorización es por permiso y alcance en el tenant del token. El operador no administra organizaciones de clientes desde aquí (no es miembro); eso sería consola.

### Libs y límites Nx

```
apps/plataforma-admin/                    scope:app, type:app (spec 14); rutas hijas del layout del 15
libs/plataforma/admin-cliente/            scope:plataforma, type:feature  (lo crea el 16)
  src/lib/admin-cliente.routes.ts         usuarios · roles · ... · empresas · sucursales · unidades
  src/lib/pages/empresas/ · sucursales/ · unidades/ (lista y formulario por carpeta)
  src/lib/services/organizacion.service.ts   HttpClient
  src/lib/models/                         DTO y mapeos
libs/plataforma/org/src/interface/        controladores (regla 1 de CLAUDE.md), como seguridad, parametros y correlativos
libs/plataforma/seguridad/manifiesto/plat.manifiesto.json
```

- `type:feature` usa `shared/ui`, `shared/auth` y `shared/util`; no importa `libs/plataforma/org` (`type:backend`). DTO repetidos en `models/`, o en `libs/shared/contracts` (existe, `scope:shared` y `type:util`, solo `index.ts` vacío; decidir P7).
- Estructura de carpetas por tipo de artefacto (CLAUDE.md, «Estructura de libs Angular»): `pages/`, `services/`, `models/`, sin `template` inline.
- Las rutas del menú del manifiesto llevan prefijo `/admin` (`/admin/roles`, `/admin/usuarios`): las de organización siguen igual.

### Conflictos con el spec 16

El 16 (U-03 usuarios, U-04 roles y perfiles, 10 h) y este spec comparten:
- **`libs/plataforma/admin-cliente`**: el 16 la crea (`project.json`, tags, alias, `admin-cliente.routes.ts`, servicios base). Si van en paralelo, los dos generan la lib: conflicto seguro.
- **`admin-cliente.routes.ts`** y **`apps/plataforma-admin/src/app/app.routes.ts`** (montaje de la lib bajo `/admin`): conflicto de líneas.
- **`plat.manifiesto.json`**: los dos suben versión y agregan permisos, opciones y permisos de `PLAT_PROPIETARIO`. Conflicto seguro.
- Con U-06: `environments` y `app.config.ts` de `plataforma-admin`.
- Riesgo alto. Recomendación: el 17b va **después** del 16 (o el 16 deja primero la lib en stub con la ruta `/admin` montada y el 17b solo agrega `pages/` y tres rutas). El spec de backend de org (si se adopta) sí puede ir en paralelo con el 16: solo comparte el manifiesto.

## 9. Visor de auditoría

**No entra.** El paquete 20 lo deja en «spec 17 / U-06 si aplica», pero ni U-05 ni U-06 son un visor, E-01 no tiene historia de UI y el backend de auditoría (spec 20) no está implementado. Por función sí pertenece a `admin-cliente` (APP-02 lista «auditoría»; TR-CA-214 filtra por sucursal), así que irá en un spec propio de UI después del 20, en esta misma lib.

## 10. Brechas y decisiones pendientes

Brechas:
1. No hay controladores `/v1/org/*` para empresa, sucursal ni unidad, ni métodos de listado en los repositorios.
2. Los permisos de org no están en el manifiesto y `PLAT_PROPIETARIO` no los tiene.
3. No hay permiso de lectura de organización; `@Permiso` admite un solo código.
4. CA-007 depende de recargar `mi-contexto` y de la caché de permisos; nadie invalida al crear una sucursal.
5. `ubigeo` sin catálogo (19a): la UI solo valida 6 dígitos; no hay selector de departamento, provincia y distrito.
6. CA-004 y CA-006 suponen padrón (R2).
7. La sucursal que deja de ser principal queda sin establecimiento: la UI debe pedirlo al editarla.
8. `atributos` JSON de la unidad sin esquema por tipo: formulario libre clave-valor o campos fijos (impresora, capacidad, piso).
9. El plan estima 4 h solo de front; el backend que falta duplica la cifra.

GWT a proponer:
- Lista de sucursales: DADO QUE «Sabores del Sur SAC» tiene «Centro» (principal) y «Cayma» · CUANDO el administrador abre sus sucursales · ENTONCES ve ambas con «Centro» marcada como principal y el establecimiento de cada una.
- Inactivar principal: DADO QUE «Centro» es la principal · CUANDO intenta inactivarla · ENTONCES ve «Marque otra sucursal como principal antes de inactivar esta» y la sucursal sigue activa.
- Inactivar con confirmación: DADO QUE «Cayma» no es principal · CUANDO la inactiva y confirma · ENTONCES deja de aparecer en el selector de sucursales.
- Sin permiso: DADO QUE el usuario no tiene `plat.sucursal.gestionar` · CUANDO abre sucursales · ENTONCES no ve las acciones de alta, edición ni inactivación, y la API responde 403 si las llama.
- Conflicto de versión: DADO QUE otro usuario editó la empresa · CUANDO guarda su edición · ENTONCES ve «Otro usuario modificó el registro; recargue» y no se pierde lo del otro.
- Unidad con padre: DADO QUE «SALON-1» existe en «Cayma» · CUANDO registra la mesa con padre «SALON-1» · ENTONCES la unidad queda bajo «SALON-1»; y un padre de otra empresa se rechaza.
- Sucursal nueva en el selector (precisa CA-007): tras registrar «Cayma», el selector la muestra sin cerrar sesión.
- Aislamiento: un id de empresa de otro tenant en la URL devuelve 404, no 403.

Preguntas candidatas para la Fase 2 de /spec (recomendación entre paréntesis):
- **P1. ¿Qué entra en 17b?** (Separar el backend de org (consola y cliente) en un spec propio de unas 7 h que puede ir en paralelo con el 16; 17b = U-05 front + U-06, unas 7 h. Si no, 17b = U-05 con su backend, 8-9 h, sin U-06.)
- **P2. ¿Orden con el 16?** (Después del 16; el 16 crea `admin-cliente` y monta `/admin`.)
- **P3. ¿Rutas?** (`/admin/empresas`, `/admin/empresas/:id/sucursales`, `/admin/unidades` con filtro por sucursal; opciones del menú en un módulo `organizacion`.)
- **P4. ¿Permisos y alcances?** (`plat.empresa.crear` TENANT, también para editar; `plat.sucursal.gestionar` EMPRESA; `plat.unidad.gestionar` SUCURSAL; nuevo `plat.organizacion.consultar` SUCURSAL para leer; todos a `PLAT_PROPIETARIO`; ninguno sensible.)
- **P5. ¿Listas paginadas?** (Sí para unidades; empresas y sucursales son pocas, pero `vit-tabla` ya es del lado del servidor: mismo contrato `{ items, total }` en las tres.)
- **P6. ¿Motivo al inactivar?** (Confirmación sí; motivo no, porque el 03 no lo guarda y TR-RNF-021 habla de anular, eliminar y reembolsar. Si se exige, se agrega columna.)
- **P7. ¿Dónde viven los DTO del front?** (En `models/` de `admin-cliente`; `shared/contracts` está vacía y su uso no está decidido.)
- **P8. ¿Ubigeo y atributos?** (Ubigeo como texto de 6 dígitos hasta 19a; atributos con tres campos fijos opcionales, sin editor JSON.)
- **P9. ¿CA-007 y la caché?** (Tras alta, edición o inactivación de sucursal, la página llama a `SesionService.cargarContexto()`; verificar si `sucursales_accesibles` pasa por la caché de 60 s y, si pasa, invalidar o aceptar el retraso.)
- **P10. ¿Pruebas y evidencia?** (Supertest de los 13 endpoints con permiso, sin permiso y tenant ajeno; Vitest de páginas; Playwright en 360/768/1280 con CA-004, 005, 007 a 012 y los propuestos; axe-core; datos de prueba borrados al final.)
