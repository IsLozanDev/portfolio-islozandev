# Contexto para el spec 17a · org-http

Paquete de contexto (no es el spec). Fuentes: `docs/roadmap-specs.md`, specs `03`, `06`, `12` y `15` (este último en implementación), `docs/spec-context/03-org-dominio-y-alta-tenant.md`, SRS xlsx (hojas Aplicaciones, Actores, Reglas de negocio, RF, RNF), plan docx (secciones 6.1 y 7), `1_Mermaid/PL-08`, y el código actual de `apps/` y `libs/`. Ruta base del plan: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

## 1. Alcance y límites con otros specs

- Roadmap: spec 17a `org-http`, back de ORG sin UI: tenants (lista, detalle, estado; `SECURITY DEFINER` para la lista) y empresas, sucursales y unidades. Permisos ORG al manifiesto y a `PLAT_PROPIETARIO`. Operador vs. cliente por permiso (`OPERADOR_REQUERIDO`), no por `tipo_usuario`. 7 h; depende de **12**. Ola 6: después de 12, 15, 18, 19 y 21; antes de 16a y 17b.
- No tiene historia propia en el plan: las historias O-04 (17b) y U-05 (17c) son «Front» y suponen la API hecha. Este spec junta la deuda de backend que ningún spec anterior dejó. Lo consumen 16a (lectura org para el selector de alcance), 17b (consola) y 17c (admin de organización).
- Límite con el **12**: el 12 dejó `POST /v1/org/tenants` (alta transaccional, operador `plataforma`, `OPERADOR_REQUERIDO`), la tarea diaria y el CLI del operador. Dejó al 17 el listado de tenants («Vista entre tenants para el operador: consola, spec 17»). El asistente de alta (UI) es del 17b.
- Límite con el **03**: dejó `CambiarEstadoTenant`, `GestionarSuscripcion` y los casos de uso de organización (`RegistrarEmpresa`, `EditarEmpresa`, `RegistrarSucursal`, `EditarSucursal`, `InactivarSucursal`, `MarcarSucursalPrincipal`, `RegistrarUnidad`, `EditarUnidad`, `InactivarUnidad`) con sus pruebas, pero **sin HTTP** («Controladores `/v1/org/*` ... spec 07 en adelante; consola en el spec 17»).
- Límite con el **16a**: el 16a no crea controladores `org`; usa las lecturas de este spec para el selector de alcance (TR-CA-036, unidad «CAJA-02»).
- Límite con el **17b / 17c**: solo front; consumen estos endpoints sin cambiarlos.
- Fuera de alcance: UI (17b, 17c), suscripción editable (RF-005, sin historia de UI), inactivar empresa (decisión del 03), padrón RUC y NO HABIDO (TR-IDN, R2), catálogos `UBIGEO` y `TIPO_UNIDAD` (19a), selector de tenant (`PUT /v1/seg/mi-tenant` no existe), visor de auditoría (ver 17c).

## 2. Requisitos funcionales (parte de back)

| ID | Nombre | Permiso | Prioridad | Fase | Backend hoy |
|---|---|---|---|---|---|
| TR-RF-006 | Cambiar estado del tenant | plat.tenant.cambiar_estado | Must | MVP | 03: `CambiarEstadoTenant` sin HTTP |
| TR-RF-002 | Registrar empresa del tenant | plat.empresa.crear | Must | MVP | 03: sin HTTP |
| TR-RF-003 | Registrar sucursal (establecimiento) | plat.sucursal.gestionar | Must | MVP | 03: sin HTTP |
| TR-RF-004 | Registrar unidad operativa | plat.unidad.gestionar | Must | MVP | 03: sin HTTP |
| TR-RF-001 | Dar de alta un tenant con asistente | plat.tenant.crear | Must | MVP | 12: `POST /v1/org/tenants` existe; no se toca |
| TR-RF-005 | Gestionar suscripción de producto | plat.suscripcion.gestionar | Must | MVP | 03: sin HTTP. **Fuera** |

