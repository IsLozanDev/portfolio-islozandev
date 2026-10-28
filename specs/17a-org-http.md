# SPEC 17a — Org HTTP: tenants para el operador y empresas, sucursales y unidades del cliente

> **Status:** Aprobado
> **Depends on:** SPEC 03, SPEC 06, SPEC 12
> **Date:** 2026-10-27
> **Objective:** Exponer por `/v1/org` la lista, el detalle y el cambio de estado de tenants para el tenant operador, y la gestión de empresas, sucursales y unidades del tenant del token, con sus permisos y opciones de menú en el manifiesto PLAT `1.6.0`.

## Por qué existe este spec

Fila 17a de `docs/roadmap-specs.md`. Contexto: `docs/spec-context/17a-org-http.md`. No tiene historia propia en el plan. Junta el backend que necesitan O-04 (17b) y U-05 (17c), que son solo front, y la lectura de organización que usa el selector de alcance del 16a.

Lo que hay en el código hoy (revisado al redactar):

- El spec 03 dejó `CambiarEstadoTenant` y los nueve casos de uso de organización con pruebas, **sin HTTP**. No existe `libs/plataforma/org/src/interface`.
- El spec 12 dejó `POST /v1/org/tenants` (`apps/api/src/org/alta-tenant.controller.ts`), el único controlador `org`. La comprobación de operador es un método privado de `AltaTenant` (`exigirOperador`).
- Los repositorios de org solo tienen `buscar`, `buscarPrincipal` y `contarActivas`. No hay listados.
- Las ediciones (`EditarEmpresa`, `EditarSucursal`, `EditarUnidad`) no reciben `version`. El bloqueo optimista solo protege contra escrituras concurrentes dentro del servidor. Una edición hecha con datos viejos del cliente no se detecta.
- Manifiesto PLAT `1.5.0`: de org solo está `plat.tenant.crear`. `PERMISOS_ORG` tiene el resto como constantes y su comentario dice que están en el manifiesto, pero no lo están.
- `PLAT_PROPIETARIO` no tiene ningún permiso de organización. Hoy el propietario no puede administrar su empresa.
- La RLS de `org.tenant` es por `id`. Listar tenants exige una función `SECURITY DEFINER`, con el patrón de `org.tenant_por_codigo` del spec 12.
- `PermisoGuard` cierra su transacción antes del handler (`uow.run` termina en el guard). El riesgo que anotó el spec 12 de reutilizar la transacción con el tenant del operador no aplica. `CambiarEstadoTenant` ya pone el tenant del comando en el contexto.

RF cubiertos (parte de back):

- **TR-RF-006** cambiar estado del tenant.
- **TR-RF-002** registrar y editar empresa.
- **TR-RF-003** registrar, editar, inactivar sucursal y marcar la principal.
- **TR-RF-004** registrar, editar e inactivar unidad operativa.
- Lectura de tenants para la consola (RF-001 y RF-006, 17b) y de organización (RF-002 a 004, 16a y 17c).

Criterios del SRS cerrados por HTTP: **TR-CA-004 a 012** y **TR-CA-016 a 018**. Los de lista de tenants, operador, MFA, no-op, aislamiento, permiso, versión y padre de otra empresa son propios (sección 3 del contexto, validados por el usuario).

Reglas: **TR-RN-001** a **007** y **TR-RN-009**. La regla de operador es la del spec 12.

RNF propios:

- **TR-RNF-010**: los endpoints de cliente usan el tenant del token y la RLS. La lista entre tenants devuelve solo cabecera y suscripciones.
- **TR-RNF-008**: las altas chocan por `UNIQUE`; las ediciones, por `version` (409). Repetir el mismo estado es no-op.
- **TR-RNF-021**: motivo de 10 a 500 caracteres al cambiar el estado del tenant.
- **TR-RNF-013**: el cambio de estado queda en `org.tenant_estado_historial` (spec 03). La auditoría completa es del spec 20.
- **TR-RNF-027**: tope de sucursales por suscripción, sin cambiar código (spec 03).

RNF heredados: 011, 012, 024/119, 025, 026 (logs sin RUC ni correo), 101, 106.

Estimado: 7-8 h. El roadmap da 7. La hora de más es la `version` en las ediciones, que el GWT de conflicto exige.

## Alcance

**In:**

- **Migración** `db/01a_org_consola.sql`, su inverso `db/rollback/01a_org_consola.sql` y la prueba `db/tests/01a_org_consola.test.sql`. Ordena después de `01a_org_alta.sql` y antes de `01b_seg.sql` por nombre. No referencia `seg`.
- **`libs/plataforma/org`**:
  - `version` obligatoria en `EditarEmpresaComando`, `EditarSucursalComando` y `EditarUnidadComando`, y `VersionObsoletaError`.
  - Puerto de lectura `LecturaOrganizacion` con su adaptador TypeORM, y los casos de uso `ListarEmpresas`, `ListarSucursales` y `ListarUnidades`.
  - Entidades TypeORM de solo lectura (`entidades-lectura.ts`), que entran en `ENTIDADES_ORG`.
  - `PERMISOS_ORG` suma `tenantConsultar` y `organizacionConsultar`. Se corrige el comentario del archivo.
  - `OrgModule` registra las lecturas.