Detalle funcional de cada RF y su UI: RF 001 y 006 en `17b-consola-plataforma.md`; RF 002 a 004 en `17c-admin-org-cliente.md`.

**TR-RF-006** (back). Datos: `estado_nuevo` `ACTIVO|SUSPENDIDO|BAJA`; `motivo` 10-500 obligatorio (`libs/plataforma/org/src/domain/tenant.ts`); `fecha_efectiva` (por defecto ahora). Reglas 005, 009. RNF 021, 013. El 03 implementó matriz, motivo, historial (`org.tenant_estado_historial`) y eventos; el cierre de sesiones lo da el hook (no entrega tenants `SUSPENDIDO`/`BAJA` al refrescar) y el correo es TR-NOT (R2).

**TR-RF-002 a 004** (back). Datos y validaciones ya en el dominio del 03; ver `17c-admin-org-cliente.md`, sección 2.

## 3. Criterios GWT

Los GWT del SRS de RF 006 (TR-CA-016 a 018) y RF 002 a 004 (TR-CA-004 a 012) se citan tal cual en los paquetes 17b y 17c. Aquí se cierran por HTTP (supertest); en 17b y 17c, por UI. Notas de back:
- TR-CA-017 (BAJA → ACTIVO): rechazo de la matriz del 03 por HTTP.
- TR-CA-018 (motivo vacío): 400 con motivo < 10 caracteres.
- TR-CA-005, 008, 009, 011: errores de dominio del 03 mapeados a `{ codigo, mensaje }`.
- RUC de prueba del 03: 20512345671 y 20498765433 (el 20512345678 del SRS no pasa módulo 11).

### GWT faltantes a proponer

- Lista de tenants: DADO QUE existen «polleria-dona-rosa» (PRUEBA) y «gym-fuerza-total» (SUSPENDIDO) · CUANDO el operador filtra por SUSPENDIDO · ENTONCES recibe solo «gym-fuerza-total» con su estado y sus suscripciones.
- No operador: DADO QUE el propietario de «polleria-dona-rosa» se asignó `PLAT_ADMIN_TENANTS` · CUANDO consulta la lista de tenants · ENTONCES la API responde 403 `OPERADOR_REQUERIDO`.
- Sin MFA: `POST /v1/org/tenants/:id/estado` con aal1 o MFA vencido responde `MFA_REQUERIDA`.
- Repetir estado: mismo estado es no-op (spec 03), 200 sin historial nuevo.
- Lista solo cabecera (RNF-010): la función devuelve código, nombre, estado y suscripciones; ninguna columna de negocio del cliente.
- Aislamiento org: un id de empresa de otro tenant en la URL devuelve 404, no 403.
- Sin permiso org: sin `plat.sucursal.gestionar`, alta, edición e inactivación de sucursal responden 403.
- Conflicto de versión: edición con `version` vieja responde 409.
- Unidad con padre de otra empresa: rechazo.

## 4. Reglas de negocio

- **TR-RN-001** jerarquía tenant → empresa → sucursal → unidad; ninguna consulta cruza tenants. El listado del operador es la excepción controlada (función `SECURITY DEFINER`, como `org.tenant_por_codigo` del 12).
- **TR-RN-002** RUC módulo 11 (el dominio lo valida).
- **TR-RN-003** una principal por empresa, establecimiento 0000 solo en la principal; la principal no se inactiva.
- **TR-RN-004** unidad en una sucursal, salvo `ALMACEN`.
- **TR-RN-005** estados `PRUEBA → ACTIVO → SUSPENDIDO → BAJA`; matriz del 03: `PRUEBA → ACTIVO|SUSPENDIDO|BAJA`, `ACTIVO → SUSPENDIDO|BAJA`, `SUSPENDIDO → ACTIVO|BAJA`, `BAJA` terminal (`TRANSICIONES` exportado por `org`).
- **TR-RN-006** tope de sucursales: el menor `limite_sucursales` entre suscripciones vigentes (decisión del 03, marcada para confirmar).
- **TR-RN-007** los permisos PLAT no dependen de suscripción: el operador no tiene suscripción (spec 12).
- **TR-RN-009** `plat.tenant.crear` es sensible. RF-006 exige MFA vigente: `plat.tenant.cambiar_estado` se declara sensible.
- Spec 12: el actor de tenants debe estar en el tenant operador (`ORG_TENANT_OPERADOR`, por defecto `plataforma`); el permiso solo no basta, porque los roles predefinidos son globales y un propietario de cliente puede asignarse `PLAT_ADMIN_TENANTS`.

## 5. RNF

- **TR-RNF-010** endpoints de cliente con el tenant del token y RLS; la lista entre tenants devuelve solo cabecera.
- **TR-RNF-008** idempotencia: altas chocan por `UNIQUE`; ediciones por `version` (409); repetir estado es no-op.
- **TR-RNF-013** cambio de estado en el historial del 03; auditoría completa es del 20.
- **TR-RNF-027** límites por suscripción sin cambiar código (tope de sucursales).
- **TR-RNF-021** el motivo del cambio de estado es obligatorio (10-500).
- Regla 5 de `CLAUDE.md`: `@Permiso` y OpenAPI en todo endpoint, bajo `/v1`. Regla 11: listados con TypeORM; la función `SECURITY DEFINER` es SQL (función de base de datos) y va en `db/` con inverso.

## 6. Horas

Sin historia en el plan. Estimación (roadmap: 7 h):

| Pieza | h |
|---|---|
| Tenants: función `SECURITY DEFINER` de listado y detalle (dueño `org_lector`), `GET` lista y detalle, `POST` estado con comprobación de operador | 3 |
| Controladores `/v1/org/empresas`, `/sucursales`, `/unidades` en `libs/plataforma/org/src/interface` (10 operaciones + 3 listados), DTO zod, OpenAPI, `@Permiso` | 2,5 |
| Listados: métodos `listar` en los repositorios (hoy solo `buscar` y `buscarPrincipal`), paginación y filtros | 0,5-1 |
| Manifiesto PLAT: permisos, rol `PLAT_PROPIETARIO`, opciones de menú | 0,5 |
| **Total** | **6,5-7** |

Las cifras vienen de los paquetes 17a (back de consola 3-3,5 h) y 17b (controladores 2,5-3, listados 0,5-1, manifiesto 0,5) anteriores, tomando el extremo bajo para cuadrar con 7 h. Sin margen: si el detalle con historial pesa, sale (P5).

## 7. Endpoints

### Tenants (operador)

| Uso | Endpoint | Estado | Nota |
|---|---|---|---|
| Alta | `POST /v1/org/tenants` | Existe (12) | Errores `SOLICITUD_INVALIDA`, `RUC_INVALIDO`, `OPERADOR_REQUERIDO`, `TENANT_DUPLICADO`, `IDENTIDAD_NO_DISPONIBLE`, `MFA_REQUERIDA`. No se toca |
| Lista | `GET /v1/org/tenants?q=&estado=&producto=&pagina=&tamano=` | **Falta** | RLS de `org.tenant` es por `id`: función `SECURITY DEFINER` (dueño `org_lector`, patrón del 12) llamada solo tras la comprobación de operador |
| Detalle | `GET /v1/org/tenants/:id` | **Falta** | Cabecera, suscripciones, empresa principal; historial de estados opcional (`org.tenant_estado_historial`) |
| Cambio de estado | `POST /v1/org/tenants/:id/estado` `{ estado, motivo }` | **Falta** | `CambiarEstadoTenant` dentro de `TenantContext.run({ tenantId: id })` en `apps/api` (como el orquestador del 12), con comprobación de operador. Mismo riesgo del 12: no reutilizar la transacción abierta por `PermisoGuard` con el tenant del operador |
| Suscripción | `PUT /v1/org/tenants/:id/suscripciones/:producto` | Fuera | RF-005 sin historia de UI |
| Productos y planes | — | Constantes | `PRODUCTOS` y `PLANES` exportados por `org`; no hay endpoint |

### Organización del cliente (tenant del token)