- **`apps/api/src/org/`**:
  - `empresas.controller.ts`, `sucursales.controller.ts`, `unidades.controller.ts` y `organizacion.http.ts` (zod, DTO, mapeos y paginación).
  - `org.filtro.ts`: `OrgFiltro`, el filtro de errores de `/v1/org`, sacado de `alta-tenant.http.ts` (era `AltaTenantFiltro`).
  - `ENTIDADES_ORG` en el `DataSource` de `apps/api/src/main.ts`.
  - `operador.ts`: `ExigirOperador` y `OperadorRequeridoError`, sacados de `alta-tenant.ts`. `AltaTenant` los usa.
  - `consulta-tenants.ts` (puerto y orquestación) y `consulta-tenants.typeorm.ts` (llamada a las funciones SQL).
  - `consola-tenants.controller.ts` y `consola-tenants.http.ts`.
  - Registro en `apps/api/src/app.module.ts`.
- **Manifiesto PLAT `1.6.0`**: cuatro permisos nuevos en el manifiesto, cambios en tres roles y dos módulos con sus opciones de menú.
- **Pruebas**: dominio y aplicación (Jest), SQL contra PostgreSQL 16, integración y HTTP con supertest.
- **Nube, dev (manual)**: migración, manifiesto `1.6.0` y prueba de humo con el operador. Los datos de prueba se borran al final.

**Out of scope (para otros specs):**

- UI de consola (17b) y de administración de organización (17c).
- Suscripción editable por HTTP (TR-RF-005). `plat.suscripcion.gestionar` no se declara en el manifiesto porque no tiene endpoint.
- Inactivar empresa (decisión del 03).
- Motivo al inactivar sucursal o unidad. Se respeta el 03 (decisión del usuario).
- Filtrar las listas de organización por el alcance del actor. Devuelven todo el tenant (decisión del usuario).
- `fecha_efectiva` futura del cambio de estado por HTTP. Se usa "ahora".
- Detalle individual de empresa, sucursal o unidad. Las listas traen todos los campos y la `version`.
- Padrón RUC y NO HABIDO (TR-IDN, R2). Catálogos `UBIGEO` y `TIPO_UNIDAD` (19a).
- Selector de tenant (`PUT /v1/seg/mi-tenant`) y visor de auditoría.
- Refresco del selector de sucursales tras crear una (TR-CA-007 por UI). Se cierra en el 17c con `mi-contexto`.
- Correo al suspender o dar de baja (TR-NOT, R2).

## Base de código reutilizada

**Se conserva:**

- Spec 03: los nueve casos de uso de organización, `CambiarEstadoTenant` (matriz `TRANSICIONES`, motivo 10-500, historial, no-op al mismo estado), `RepositorioBase` con `version`, errores de dominio y sus mensajes.
- Spec 12: rol `org_lector`, patrón de `org.tenant_por_codigo` (`SECURITY DEFINER`, `SET search_path = ''`, `REVOKE` a `PUBLIC`, `anon` y `authenticated`), `ORG_TENANT_OPERADOR` y la regla de operador.
- `libs/plataforma/correlativos/src/interface/series.controller.ts` y `series.http.ts` como patrón: zod con `validar`, filtro `@Catch(DomainError)` a `{ codigo, mensaje }`, `NO_ENCONTRADO` y `CONFLICTO` genéricos, lecturas por puerto propio.
- `@Permiso`, `PrincipalActual`, `X-Sucursal-Id` y `PermisoGuard` (specs 05 y 06), sin cambios.

**Cambia:**

- `apps/api/src/org/alta-tenant.ts`: `exigirOperador` y `OperadorRequeridoError` pasan a `operador.ts`. El mensaje queda «Solo el tenant operador puede administrar tenants». Se ajusta la prueba del 12 si compara el texto.
- Comandos de edición de org: `version` obligatoria.
- `PERMISOS_ORG`: dos constantes nuevas y comentario corregido.
- `plat.manifiesto.json` pasa a `1.6.0`.

## Modelo de datos

### Migración `db/01a_org_consola.sql`