Todos con `@Permiso`, `X-Sucursal-Id` (lo exige `PermisoGuard`), tenant del token y OpenAPI. Contrato de listas `{ items, total }`.

| Uso | Endpoint | Caso de uso (03) | Permiso |
|---|---|---|---|
| Empresas: lista | `GET /v1/org/empresas` | falta `listar` | lectura (P3) |
| Empresas: alta | `POST /v1/org/empresas` | `RegistrarEmpresa` | `plat.empresa.crear` |
| Empresas: edición | `PUT /v1/org/empresas/:id` | `EditarEmpresa` | `plat.empresa.crear` (no hay `editar`) |
| Sucursales: lista | `GET /v1/org/empresas/:id/sucursales` | falta `listar` | lectura |
| Sucursales: alta, edición | `POST /v1/org/empresas/:id/sucursales`, `PUT /v1/org/sucursales/:id` | `RegistrarSucursal`, `EditarSucursal` | `plat.sucursal.gestionar` |
| Sucursales: inactivar, principal | `POST /v1/org/sucursales/:id/inactivar`, `POST .../principal` | `InactivarSucursal`, `MarcarSucursalPrincipal` | `plat.sucursal.gestionar` |
| Unidades: lista | `GET /v1/org/unidades?sucursal_id=&empresa_id=&tipo=` | falta `listar` | lectura |
| Unidades: alta, edición, inactivar | `POST /v1/org/unidades`, `PUT /v1/org/unidades/:id`, `POST .../inactivar` | `RegistrarUnidad`, `EditarUnidad`, `InactivarUnidad` | `plat.unidad.gestionar` |

Hoy `apps/api` y las libs solo exponen `org/tenants` (POST), `seg/*`, `cfg/parametros`, `seq/series`, `evt/fallidos` y `salud`. `apps/api/src/org/alta-tenant.controller.ts` es el único controlador `org`.

### Permisos, operador y manifiesto

- Manifiesto PLAT `1.5.0`: solo `plat.tenant.crear`. `plat.tenant.cambiar_estado`, `plat.suscripcion.gestionar`, `plat.empresa.crear`, `plat.sucursal.gestionar` y `plat.unidad.gestionar` existen solo como constantes en `PERMISOS_ORG` (el comentario del archivo dice que están en el manifiesto: no lo están).
- Faltan permisos de lectura: `plat.tenant.consultar` (lista y detalle de tenants) y `plat.organizacion.consultar` (listas de org; `@Permiso` recibe un solo código, `decoradores.ts`).
- `PLAT_ADMIN_TENANTS` (hoy `plat.tenant.crear` y `plat.sesion.contexto`) suma `plat.tenant.consultar` y `plat.tenant.cambiar_estado`. `PLAT_PROPIETARIO` suma los permisos de organización del cliente (`plat.empresa.crear`, `plat.sucursal.gestionar`, `plat.unidad.gestionar`, `plat.organizacion.consultar`) y **no** los de tenants. Hoy el propietario no podría usar las pantallas de organización.
- **Operador vs. cliente** (D2): por permiso. Los endpoints de tenants responden 403 `OPERADOR_REQUERIDO` si el actor no está en el tenant operador, aunque tenga el permiso. `tipo_usuario` no sirve: operador y propietarios invitados son `INTERNO`. `mi-contexto` no cambia. Los endpoints de organización no comprueban operador: corren en el tenant del token; el operador no administra organizaciones de clientes desde aquí.
- Menú: `seg.opcion` es por producto, no por app. Opciones de consola con prefijo `/consola` en un módulo `consola`; opciones de organización `/admin/empresas`, `/admin/sucursales`, `/admin/unidades` en un módulo `organizacion`. El filtrado por app es del 17b (después del 15).
- Versión del manifiesto: el 17a va antes que 16a y 17b, así que toma `1.6.0`.

## 8. Estructura