```sql
-- org_lector ya existe (spec 12) con SELECT y política USING (true) en org.tenant y org.suscripcion.
GRANT SELECT ON org.empresa, org.sucursal, org.tenant_estado_historial TO org_lector;
CREATE POLICY empresa_consola   ON org.empresa                 FOR SELECT TO org_lector USING (true);
CREATE POLICY sucursal_consola  ON org.sucursal                FOR SELECT TO org_lector USING (true);
CREATE POLICY historial_consola ON org.tenant_estado_historial FOR SELECT TO org_lector USING (true);

-- SECURITY DEFINER, dueño org_lector, SET search_path = ''.
-- q: ILIKE sobre codigo o nombre. estado y producto: igualdad. Orden por codigo.
-- total = count(*) OVER (). suscripciones: jsonb [{ producto_codigo, plan, estado, vigente_hasta }].
org.tenants_listar(p_q varchar, p_estado varchar, p_producto varchar, p_limite int, p_desplazamiento int)
  RETURNS TABLE (id uuid, codigo varchar, nombre varchar, estado varchar, creado_en timestamptz,
                 suscripciones jsonb, total bigint)

-- SECURITY DEFINER, dueño org_lector, SET search_path = ''. Ninguna fila si el id no existe.
-- empresa_principal: jsonb { id, ruc, razon_social } de la empresa activa de menor `razon_social` que tiene sucursal principal (ni empresa ni sucursal tienen fecha de creación).
-- historial: jsonb [{ estado_anterior, estado_nuevo, motivo, fecha_efectiva, actor_id, registrado_en }]
-- ordenado por registrado_en DESC.
org.tenant_detalle(p_id uuid)
  RETURNS TABLE (id uuid, codigo varchar, nombre varchar, estado varchar, estado_motivo varchar,
                 estado_cambiado_en timestamptz, version bigint, creado_en timestamptz,
                 suscripciones jsonb, empresa_principal jsonb, historial jsonb)
```

- `REVOKE EXECUTE ... FROM PUBLIC`, `anon` y `authenticated`. `GRANT EXECUTE` al rol que corre la migración y, en la prueba SQL, al rol de prueba.
- `tenants_listar` no devuelve ninguna columna de empresa, sucursal, unidad, membresía ni de otro esquema (TR-RNF-010).
- El inverso borra las dos funciones, las tres políticas y los `GRANT` nuevos. No toca lo del spec 12.

### Comandos de edición (cambio en org)

```ts
interface EditarEmpresaComando  extends DatosEmpresa  { empresaId: string; version: number }
interface EditarSucursalComando extends DatosSucursal { sucursalId: string; version: number; activo?: boolean }
interface EditarUnidadComando   extends DatosUnidad   { unidadId: string; version: number; padreId: string | null; activo?: boolean }

class VersionObsoletaError extends ConflictError {
  code = 'VERSION_OBSOLETA';  // «El registro cambió desde que lo abrió; recargue y vuelva a intentar»
}
```

- Cada edición lee el agregado y, si su `version` no es la del comando, lanza `VersionObsoletaError` antes de cambiar nada.
- Inactivar, reactivar por `activo` y marcar principal no piden `version`. Son idempotentes o los protege la regla de dominio.

### Lectura de organización (`application/ports/lectura-organizacion.ts`)

```ts
interface Pagina { pagina: number; tamano: number }       // pagina >= 1; tamano 1..100, defecto 20
interface Listado<T> { items: T[]; total: number }

interface LecturaOrganizacion {
  empresas(filtro: { activo?: boolean } & Pagina): Promise<Listado<EmpresaListada>>;
  sucursales(empresaId: string, filtro: { activo?: boolean } & Pagina): Promise<Listado<SucursalListada>>;
  unidades(filtro: { empresaId?: string; sucursalId?: string; tipo?: TipoUnidad; activo?: boolean } & Pagina): Promise<Listado<UnidadListada>>;
}
```

- `EmpresaListada`: `id`, `ruc`, `razon_social`, `nombre_comercial`, `direccion_fiscal`, `ubigeo`, `activo`, `version`. Orden por `razon_social`.
- `SucursalListada`: `id`, `empresa_id`, `codigo`, `nombre`, `codigo_establecimiento_sunat`, `direccion`, `ubigeo`, `telefono`, `zona_horaria`, `es_principal`, `activo`, `version`. Orden: principal primero, luego `codigo`.
- `UnidadListada`: `id`, `empresa_id`, `sucursal_id`, `tipo`, `codigo`, `nombre`, `padre_id`, `atributos`, `activo`, `version`. Orden por `tipo` y `codigo`.
- Adaptador con `QueryBuilder` sobre el `EntityManager` de la transacción activa (regla 11), con `skip`/`take` y `getManyAndCount`. Sin SQL crudo.
- `ListarSucursales` responde `NotFoundError` «La empresa no existe» si la empresa no se ve con la RLS. Así una empresa de otro tenant da 404.
- Constantes `TAMANO_PAGINA_DEFECTO = 20` y `TAMANO_PAGINA_MAXIMO = 100` en `organizacion.http.ts`. Las usa también la consola de tenants.