```
apps/api/src/org/                          consola-tenants.controller.ts · consulta-tenants.ts (orquestación, como alta-tenant.ts)
db/01a_org_consola.sql                     función de listado/detalle SECURITY DEFINER + inverso + prueba SQL
libs/plataforma/org/src/interface/         controladores de empresas, sucursales y unidades (regla 1 de CLAUDE.md), como seguridad, parametros y correlativos
libs/plataforma/org/src/infrastructure/    métodos listar en repositorios TypeORM
libs/plataforma/seguridad/manifiesto/plat.manifiesto.json   1.6.0
```

Archivos compartidos: `plat.manifiesto.json` (16a y 17b no deberían tocarlo; si lo tocan, van detrás) y `apps/api/src/app.module.ts` (conflicto trivial).

## 9. Decisiones tomadas

- **D1. Longitud del motivo** (decisión del usuario): se respeta lo implementado. ORG valida 10-500 (`tenant.ts`), SEG 4-300 (`texto.ts`). El 17a no cambia ninguna. La UI de ORG (17b, 17c) usa el default 10 de `confirmarDestructiva`.
- **D2. Operador vs. cliente** (decisión del usuario): por permiso, con `OPERADOR_REQUERIDO` en la API, no por `tipo_usuario`. Sin cambio en `mi-contexto`.
- **D3. División** (roadmap): un spec de back «org-http» que libera a 17b y 17c para ser solo front (era la opción recomendada en los paquetes 17a y 17b anteriores).
- **D4. `plat.tenant.cambiar_estado` sensible** (RF-006 exige MFA vigente).
- **D5. Lista entre tenants** con función `SECURITY DEFINER` dueña `org_lector`, solo cabecera y suscripciones, paginada, llamada tras la comprobación de operador.

## 10. Brechas restantes

1. Permisos de org fuera del manifiesto; `PERMISOS_ORG` dice lo contrario.
2. Permiso de lectura de organización para el selector de alcance del 16a: si `plat.organizacion.consultar` va solo a `PLAT_PROPIETARIO`, un admin de seguridad (`PLAT_ADMIN_SEGURIDAD`) que invita no puede llenar el selector. Sumarlo también a ese rol.
3. Un operador que también es miembro de un tenant cliente entra con `tenant_preferido` y no puede cambiar (no hay `mi-tenant`). Riesgo aceptado en dev; el operador usa un correo propio.
4. CA-007 (sucursal nueva en el selector) depende de recargar `mi-contexto` y de la caché de permisos (60 s); ningún consumidor de `seguridad` escucha `sucursal.creada`. Verificar si `seg.sucursales_accesibles` pasa por la caché.
5. TR-RN-006 (tope por el menor límite) marcado para confirmar desde el 03.
6. El plan R1 pone «suscripción» en la consola; RF-005 queda sin HTTP.
7. Inactivar sucursal o unidad no guarda motivo (03); TR-RNF-021 lo pediría si se considera destructiva.

## 11. Preguntas candidatas para la Fase 2 de /spec

- **P1. ¿Lectura de organización con qué permiso y alcance?** (`plat.organizacion.consultar` SUCURSAL, a `PLAT_PROPIETARIO` y `PLAT_ADMIN_SEGURIDAD`.)
- **P2. ¿Alcances de gestión?** (`plat.empresa.crear` TENANT, también para editar; `plat.sucursal.gestionar` EMPRESA; `plat.unidad.gestionar` SUCURSAL; ninguno sensible.)
- **P3. ¿Listas paginadas?** (Sí para unidades y tenants; empresas y sucursales con el mismo contrato `{ items, total }`.)
- **P4. ¿Opciones de menú aquí o en el front?** (Aquí, junto con los permisos, para que 17b y 17c no toquen el manifiesto.)
- **P5. ¿Historial de estados en el detalle?** (Sí, solo lectura, si la función lo devuelve sin costo extra; si no, fuera.)
- **P6. ¿Pruebas y evidencia?** (Supertest de los 3 endpoints de tenants con operador, no operador y sin MFA; de los 13 de organización con permiso, sin permiso y tenant ajeno; prueba SQL de la función con dos tenants; datos de prueba borrados al final.)