### Consulta de tenants (`apps/api/src/org/consulta-tenants.ts`)

```ts
interface ConsultaTenants {   // adaptador: consulta-tenants.typeorm.ts, SQL crudo justificado (funciones SECURITY DEFINER)
  listar(filtro: { q?: string; estado?: EstadoTenant; producto?: ProductoCodigo } & Pagina): Promise<Listado<TenantListado>>;
  detalle(tenantId: string): Promise<TenantDetalle | null>;
}

class ExigirOperador {        // operador.ts
  ejecutar(actor: { tenantId: string }): Promise<void>;   // OperadorRequeridoError si el tenant del actor no es ORG_TENANT_OPERADOR
}
```

- `ConsolaTenants` orquesta: `ExigirOperador` primero, luego `ConsultaTenants` o `CambiarEstadoTenant`. No se llama a ninguna función entre tenants antes de la comprobación.
- El cambio de estado pasa `actorId = principal.usuarioId`. `CambiarEstadoTenant` pone el tenant destino en el contexto (spec 03).

### HTTP

Todos bajo `/v1/org`, con `@ApiBearerAuth()`, `X-Sucursal-Id` (lo exige `PermisoGuard`), OpenAPI con cada código de error y respuestas de error `{ codigo, mensaje }`. Las listas responden `{ items, total }` con `pagina` (defecto 1) y `tamano` (defecto 20, máximo 100).

**Tenants (operador; `apps/api/src/org/consola-tenants.controller.ts`):**

| Método y ruta | Permiso | Entrada | Éxito |
| --- | --- | --- | --- |
| `GET /tenants` | `plat.tenant.consultar` | `?q=&estado=&producto=&pagina=&tamano=` | 200 `{ items: [{ id, codigo, nombre, estado, creado_en, suscripciones }], total }` |
| `GET /tenants/:id` | `plat.tenant.consultar` | — | 200 `{ id, codigo, nombre, estado, estado_motivo, estado_cambiado_en, version, creado_en, suscripciones, empresa_principal, historial }` |
| `POST /tenants/:id/estado` | `plat.tenant.cambiar_estado` (sensible) | `{ estado, motivo }` | 200 `{ cambiado, estado }` |

`POST /tenants` (spec 12) no cambia de ruta ni de contrato.

**Organización del cliente (tenant del token; `apps/api/src/org/`):**

| Método y ruta | Permiso | Caso de uso | Éxito |
| --- | --- | --- | --- |
| `GET /empresas?activo=` | `plat.organizacion.consultar` | `ListarEmpresas` | 200 lista |
| `POST /empresas` | `plat.empresa.crear` | `RegistrarEmpresa` | 201 `{ empresa_id, sucursal_principal_id }` |
| `PUT /empresas/:id` | `plat.empresa.crear` | `EditarEmpresa` | 204 |
| `GET /empresas/:id/sucursales?activo=` | `plat.organizacion.consultar` | `ListarSucursales` | 200 lista |
| `POST /empresas/:id/sucursales` | `plat.sucursal.gestionar` | `RegistrarSucursal` | 201 `{ sucursal_id }` |
| `PUT /sucursales/:id` | `plat.sucursal.gestionar` | `EditarSucursal` | 204 |
| `POST /sucursales/:id/inactivar` | `plat.sucursal.gestionar` | `InactivarSucursal` | 204 |
| `POST /sucursales/:id/principal` | `plat.sucursal.gestionar` | `MarcarSucursalPrincipal` | 204 |
| `GET /unidades?empresa_id=&sucursal_id=&tipo=&activo=` | `plat.organizacion.consultar` | `ListarUnidades` | 200 lista |
| `POST /unidades` | `plat.unidad.gestionar` | `RegistrarUnidad` | 201 `{ unidad_id }` |
| `PUT /unidades/:id` | `plat.unidad.gestionar` | `EditarUnidad` | 204 |
| `POST /unidades/:id/inactivar` | `plat.unidad.gestionar` | `InactivarUnidad` | 204 |

- Los cuerpos usan los campos del dominio en `snake_case`. Los `PUT` llevan `version`. La validación de formato es de zod; las reglas son del dominio, con sus mensajes.
- Los controladores de org no comprueban operador. El operador no administra organizaciones de clientes desde aquí.

Errores:

| `codigo` | HTTP | Cuándo |
| --- | --- | --- |
| `SOLICITUD_INVALIDA` | 400 | zod (campos, `tamano` > 100, `id` no UUID) |
| `SOLICITUD_INVALIDA` | 400 | Regla de dominio (`ValidationError`, con su mensaje): RUC inválido, motivo < 10 (TR-CA-018), establecimiento `0000` fuera de la principal, almacén sin sucursal (TR-CA-011) |
| `MFA_REQUERIDA` | 401 | Cambio de estado sin aal2 o MFA de más de 15 min |
| `SIN_PERMISO` | 403 | Sin el permiso del endpoint |
| `OPERADOR_REQUERIDO` | 403 | Endpoint de tenants y actor fuera del tenant operador |
| `NO_ENCONTRADO` | 404 | Id inexistente o de otro tenant |
| `CONFLICTO` | 409 | Regla de dominio: transición no permitida (TR-CA-017), RUC duplicado, tope de sucursales, principal sin reemplazo, padre de otra empresa |
| `VERSION_OBSOLETA` | 409 | `PUT` con `version` vieja |

`OrgFiltro` es el filtro del alta (spec 12), que ya mapeaba `validation_error` a `SOLICITUD_INVALIDA`, `not_found` a `NO_ENCONTRADO` y `conflict` a `CONFLICTO`. Los errores con código propio (`VERSION_OBSOLETA`, `OPERADOR_REQUERIDO`) salen con ese código.

### Manifiesto PLAT `1.6.0`

| Elemento | Detalle |
| --- | --- |
| Permiso `plat.tenant.consultar` | `TENANT`, no sensible. Lista y detalle de tenants (solo desde el operador) |
| Permiso `plat.tenant.cambiar_estado` | `TENANT`, **sensible** (RF-006, TR-RN-009) |
| Permiso `plat.organizacion.consultar` | `SUCURSAL`, no sensible. Listas de empresas, sucursales y unidades |
| Permiso `plat.empresa.crear` | `TENANT`, no sensible. Alta y edición de empresa |
| Permiso `plat.sucursal.gestionar` | `EMPRESA`, no sensible |
| Permiso `plat.unidad.gestionar` | `SUCURSAL`, no sensible |
| Rol `PLAT_ADMIN_TENANTS` | Suma `plat.tenant.consultar` y `plat.tenant.cambiar_estado` |
| Rol `PLAT_PROPIETARIO` | Suma `plat.organizacion.consultar`, `plat.empresa.crear`, `plat.sucursal.gestionar` y `plat.unidad.gestionar`. Sin permisos de tenants |
| Rol `PLAT_ADMIN_SEGURIDAD` | Suma `plat.organizacion.consultar` (selector de alcance del 16a) |
| Módulo `organizacion` | «Organización», orden 3 |
| Módulo `consola` | «Consola», orden 4 |

Opciones de menú:

| `codigo` | `modulo` | `padre` | `nombre` | `ruta` | `icono` | `orden` | `permisos` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `plat.organizacion` | `organizacion` | — | Organización | — | `corporate_fare` | 3 | — |
| `plat.organizacion.empresas` | `organizacion` | `plat.organizacion` | Empresas | `/admin/empresas` | `business` | 1 | `plat.organizacion.consultar` |
| `plat.organizacion.sucursales` | `organizacion` | `plat.organizacion` | Sucursales | `/admin/sucursales` | `store` | 2 | `plat.organizacion.consultar` |
| `plat.organizacion.unidades` | `organizacion` | `plat.organizacion` | Unidades | `/admin/unidades` | `view_module` | 3 | `plat.organizacion.consultar` |
| `plat.consola` | `consola` | — | Consola | — | `dns` | 4 | — |
| `plat.consola.tenants` | `consola` | `plat.consola` | Tenants | `/consola/tenants` | `apartment` | 1 | `plat.tenant.consultar` |

El filtrado del menú por app (consola o admin) es del 17b. Aquí solo se declaran las opciones.

## Plan de implementación

1. **Migración.**
   - `db/01a_org_consola.sql`, el inverso y `db/tests/01a_org_consola.test.sql` con un rol sin `BYPASSRLS`.
   - Casos: `tenants_listar` devuelve tenants de dos clientes; el filtro `SUSPENDIDO` devuelve solo `gym-fuerza-total`; `q`, `producto`, límite, desplazamiento y `total`; las columnas son solo las declaradas; `tenant_detalle` trae suscripciones, empresa principal e historial en orden; id inexistente da 0 filas; `anon` y `authenticated` no ejecutan ninguna de las dos.
   - Verificar: `pnpm nx test migrar` en local con PGlite; en CI `db:up` / `db:down` / `db:up`.
2. **`version` en las ediciones.**
   - `VersionObsoletaError` y la comparación en `EditarEmpresa`, `EditarSucursal` y `EditarUnidad`. Se ajustan las pruebas del 03.
   - Pruebas: versión vieja lanza `VersionObsoletaError` sin escribir ni publicar eventos; versión actual edita y sube la versión.
   - Verificar: `pnpm nx test org`.
3. **Lecturas de organización.**
   - Puerto, adaptador TypeORM, `ListarEmpresas`, `ListarSucursales` y `ListarUnidades`. Registro en `OrgModule`.
   - Pruebas de integración: paginación y `total`; filtros por `activo`, `empresa_id`, `sucursal_id` y `tipo`; orden; con el tenant A no aparece nada de B; `ListarSucursales` con empresa de B da `NotFoundError`.
   - Verificar: `pnpm nx test org` en CI.
4. **Controladores de organización.**
   - En `apps/api/src/org/`: `organizacion.http.ts` (zod, DTO, mapeos, constantes de página), `org.filtro.ts` y los tres controladores. `PERMISOS_ORG` con las dos constantes nuevas.
   - `apps/api/test/organizacion.http.spec.ts` (sin base, con `PermisoGuard` real): sin `plat.sucursal.gestionar`, alta, edición e inactivación de sucursal dan 403; `tamano=101` da 400; mapeo snake_case y errores.
   - `apps/api/test/organizacion.integracion.spec.ts` (`OrgModule` real sobre la base, con supertest): GWT TR-CA-004 a 012 con los RUC 20512345671 y 20498765433; empresa, sucursal o unidad de otro tenant en la URL da 404; `PUT` con versión vieja da 409 `VERSION_OBSOLETA`; unidad con padre de otra empresa da 409.
   - Verificar: `pnpm nx test api` y las rutas en `/v1/docs`.
5. **Operador compartido.**
   - `apps/api/src/org/operador.ts` con `ExigirOperador` y `OperadorRequeridoError`. `AltaTenant` lo usa.
   - Verificar: las pruebas del spec 12 (`alta-tenant*.spec.ts`) siguen en verde.
6. **Consola de tenants.**
   - `consulta-tenants.ts`, `consulta-tenants.typeorm.ts`, `consola-tenants.controller.ts`, `consola-tenants.http.ts` y registro en `AppModule`.
   - Pruebas supertest: lista con filtro `SUSPENDIDO`; propietario de un cliente con `PLAT_ADMIN_TENANTS` asignado recibe 403 `OPERADOR_REQUERIDO` en los tres endpoints, sin llamar a las funciones; detalle con historial; `BAJA → ACTIVO` da 409 (TR-CA-017); motivo de 9 caracteres da 400 (TR-CA-018); `ACTIVO → SUSPENDIDO` deja historial, `tenant.suspendido` en el outbox y responde `cambiado: true` (TR-CA-016); repetir el estado da 200 `cambiado: false` sin historial nuevo; sin MFA vigente da 401 `MFA_REQUERIDA`; id inexistente da 404.
   - Verificar: `pnpm nx test api` y las rutas en `/v1/docs`.
7. **Manifiesto PLAT `1.6.0`.**
   - Permisos, roles, módulos y opciones.
   - Verificar: `pnpm manifiesto:aplicar` contra la base de prueba aplica, y la segunda vez da 0 cambios. `PLAT_PROPIETARIO` no tiene `plat.tenant.*` ni `plat.suscripcion.gestionar`.
8. **Nube, dev (manual).**
   - `pnpm db:up:remoto` y `pnpm manifiesto:aplicar:remoto`. Revisar con el MCP que las funciones son de `org_lector`, que `org` no está en la Data API y que `get_advisors` no da alertas nuevas de RLS.
   - Prueba de humo con el operador: alta de un tenant de prueba (spec 12), lista y detalle, `ACTIVO → SUSPENDIDO` con MFA y un intento sin MFA. Como propietario, después de aceptar: listar empresas, crear una sucursal y una unidad. Borrar los datos de prueba (el operador queda).
   - Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Tenants (operador):**

- [ ] Con «polleria-dona-rosa» (`PRUEBA`) y «gym-fuerza-total» (`SUSPENDIDO`), `GET /v1/org/tenants?estado=SUSPENDIDO` desde el operador devuelve solo «gym-fuerza-total» con su estado y sus suscripciones.
- [ ] La lista devuelve solo `id`, `codigo`, `nombre`, `estado`, `creado_en` y `suscripciones`, y ninguna columna de empresa, sucursal, unidad ni membresía (TR-RNF-010).
- [ ] El propietario de «polleria-dona-rosa» con `PLAT_ADMIN_TENANTS` asignado recibe 403 `OPERADOR_REQUERIDO` en la lista, en el detalle y en el cambio de estado.
- [ ] `GET /v1/org/tenants/:id` trae suscripciones, empresa principal e historial de estados del más reciente al más antiguo. Un id inexistente da 404.
- [ ] `ACTIVO → SUSPENDIDO` con un motivo válido deja una fila en `org.tenant_estado_historial`, `tenant.suspendido` en el outbox y responde `cambiado: true` (TR-CA-016).
- [ ] `BAJA → ACTIVO` responde 409 y no escribe historial (TR-CA-017).
- [ ] Un motivo de menos de 10 caracteres responde 400 (TR-CA-018).
- [ ] Repetir el estado actual responde 200 con `cambiado: false` y sin historial nuevo.
- [ ] `POST /v1/org/tenants/:id/estado` con aal1 o MFA de más de 15 min responde 401 `MFA_REQUERIDA`.
- [ ] `POST /v1/org/tenants` (spec 12) sigue respondiendo igual y sus pruebas pasan.

**Organización del cliente:**

- [ ] Los GWT TR-CA-004 a 012 pasan por HTTP con los errores de dominio del 03 como `{ codigo, mensaje }` (TR-CA-005, 008, 009 y 011 incluidos).
- [ ] Un id de empresa, sucursal o unidad de otro tenant en la URL responde 404, no 403.
- [ ] Sin `plat.sucursal.gestionar`, el alta, la edición y la inactivación de sucursal responden 403.
- [ ] Un `PUT` con `version` vieja responde 409 `VERSION_OBSOLETA` y no cambia la fila.
- [ ] Una unidad con padre de otra empresa responde 409.
- [ ] Las tres listas responden `{ items, total }`, paginan con `tamano` 20 por defecto, rechazan `tamano` 101 con 400 y solo devuelven filas del tenant del token.
- [ ] Un propietario recién aceptado puede listar sus empresas, crear una sucursal y crear una unidad sin asignaciones adicionales.

**Manifiesto y permisos:**

- [ ] El manifiesto PLAT `1.6.0` declara los seis permisos de la tabla con su alcance y `plat.tenant.cambiar_estado` como sensible.
- [ ] `PLAT_PROPIETARIO` tiene los cuatro permisos de organización y ningún `plat.tenant.*`. `PLAT_ADMIN_TENANTS` tiene `plat.tenant.consultar` y `plat.tenant.cambiar_estado`. `PLAT_ADMIN_SEGURIDAD` tiene `plat.organizacion.consultar`.
- [ ] `mi-contexto` de un propietario trae en el menú el módulo «Organización» con Empresas, Sucursales y Unidades, y no trae «Consola».
- [ ] Aplicar el manifiesto dos veces deja 0 cambios la segunda.

**Aislamiento, migraciones y calidad:**

- [ ] Con un rol sin `BYPASSRLS`, solo `org.tenants_listar` y `org.tenant_detalle` leen entre tenants. `anon` y `authenticated` no las ejecutan.
- [ ] Ningún endpoint de tenants llama a esas funciones antes de la comprobación de operador.
- [ ] Todos los endpoints nuevos figuran en `/v1/docs` con su permiso y sus códigos de error.
- [ ] `org` no importa `seguridad`, `correlativos` ni `parametros`, y `src/domain` no importa `@nestjs/*` ni `typeorm` (Nx en CI).
- [ ] Ninguna respuesta de error ni log incluye RUC ni correo.
- [ ] Cobertura de líneas de `src/domain/**` de `org` ≥ 70 %.
- [ ] `db:up && db:down && db:up` termina con 0 en CI y `db:down` deja la base como la dejó el spec 12.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, `01a_org_consola.sql` está aplicada y el manifiesto PLAT `1.6.0` figura en `seg.manifiesto_aplicado`.
- [ ] En dev, el operador lista, consulta y suspende un tenant de prueba con MFA, y sin MFA recibe `MFA_REQUERIDA`.
- [ ] En dev, el propietario del tenant de prueba crea una sucursal y una unidad. Los datos de prueba se borran al final.
- [ ] Las horas reales quedan registradas en el plan.

## Decisiones

- **Sí:** un spec de back «org-http» que deja a 17b y 17c solo front (D3 del contexto, roadmap).
- **Sí:** operador frente a cliente por permiso más la comprobación de tenant operador, con `OPERADOR_REQUERIDO`. No se usa `tipo_usuario` y `mi-contexto` no cambia (D2, decisión del usuario).
- **Sí:** `ExigirOperador` compartido en `apps/api/src/org/operador.ts`. La regla del 12 era privada de `AltaTenant` y ahora la usan cuatro endpoints.
- **Sí:** todos los controladores de org en `apps/api/src/org/`, como el alta. Decisión del usuario al implementar el paso 4. PL-10 solo deja a org depender del kernel (`comp('org', 'kernel')`) y `seg` puede depender de `org`. Los controladores necesitan `@Permiso` de seguridad. La lógica sigue en `libs/plataforma/org`.
- **No:** controladores en `libs/plataforma/org/src/interface`. Org importaría seguridad, lo que rompe PL-10 y arma un ciclo seg ↔ org.
- **No:** mover `@Permiso` al kernel para usarlo desde org. Toca seguridad, correlativos y parámetros, fuera del alcance del 17a.
- **Sí:** lista y detalle de tenants con funciones `SECURITY DEFINER` de dueño `org_lector`, que solo se llaman después de la comprobación de operador (D5). La RLS de `org.tenant` es por `id`.
- **Sí:** el historial va en el detalle (P5). Sale de la misma función sin costo extra.
- **Sí:** `plat.tenant.cambiar_estado` es sensible (D4, RF-006).
- **Sí:** `plat.tenant.consultar` y `plat.organizacion.consultar` como permisos de lectura (P1). `@Permiso` recibe un solo código.
- **Sí:** alcances `plat.empresa.crear` `TENANT` (también para editar), `plat.sucursal.gestionar` `EMPRESA`, `plat.unidad.gestionar` y `plat.organizacion.consultar` `SUCURSAL`. Ninguno es sensible (P2).
- **Sí:** `plat.organizacion.consultar` también en `PLAT_ADMIN_SEGURIDAD`, para que quien invita llene el selector de alcance del 16a (brecha 2).
- **Sí:** opciones de menú en este spec, junto con los permisos (P4). 16a y 17b no tocan el manifiesto.
- **Sí:** listas paginadas con `{ items, total }`, `tamano` 20 por defecto y máximo 100 (P3, decisión del usuario).
- **Sí:** las listas de organización devuelven todo el tenant (decisión del usuario). El 16a ya rechaza con TR-RN-008 si el otorgante no cubre el alcance.
- **No:** filtrar las listas por alcance. org no puede importar seguridad y sumaría una orquestación en `apps/api`.
- **Sí:** lecturas por un puerto propio (`LecturaOrganizacion`) con `QueryBuilder`, como `ListarSeries`. Los repositorios devuelven agregados y no paginan.
- **No:** métodos `listar` en los repositorios de agregados. Mezclarían lectura paginada con el bloqueo optimista de `RepositorioBase`.
- **Sí:** `version` obligatoria en las ediciones y `VersionObsoletaError` (409). Sin ella, el GWT de conflicto no se puede cumplir: hoy la versión se lee en el servidor.
- **No:** `If-Match` o ETag. El campo `version` en el cuerpo es más simple y la lista ya lo devuelve.
- **Sí:** inactivar sucursal o unidad sin motivo (decisión del usuario). Se respeta el 03.
- **Sí:** cambio de estado sin `fecha_efectiva` por HTTP. Siempre es "ahora" y basta para RF-006 en R1.
- **No:** declarar `plat.suscripcion.gestionar` en el manifiesto. RF-005 no tiene endpoint. La constante queda en `PERMISOS_ORG`.
- **Sí:** se respeta lo implementado para la longitud del motivo: ORG 10-500 (D1).
- **Sí:** el tope de sucursales sigue siendo el menor `limite_sucursales` de las suscripciones vigentes (decisión del 03). Este spec no lo cambia.
- **Sí:** verificación manual en Supabase dev, como el 12 (decisión del usuario).
- **Sí:** RUC de prueba 20512345671 y 20498765433. El 20512345678 del SRS no pasa el módulo 11.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `PermisoGuard` evalúa el alcance en `X-Sucursal-Id` y no en la empresa o sucursal de la URL. Un actor con `plat.sucursal.gestionar` de alcance `EMPRESA` sobre Y podría crear una sucursal en X | `PLAT_PROPIETARIO` tiene alcance `TENANT` y no le afecta. El control fino por recurso (como `AlcanceActor.cubre` en series) llega cuando existan roles de cliente con alcance menor (16b). Queda anotado en el 16b. |
| El propietario no ve una sucursal nueva en el selector hasta recargar `mi-contexto` (TR-CA-007) | El 17c recarga el contexto después del alta. Si `seg.sucursales_accesibles` pasa por la caché de 60 s, se anota en el 17c. |
| `ALTER FUNCTION ... OWNER TO org_lector` o las políticas nuevas fallan en Supabase | Es el mismo camino que `org.tenant_por_codigo`, ya probado en dev en el spec 12. |
| Cambiar `version` a obligatoria rompe llamadas existentes a las ediciones | Hoy solo las llaman las pruebas del 03, y se ajustan en el paso 2. `AltaTenant` no edita. |
| Un operador que también es miembro de un tenant cliente entra con `tenant_preferido` y no puede cambiar (no hay `mi-tenant`) | Riesgo aceptado en dev. El operador usa un correo propio (brecha 3). |
| El manifiesto `1.6.0` choca con cambios de 16a o 17b | 17a va antes en la ola 6. Los otros specs no tocan `plat.manifiesto.json`, y si lo tocan van después. |

## Lo que **no** está en este spec

- UI de consola (17b) y de administración de organización (17c).
- Suscripción editable por HTTP (TR-RF-005).
- Inactivar empresa y motivo al inactivar sucursal o unidad.
- Listas filtradas por el alcance del actor y control de alcance por recurso.
- `fecha_efectiva` futura del cambio de estado.
- Padrón RUC, catálogos `UBIGEO` y `TIPO_UNIDAD`, selector de tenant, visor de auditoría y correos de estado.

Cada uno entra en su propio spec cuando su sprint lo pida.
