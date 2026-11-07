# SPEC 19a — Catálogos: núcleo con globales, mixtos y del tenant, vigencia, caché con ETag y `CatalogoPort`

> **Status:** Implementado
> **Depends on:** SPEC 02, SPEC 03, SPEC 06, SPEC 12, SPEC 17a, SPEC 18b
> **Date:** 2026-11-07
> **Objective:** Crear `libs/plataforma/catalogos` (TR-CAT) con el esquema `cat`, la administración de catálogos e ítems globales (solo operador) y propios o personalizados (tenant) bajo `/v1/catalogos`, la lectura de ítems vigentes con caché Redis y ETag/304, y `CatalogoPort.validarItem` para los productos.

## Por qué existe este spec

Fila 19a de `docs/roadmap-specs.md` (D-03). Contexto de apoyo: `docs/spec-context/19-cat-catalogos.md`. Su sección 0 fijó la partición 19a/19b; su sección 9 queda resuelta por las Decisiones de este spec.

El roadmap pone como dependencia el spec 07, que no existe: el 06 absorbió `@Permiso` y `X-Sucursal-Id`. Las demás dependencias:

- **02**: `TypeOrmUnitOfWork`, `AlsTenantContext`, `OutboxPublisher`, `Clock`.
- **03**: `org.tenant` (FK de `tenant_id`).
- **12 y 17a**: regla de operador (`ORG_TENANT_OPERADOR`) y `ExigirOperador` en `apps/api/src/org/operador.ts`.
- **18b**: deja el manifiesto PLAT en `1.8.0`; este spec lo sube a `1.9.0`. 18b debe estar integrado en `main` antes de implementar.

No existe DDL ni código de CAT en `codigo/` (`db/01d_cat_seq.sql` y `transversal/sql/04_cat` no están). Todo se escribe desde cero.

RF cubiertos (solo back; la UI va en el 19b):

- **TR-RF-022** administrar catálogos globales.
- **TR-RF-023** administrar ítems con vigencia.
- **TR-RF-024** consultar ítems con caché.
- **TR-RF-025** personalizar ítems globales por tenant.
- **TR-RF-026** registrar ítems propios del tenant.
- **TR-RF-027** validar valor contra catálogo.

Criterios del SRS: **TR-CA-058 a 071**. Los de operador, aislamiento, MFA, Redis caído y versión obsoleta son propios de este spec.

Reglas: **TR-RN-012** (GLOBAL normativo no editable por el tenant; MIXTO admite propios y ajustes; TENANT íntegro del cliente), **TR-RN-013** (ítem referenciado no se elimina; código único por catálogo y tenant), **TR-RN-009** (cambios globales sensibles), **TR-RN-001** (tenant en toda fila del tenant).

RNF propios:

- **TR-RNF-102**: lectura desde caché con ETag y 304; p95 < 50 ms con caché caliente.
- **TR-RNF-027**: catálogos propios por tenant sin cambios de código.
- **TR-RNF-021**: la confirmación con motivo es de la UI (19b); el back responde 409 con la alternativa de cerrar vigencia.

RNF heredados: 002, 008, 010, 012, 013 (fila con actor y fecha más evento; persistencia en el spec 20), 024, 025, 026, 101, 106, 119.

Historia del backlog: **D-03** completa. Estimado: 8-9 h (el plan dice 7; la verificación en dev y las funciones `SECURITY DEFINER` suman).

## Alcance

**In:**

- **Migración** `db/01f_cat.sql`, su inverso `db/rollback/01f_cat.sql` y prueba `db/tests/01f_cat.test.sql`. Corre después de `01e_sync_relay.sql` por orden de nombre.
- **Semilla** en la misma migración: 4 catálogos y sus ítems base (ver Modelo de datos).
- **Lib nueva** `libs/plataforma/catalogos` (proyecto `catalogos`, etiquetas `scope:plataforma`, `type:backend`, `comp:cat`, alias `@vitrina/plataforma/catalogos`). Estructura `domain · application · infrastructure · interface · test`, con build, Jest y tsconfig copiados de `correlativos`.
- **Dominio** en `domain/`: tipos, código de catálogo, agregados `Catalogo` e `ItemCatalogo`, `AjusteItem`, `Vigencia`, `AtributosItem`, eventos, errores y `PERMISOS_CAT`.
- **Casos de uso** en `application/`: `CrearCatalogo`, `ActualizarCatalogo`, `ListarCatalogos`, `GuardarItemGlobal`, `EliminarItemGlobal`, `GuardarItemPropio`, `EliminarItemPropio`, `AjustarItem`, `ConsultarItems` y `ValidarItem` (detrás de `CatalogoPort`).
- **Puertos** en `application/ports/` y adaptadores en `infrastructure/typeorm/` y `infrastructure/redis/`.
- **Interfaz**: `interface/catalogos.controller.ts` y `interface/catalogos.http.ts` con 11 rutas bajo `/v1/catalogos`, zod y OpenAPI.
- **`apps/api`**: `CatalogosModule.register({ redisUrl, verificadorOperador })` en `AppModule`, adaptador `VerificadorOperadorOrg` en `apps/api/src/catalogos/verificador-operador.ts` que usa `ExigirOperador`, y `ENTIDADES_CAT` en el `DataSource`.
- **Manifiesto PLAT `1.9.0`**: 5 permisos `plat.catalogo.*` y su reparto en roles. Sin opciones de menú.
- **Pruebas**: dominio y aplicación (Jest), SQL contra PostgreSQL 16 (PGlite en local, PostgreSQL 16 en CI), integración con PostgreSQL 16 y Redis 7 (CI), HTTP con supertest.
- **Nube, dev (manual)**: migración, manifiesto `1.9.0`, revisión de Data API y advisors, y prueba de humo.

**Out of scope (para otros specs):**

- UI de consola (globales e ítems) y de admin cliente (propios y personalización): spec 19b. Ese spec trae la sección «Diseño UI» de `CLAUDE.md`. Pantallas tipo propuestas: lista para catálogos; detalle con `vit-tabla` para ítems; formulario para crear o editar ítems y ajustes; confirmación con `AvisosService` y `vit-destructivo` para eliminar o cerrar vigencia (usa el 409 `ITEM_REFERENCIADO`); y vista móvil con `ColumnaTabla.movil`. Estados con `vit-chip-estado` y un mapa de tonos para `VISIBLE`, `INACTIVO`, `FUERA_DE_VIGENCIA` y `OCULTO`. Se verifica en tema claro y oscuro, a 600 px y con el MCP `playwright`.
- Lista de administración de ítems con inactivos, futuros y ocultos (la necesita la UI): spec 19b.
- Importador de tablas oficiales TR-RF-028 y carga completa de UBIGEO, CIE-10 y tablas SUNAT: spec 19b.
- Feriados y `CalendarioPort` (TR-RF-029): spec 19b.
- `<ui-catalogo-select>`: sin RF ni historia; spec 15 o 25 si se necesita.
- Verificadores de referencias reales de los productos (SazónPOS: spec 25; personas: R2).
- Opciones de menú de catálogos: llegan con la UI del 19b.
- Auditoría persistente TR-AUD (spec 20) y relay del outbox (ya en el 11).
- Validar un valor contra `regex` o `longitud` del ítem: el puerto devuelve los atributos y el producto valida.
- Proyecto prod (plan de migración a producción).

## Base de código reutilizada

**Se conserva (como patrón):**

- `db/01c_cfg.sql`: RLS `ENABLE + FORCE` con `NULLIF(current_setting('app.tenant_id', true), '')::uuid`, tabla de versión por tenant con trigger `SECURITY DEFINER` y función `versiones`.
- `db/01a_org_alta.sql` y `01a_org_consola.sql`: rol `NOLOGIN` dueño de funciones `SECURITY DEFINER`, `GRANT <rol> TO current_user` para el `OWNER TO`, políticas `TO <rol>`, `REVOKE EXECUTE ... FROM PUBLIC`.
- `db/01d_seq.sql`: `REVOKE ALL` del esquema a `anon` y `authenticated` si existen (regla 8).
- `libs/plataforma/parametros`: `ResolverParametro` (caché con versiones en la clave, respaldo a la base si Redis falla, `aviso`), `CacheParametrosRedis` (cliente de `crearClienteRedis`, `lazyConnect`), `cache-parametros.memoria.ts`.
- `libs/plataforma/correlativos`: registro del módulo, `EntitySchema` con `mapeo.ts`, filtro de errores propio en `*.http.ts`, esquemas de eventos.
- `seguridad`: `@Permiso`, `PermisoGuard` (exige `X-Sucursal-Id`, step-up por permiso sensible), `ContextoTenantInterceptor`, `Principal`.
- `apps/api/src/org/operador.ts`: `ExigirOperador` y `OperadorRequeridoError`.

**Cambia:**

- `plat.manifiesto.json` pasa a `1.9.0`.
- `apps/api/src/app.module.ts` registra `CatalogosModule` y `ENTIDADES_CAT`.
- `OperadorRequeridoError` admite el mensaje por parámetro, con «Solo el tenant operador puede administrar tenants» por defecto. Catálogos usa «Solo el tenant operador puede administrar catálogos globales».

**No existe** y se escribe desde cero: esquema `cat`, rol `cat_editor`, toda la lib `catalogos` y sus pruebas.

## Modelo de datos

### Migración `db/01f_cat.sql`

```sql
CREATE SCHEMA cat;

CREATE TABLE cat.catalogo (
  id                   uuid         PRIMARY KEY,
  codigo               varchar(60)  NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z][A-Z0-9_]{2,59}$'),
  nombre               varchar(150) NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 150),
  alcance              varchar(6)   NOT NULL CHECK (alcance IN ('GLOBAL','MIXTO','TENANT')),
  fuente               varchar(150) NULL,
  editable_por_tenant  boolean      NOT NULL,
  version              bigint       NOT NULL DEFAULT 1,   -- versión de contenido global y bloqueo optimista
  creado_por           uuid         NULL REFERENCES seg.usuario (id),   -- NULL en la semilla
  creado_en            timestamptz  NOT NULL DEFAULT now(),
  modificado_por       uuid         NULL REFERENCES seg.usuario (id),
  modificado_en        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_catalogo_editable CHECK ((alcance = 'GLOBAL') = (NOT editable_por_tenant))
);

CREATE TABLE cat.catalogo_item (
  id               uuid         PRIMARY KEY,
  catalogo_id      uuid         NOT NULL REFERENCES cat.catalogo (id),
  tenant_id        uuid         NULL REFERENCES org.tenant (id),   -- NULL: ítem global
  codigo           varchar(40)  NOT NULL CHECK (char_length(codigo) BETWEEN 1 AND 40),
  codigo_externo   varchar(40)  NULL,
  nombre           varchar(200) NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 200),
  abreviatura      varchar(30)  NULL,
  orden            integer      NOT NULL DEFAULT 0,
  atributos        jsonb        NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(atributos) = 'object'),
  vigente_desde    date         NOT NULL,
  vigente_hasta    date         NULL,
  activo           boolean      NOT NULL DEFAULT true,
  version          bigint       NOT NULL DEFAULT 0,
  creado_por / creado_en / modificado_por / modificado_en,   -- igual que cat.catalogo
  CONSTRAINT ck_item_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);
-- ux_cat_item: código único por catálogo y dueño (TR-RN-013).
CREATE UNIQUE INDEX ux_cat_item ON cat.catalogo_item
  (catalogo_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);

CREATE TABLE cat.catalogo_item_tenant (       -- ajustes de un ítem global en un catálogo MIXTO (TR-RF-025)
  item_id        uuid         NOT NULL REFERENCES cat.catalogo_item (id),
  tenant_id      uuid         NOT NULL REFERENCES org.tenant (id),
  visible        boolean      NOT NULL DEFAULT true,
  orden          integer      NULL,              -- NULL: el del ítem global
  alias          varchar(200) NULL,              -- NULL: el nombre global
  version        bigint       NOT NULL DEFAULT 0,
  modificado_por uuid         NOT NULL REFERENCES seg.usuario (id),
  modificado_en  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, tenant_id)
);

CREATE TABLE cat.version_tenant (             -- versión de lo propio de un tenant en un catálogo
  catalogo_id  uuid        NOT NULL REFERENCES cat.catalogo (id),
  tenant_id    uuid        NOT NULL REFERENCES org.tenant (id),
  version      bigint      NOT NULL DEFAULT 1,
  cambiado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalogo_id, tenant_id)
);
```

- `ck_catalogo_editable`: GLOBAL nunca es editable por el tenant; MIXTO y TENANT siempre lo son (TR-CA-059, TR-RN-012).
- Coherencia ítem y catálogo (trigger `cat.validar_item`, `BEFORE INSERT OR UPDATE` en `catalogo_item`): en GLOBAL solo ítems con `tenant_id` NULL; en TENANT solo ítems con `tenant_id`; en MIXTO ambos. Defensa ante escrituras que no pasen por el dominio (importador del 19b).
- Un ajuste solo apunta a un ítem global de un catálogo MIXTO: lo valida el trigger `cat.validar_ajuste`.
- No hay `ON DELETE CASCADE`: eliminar un ítem global con ajustes borra antes los ajustes dentro de `cat.eliminar_item_global`.
- El inverso borra el esquema `cat` completo (`DROP SCHEMA cat CASCADE`) y el rol `cat_editor` si no tiene otros objetos.

### Versiones (triggers `SECURITY DEFINER`, dueño `cat_editor`)

- `cat.subir_version_global()`: `AFTER INSERT OR UPDATE OR DELETE` en `catalogo_item` con `tenant_id` NULL. Hace `UPDATE cat.catalogo SET version = version + 1`.
- `cat.subir_version_tenant()`: `AFTER INSERT OR UPDATE OR DELETE` en `catalogo_item` con `tenant_id` y en `catalogo_item_tenant`. Hace `INSERT ... ON CONFLICT (catalogo_id, tenant_id) DO UPDATE SET version = version + 1` en `cat.version_tenant`.
- Los cambios de la definición del catálogo suben `cat.catalogo.version` en `cat.actualizar_catalogo`.
- La semilla deja cada catálogo en versión 1: inserta los ítems y luego fija `version = 1`.

### RLS, rol y Data API

- Rol `cat_editor` `NOLOGIN`, sin `BYPASSRLS`, mismo patrón que `org_lector`. Tiene `SELECT, INSERT, UPDATE, DELETE` sobre las tablas de `cat`. Es dueño de las funciones `SECURITY DEFINER`.
- `ENABLE + FORCE` en las cuatro tablas.

| Tabla | Rol de la app | `cat_editor` |
| --- | --- | --- |
| `catalogo` | `SELECT USING (true)`. Sin escritura | Todo |
| `catalogo_item` | `SELECT` con `tenant_id IS NULL OR tenant_id = app.tenant_id`; `INSERT`, `UPDATE`, `DELETE` solo con `tenant_id = app.tenant_id` | Todo (incluye leer propios de todos los tenants para la colisión de códigos) |
| `catalogo_item_tenant` | Todo con `tenant_id = app.tenant_id` | `SELECT` y `DELETE` |
| `version_tenant` | `SELECT` con `tenant_id = app.tenant_id` | Todo |

- `REVOKE ALL` del esquema, tablas y funciones de `cat` a `anon` y `authenticated` si existen (regla 8).

### Funciones SQL (`SET search_path = ''`)

```sql
-- SECURITY INVOKER, STABLE. 0 filas si el catálogo no existe o p_tenant no es app.tenant_id.
cat.versiones(p_codigo varchar, p_tenant uuid)
  RETURNS TABLE (catalogo_id uuid, version_global bigint, version_tenant bigint)

-- SECURITY INVOKER, STABLE. Todos los ítems visibles para el tenant con su estado en p_fecha.
-- estado: VISIBLE, INACTIVO, FUERA_DE_VIGENCIA u OCULTO. nombre con alias aplicado; orden con el ajuste aplicado.
cat.items(p_codigo varchar, p_tenant uuid, p_fecha date)
  RETURNS TABLE (item_id uuid, codigo varchar, codigo_externo varchar, nombre varchar,
                 atributos jsonb, orden integer, propio boolean, estado varchar)

-- SECURITY DEFINER (cat_editor). Escritura de globales; la app comprueba operador antes.
cat.crear_catalogo(p_id uuid, p_codigo varchar, p_nombre varchar, p_alcance varchar, p_fuente varchar,
                   p_editable boolean, p_por uuid) RETURNS bigint                      -- versión
cat.actualizar_catalogo(p_id uuid, p_version bigint, p_nombre varchar, p_fuente varchar,
                        p_editable boolean, p_por uuid) RETURNS bigint                 -- NULL si version no coincide
cat.guardar_item_global(p_id uuid, p_version bigint /* NULL al crear */, p_catalogo uuid, p_codigo varchar,
                        p_codigo_externo varchar, p_nombre varchar, p_abreviatura varchar, p_orden int,
                        p_atributos jsonb, p_desde date, p_hasta date, p_activo boolean, p_por uuid)
  RETURNS bigint                                                                        -- NULL si version no coincide
cat.eliminar_item_global(p_id uuid, p_version bigint) RETURNS boolean
```

- Estado en `cat.items`, en este orden: `activo = false` → `INACTIVO`; fuera de `[vigente_desde, vigente_hasta]` (inclusive) → `FUERA_DE_VIGENCIA`; ajuste con `visible = false` → `OCULTO`; si no, `VISIBLE`.
- `cat.guardar_item_global` rechaza un código que ya usa un ítem propio de cualquier tenant con `SQLSTATE 23505`. El mensaje no dice qué tenant lo usa.
- SQL crudo justificado por la regla 11: `cat.items` combina tres tablas con prioridad de ajustes (lo nombra el SRS) y las escrituras de globales necesitan `SECURITY DEFINER`. Las escrituras de propios y ajustes van con TypeORM.

### Semilla

| Catálogo | Alcance | Fuente | Ítems |
| --- | --- | --- | --- |
| `MEDIO_PAGO` | MIXTO | — | `EFECTIVO` Efectivo, `YAPE` Yape, `PLIN` Plin, `TARJETA` Tarjeta |
| `TIPO_DOC_IDENTIDAD` | GLOBAL | SUNAT catálogo 06 | `DNI` (externo `1`, atributos `{"longitud": 8, "regex": "^[0-9]{8}$"}`), `RUC` (`6`, longitud 11), `CE` (`4`), `PASAPORTE` (`7`) |
| `TIPO_COMPROBANTE` | GLOBAL | SUNAT catálogo 01 | `01` Factura, `03` Boleta de venta, `07` Nota de crédito, `08` Nota de débito |
| `ESPECIALIDAD` | MIXTO | — | `MED_GEN` Medicina general |

Todos con `vigente_desde = 2026-01-01`. Los ítems propios de los GWT («Tarjeta Diners», especialidad de la clínica) solo existen en las pruebas.

### Dominio

```ts
// domain/tipos.ts
export type AlcanceCatalogo = 'GLOBAL' | 'MIXTO' | 'TENANT';
export type MotivoInvalido = 'INEXISTENTE' | 'INACTIVO' | 'FUERA_DE_VIGENCIA' | 'OCULTO';
export const ZONA_CATALOGOS = 'America/Lima';

// domain/catalogo.ts (AggregateRoot con version)
export class Catalogo extends AggregateRoot {
  static crear(datos: { id; codigo; nombre; alcance; fuente; editablePorTenant; por; ahora }): Catalogo;
  actualizar(datos: { nombre; fuente; editablePorTenant; por; ahora }): boolean;   // false si no cambia
  admiteItemsGlobales(): boolean;      // GLOBAL o MIXTO
  admiteItemsPropios(): boolean;       // MIXTO o TENANT
  admiteAjustes(): boolean;            // MIXTO
}

// domain/item-catalogo.ts (AggregateRoot con version)
export class ItemCatalogo extends AggregateRoot {
  static crear(datos: { id; catalogo: Catalogo; tenantId: string | null; codigo; codigoExterno; nombre;
                        abreviatura; orden; atributos: AtributosItem; vigencia: Vigencia; por; ahora }): ItemCatalogo;
  actualizar(datos: { ...mismos campos salvo codigo y tenantId }): boolean;      // el código no cambia
}

// domain/vigencia.ts
export class Vigencia { static de(desde: string, hasta: string | null): Vigencia; incluye(fecha: string): boolean }

// domain/atributos-item.ts: objeto JSON ≤ 4 KB; claves conocidas tipadas, el resto se conserva.
export interface AtributosItem { longitud?: number; regex?: string; valida_reniec?: boolean; mascara?: string; [clave: string]: unknown }

// domain/ajuste-item.ts
export class AjusteItem { static de(datos: { visible: boolean; orden: number | null; alias: string | null }): AjusteItem;
                          esNeutro(): boolean }   // visible, sin orden ni alias: se borra la fila
```

Validaciones:

| Regla | Error |
| --- | --- |
| `codigo` de catálogo `^[A-Z][A-Z0-9_]{2,59}$` | `CatalogoInvalidoError` «El código debe tener de 3 a 60 mayúsculas, dígitos o guion bajo» |
| `nombre` de catálogo de 3 a 150 | `CatalogoInvalidoError` «El nombre debe tener de 3 a 150 caracteres» |
| GLOBAL con `editable_por_tenant = true` | `CatalogoInvalidoError` «Un catálogo normativo global no puede ser editable por el tenant» (TR-CA-059) |
| MIXTO o TENANT con `editable_por_tenant = false` | `CatalogoInvalidoError` «Un catálogo mixto o del tenant debe ser editable por el tenant» |
| Cambiar `alcance` después de crear | `CatalogoInvalidoError` «El alcance de un catálogo no se cambia» |
| `codigo` de ítem de 1 a 40, `nombre` de 1 a 200, `abreviatura` ≤ 30, `codigo_externo` ≤ 40 | `ItemInvalidoError` con el campo |
| `vigente_hasta` < `vigente_desde` | `ItemInvalidoError` «La vigencia final no puede ser anterior a la inicial» |
| `atributos`: `longitud` entero 1-100, `regex` ≤ 200 y compila, `valida_reniec` booleano, `mascara` ≤ 50, total ≤ 4 KB | `ItemInvalidoError` con la clave |
| Ítem propio en catálogo GLOBAL, o global en TENANT | `AlcanceNoPermiteError` |
| Ajuste en catálogo que no es MIXTO, o sobre un ítem propio | `AlcanceNoPermiteError` (TR-CA-067) |
| `alias` de 1 a 200 | `ItemInvalidoError` |

Errores de dominio nuevos (heredan de los del kernel):

| Clase | `code` | HTTP | Mensaje |
| --- | --- | --- | --- |
| `CatalogoInvalidoError(mensaje)` | `CATALOGO_INVALIDO` | 400 | Tabla anterior |
| `ItemInvalidoError(mensaje)` | `ITEM_INVALIDO` | 400 | Tabla anterior |
| `CatalogoNoExisteError` | `CATALOGO_NO_EXISTE` | 404 | El catálogo no existe (TR-CA-065) |
| `ItemNoEncontradoError` | `ITEM_NO_ENCONTRADO` | 404 | El ítem no existe |
| `CatalogoDuplicadoError` | `CATALOGO_DUPLICADO` | 409 | Ya existe un catálogo con ese código |
| `CodigoItemDuplicadoError` | `CODIGO_DUPLICADO` | 409 | El código ya existe en el catálogo (TR-CA-069) |
| `ItemReferenciadoError` | `ITEM_REFERENCIADO` | 409 | El ítem está en uso; cierre su vigencia o inactívelo (TR-CA-061) |
| `AlcanceNoPermiteError` | `ALCANCE_NO_PERMITE` | 409 | El alcance del catálogo no permite esta operación |
| `VersionObsoletaError` | `VERSION_OBSOLETA` | 409 | Otro usuario modificó el registro; recargue |

Se reutilizan: `OperadorRequeridoError` (403, por el puerto) y `NoActiveTransactionError` (kernel).

### Puertos (`application/ports/`)

```ts
// Exportado en index.ts: lo usan los productos (TR-RNF-119).
export const CATALOGO_PORT = Symbol('CatalogoPort');
export interface CatalogoPort {
  /** Tenant del TenantContext. Lee de la caché; si Redis falla, de la base. CatalogoNoExisteError si no existe. */
  validarItem(catalogo: string, codigo: string): Promise<{ valido: boolean; motivo: MotivoInvalido | null; atributos: AtributosItem | null }>;
}

// Exportado: apps/api lo implementa con ExigirOperador.
export const VERIFICADOR_OPERADOR = Symbol('VerificadorOperador');
export interface VerificadorOperador { exigir(tenantId: string): Promise<void> }   // OperadorRequeridoError

// Exportado: los productos registran el suyo (spec 25, R2). Por defecto, lista vacía: nada está referenciado.
export const VERIFICADORES_REFERENCIAS = Symbol('VerificadoresReferencias');
export interface VerificadorReferencias { estaReferenciado(item: { itemId: string; catalogo: string; codigo: string }): Promise<boolean> }

RepositorioCatalogos   { buscarPorCodigo(codigo): Catalogo | null; listar(): Catalogo[];
                         crear(catalogo); actualizar(catalogo, versionAnterior): boolean }        // funciones DEFINER
RepositorioItems       { buscar(id): ItemCatalogo | null; existeCodigo(catalogoId, tenantId, codigo): boolean;
                         guardarGlobal(item, versionAnterior | null): boolean; eliminarGlobal(id, version): boolean;
                         guardarPropio(item, versionAnterior | null): boolean; eliminarPropio(id, version): boolean }
RepositorioAjustes     { guardar(itemId, ajuste, versionAnterior | null): boolean; borrar(itemId): void }
LecturaItems           { versiones(codigo, tenantId): Versiones | null; items(codigo, tenantId, fecha): FilaItem[] }
CacheItems             { leer(clave): ItemsEnCache | null; guardar(clave, valor, ttlSegundos): void }
```

- `existeCodigo` con `tenantId` busca entre los globales y los propios del tenant: un propio no puede repetir un global (TR-CA-069).
- `CacheItems` tiene `CacheItemsRedis` (`infrastructure/redis/`, mismo cliente que `parametros`) y `CacheItemsMemoria` para pruebas.

### Caché y ETag

```ts
// Las versiones y la fecha van en la clave: un cambio o un día nuevo cambian la clave y la anterior expira por TTL.
claveItems = `cat:${codigo}:${tenantId}:${versionGlobal}.${versionTenant}:${fecha}`;   // fecha YYYY-MM-DD en America/Lima
etag       = `"${versionGlobal}.${versionTenant}.${fecha}"`;
export const TTL_ITEMS_SEGUNDOS = 86_400;

interface ItemsEnCache {
  visibles: ItemVisible[];                                   // ordenados por orden y luego nombre
  noVisibles: Record<string, { motivo: MotivoInvalido; atributos: AtributosItem }>;  // por código
}
```

- `versionTenant` es 0 si el tenant no tiene propios ni ajustes en el catálogo.
- La fecha sale del `Clock` en `America/Lima`. Un ítem con vigencia futura aparece el día que empieza sin invalidar nada (TR-CA-062).
- La invalidación es por versión en la clave al commit. No se borran claves ni se mantiene un índice.
- Un catálogo inexistente no se cachea.

### Casos de uso: puntos no obvios

**Globales (`CrearCatalogo`, `ActualizarCatalogo`, `GuardarItemGlobal`, `EliminarItemGlobal`)** (TR-RF-022, 023):

1. `VerificadorOperador.exigir(tenant del actor)` antes de cualquier lectura. Fuera del operador → 403 `OPERADOR_REQUERIDO`.
2. Validación en el dominio; escritura con la función `SECURITY DEFINER`; `catalogo.actualizado` en el outbox en la misma transacción.
3. `version` del cuerpo distinta de la guardada → `VersionObsoletaError`. Sin cambios → 200 sin escribir ni publicar (TR-RNF-008).
4. `EliminarItemGlobal`: si algún `VerificadorReferencias` responde `true` → `ItemReferenciadoError` sin borrar (TR-CA-061). Si no, borra los ajustes y el ítem.

**Propios (`GuardarItemPropio`, `EliminarItemPropio`)** (TR-RF-023, 026):

1. Catálogo MIXTO o TENANT; si no, `AlcanceNoPermiteError`.
2. `tenant_id` del contexto, nunca del cuerpo. Un id global o de otro tenant → `ItemNoEncontradoError`.
3. Código repetido con un global o con un propio del tenant → `CodigoItemDuplicadoError` «El código ya existe en el catálogo» (TR-CA-069). La violación de `ux_cat_item` en una carrera da el mismo error.
4. Eliminar sigue la misma regla de referencias que los globales.

**`AjustarItem`** (TR-RF-025): catálogo MIXTO e ítem global; si no, `AlcanceNoPermiteError` (TR-CA-067). Un ajuste neutro borra la fila. Sube la versión del tenant por trigger y publica `catalogo.actualizado`.

**`ConsultarItems`** (TR-RF-024):

1. `LecturaItems.versiones(codigo, tenant)`; 0 filas → `CatalogoNoExisteError` (TR-CA-065).
2. Si `If-None-Match` coincide con el ETag → 304 sin cuerpo y sin leer Redis (TR-CA-064).
3. Si no: caché; si falta o Redis falla, `cat.items` y guarda (el fallo de Redis solo deja aviso `cat.redis.error`).
4. Devuelve `visibles` con el ETag en la cabecera.

**`ValidarItem`** (TR-RF-027, implementa `CatalogoPort`): mismas versiones y caché que `ConsultarItems`. Código en `visibles` → `{ valido: true, motivo: null, atributos }` (TR-CA-070). En `noVisibles` → `{ valido: false, motivo, atributos }` (TR-CA-071 con `OCULTO`). En ninguno → `INEXISTENTE` y `atributos: null`. No evalúa permiso: el puerto es interno, como `ParametroPort`. Abre `uow.run` y reutiliza la transacción activa si la hay.

**`ListarCatalogos`**: definiciones (`codigo`, `nombre`, `alcance`, `fuente`, `editable_por_tenant`, `version`), sin ítems.

### Eventos (outbox, `schema_version = 1`, esquemas en `infrastructure/event-schemas.ts`)

| `event_type` | `aggregate_type` | Payload |
| --- | --- | --- |
| `catalogo.actualizado` | `catalogo` | `catalogo_id`, `codigo`, `version_global`, `version_tenant`, `tenant_id` (NULL en cambios globales), `cambio` (`CATALOGO`, `ITEM` o `AJUSTE`), `item_id` (NULL si `CATALOGO`), `por` |

Las versiones del payload son las que quedan tras el cambio. Sin nombres ni correos (TR-RNF-026). El evento de un cambio global se escribe en el outbox con el tenant del operador.

### Permisos (manifiesto PLAT `1.9.0` y `PERMISOS_CAT`)

| Código | `alcance_minimo` | `sensible` | Uso |
| --- | --- | --- | --- |
| `plat.catalogo.gestionar` | `TENANT` | sí | Crear y actualizar catálogos. Solo operador |
| `plat.catalogo.item_gestionar` | `TENANT` | sí | Ítems globales. Solo operador |
| `plat.catalogo.leer` | `TENANT` | no | Listar catálogos y leer ítems |
| `plat.catalogo.personalizar` | `TENANT` | no | Ajustes de ítems globales en MIXTO |
| `plat.catalogo.item_propio` | `TENANT` | no | Ítems propios en MIXTO y TENANT |

- `PLAT_PROPIETARIO`: los 5 (los dos sensibles solo sirven en el operador).
- `PLAT_ADMIN_CONFIGURACION`: `leer`, `personalizar` e `item_propio`.
- Los roles de cada producto suman `plat.catalogo.leer` en su propio manifiesto (spec 25 para SazónPOS).
- Sin opciones de menú: llegan con la UI del 19b.

### HTTP

Todas con `@ApiBearerAuth()`, `X-Sucursal-Id` (lo exige `PermisoGuard`), zod (400 `SOLICITUD_INVALIDA`) y errores `{ codigo, mensaje }`. Las sensibles responden 401 step-up con aal1. Cuerpos en `snake_case`.

| Método y ruta | Permiso | Entrada | Éxito |
| --- | --- | --- | --- |
| `GET /v1/catalogos` | `leer` | — | 200 lista de definiciones |
| `POST /v1/catalogos` | `gestionar` | `{ codigo, nombre, alcance, fuente?, editable_por_tenant }` | 201 la definición con `version: 1` |
| `PUT /v1/catalogos/{codigo}` | `gestionar` | `{ nombre, fuente?, editable_por_tenant, version }` | 200 `{ ..., version, cambiado }` |
| `GET /v1/catalogos/{codigo}/items` | `leer` | `If-None-Match?` | 200 `[{ item_id, codigo, codigo_externo, nombre, atributos, orden }]` con `ETag`, o 304 |
| `POST /v1/catalogos/{codigo}/items-globales` | `item_gestionar` | `{ codigo, codigo_externo?, nombre, abreviatura?, orden?, atributos?, vigente_desde, vigente_hasta?, activo? }` | 201 el ítem |
| `PUT /v1/catalogos/{codigo}/items-globales/{id}` | `item_gestionar` | lo anterior sin `codigo`, más `version` | 200 `{ ..., version, cambiado }` |
| `DELETE /v1/catalogos/{codigo}/items-globales/{id}` | `item_gestionar` | query `version` | 204, o 409 `ITEM_REFERENCIADO` |
| `POST /v1/catalogos/{codigo}/items` | `item_propio` | igual que el POST de globales | 201 el ítem |
| `PUT /v1/catalogos/{codigo}/items/{id}` | `item_propio` | igual que el PUT de globales | 200 `{ ..., version, cambiado }` |
| `DELETE /v1/catalogos/{codigo}/items/{id}` | `item_propio` | query `version` | 204, o 409 `ITEM_REFERENCIADO` |
| `PUT /v1/catalogos/{codigo}/items/{id}/ajuste` | `personalizar` | `{ visible, orden?, alias?, version? }` | 200 `{ item_id, visible, orden, alias, version, cambiado }` |

- Cerrar vigencia e inactivar se hacen con el `PUT` (`vigente_hasta`, `activo`).
- Id no UUID, de otro tenant o de otro catálogo: 404 `ITEM_NO_ENCONTRADO`.
- `GET .../items` usa `Cache-Control: private, no-cache`: el navegador revalida siempre con el ETag.
- El filtro de errores es propio de la lib, como en `series.http.ts`.

### Configuración

Sin variables nuevas. `CatalogosModule.register({ redisUrl, verificadorOperador, verificadoresReferencias? })`; `redisUrl` es el mismo de `ParametrosModule`. Entidades `ENTIDADES_CAT` en el `DataSource` de la app.

## Plan de implementación

1. **Migración, funciones y semilla.**
   - `db/01f_cat.sql`, su inverso y `db/tests/01f_cat.test.sql` con un rol sin `BYPASSRLS` (`cat_test_app`).
   - Casos: `ck_catalogo_editable` con GLOBAL editable (TR-CA-059); `ux_cat_item` con propio repetido en el mismo tenant y el mismo código en dos tenants permitido; triggers de coherencia (propio en GLOBAL falla; ajuste sobre ítem propio falla); versión global sube con un ítem global y la del tenant con un propio o un ajuste; `cat.items` da `VISIBLE`, `INACTIVO`, `FUERA_DE_VIGENCIA` (desde 2027-01-01 consultado el 2026-10-10, TR-CA-062) y `OCULTO`, con alias y orden del ajuste; `cat.items` con `p_tenant` distinto da 0 filas; RLS entre dos tenants (no lee propios ni ajustes de B; no inserta con `tenant_id` NULL); `cat.guardar_item_global` con versión obsoleta da NULL y con código propio de otro tenant da 23505; semilla en versión 1.
   - Verificar: `db:up` / `db:down` / `db:up` y la prueba SQL en PGlite en local (memoria del proyecto) y en CI con PostgreSQL 16.
2. **Lib `catalogos` vacía.**
   - `project.json`, `tsconfig*.json`, `jest.config.mjs` y `src/index.ts` copiados de `correlativos`; alias en `tsconfig.base.json`; etiqueta `comp:cat`.
   - Verificar: `pnpm nx run catalogos:lint catalogos:build` y `pnpm nx test boundaries-test` (cat no importa `org`, `cfg`, `seq` ni `aud`).
3. **Dominio.**
   - `tipos.ts`, `codigo-catalogo.ts`, `catalogo.ts`, `item-catalogo.ts`, `vigencia.ts`, `atributos-item.ts`, `ajuste-item.ts`, `eventos.ts`, `errores.ts`, `permisos-cat.ts`.
   - Pruebas: cada fila de la tabla de validaciones; MEDIO_PAGO MIXTO queda en versión 1 (TR-CA-058); mensaje exacto de TR-CA-059; DNI con longitud 8 y regex (TR-CA-060); `Vigencia.incluye` en los bordes; regex que no compila; ajuste neutro; actualizar sin cambios no emite evento.
   - Verificar: `pnpm nx test catalogos` y cobertura de `src/domain/**` ≥ 70 %.
4. **Globales.**
   - `CrearCatalogo`, `ActualizarCatalogo`, `GuardarItemGlobal`, `EliminarItemGlobal`, `RepositorioCatalogos` y la parte global de `RepositorioItems` (TypeORM con las funciones DEFINER), `mapeo.ts`, esquemas de eventos, puertos `VerificadorOperador` y `VerificadorReferencias`.
   - `OperadorRequeridoError` con mensaje por parámetro y `VerificadorOperadorOrg` en `apps/api`.
   - Pruebas: actor fuera del operador da 403 sin escribir; versión obsoleta da 409; «Yape» con un verificador doble que dice referenciado da 409 `ITEM_REFERENCIADO` y el ítem sigue (TR-CA-061); sin referencias se borra junto con sus ajustes; `catalogo.actualizado` en el outbox en la misma transacción.
   - Verificar: `pnpm nx test catalogos` (integración en CI).
5. **Propios y ajustes.**
   - `GuardarItemPropio`, `EliminarItemPropio`, `AjustarItem`, `RepositorioAjustes` y la parte propia de `RepositorioItems` con TypeORM.
   - Pruebas: especialidad propia de la clínica visible solo para ella (TR-CA-068); «MED_GEN» propio da 409 «El código ya existe en el catálogo» (TR-CA-069); ajuste en TIPO_COMPROBANTE da 409 `ALCANCE_NO_PERMITE` (TR-CA-067); ocultar «Plin» solo afecta al tenant (TR-CA-066); id de otro tenant da 404.
   - Verificar: `pnpm nx test catalogos`.
6. **Lectura, caché y `CatalogoPort`.**
   - `ConsultarItems`, `ValidarItem`, `LecturaItems` (TypeORM con `cat.versiones` y `cat.items`), `CacheItemsRedis` y `CacheItemsMemoria`. Export de `CATALOGO_PORT` en `index.ts`.
   - Pruebas: globales más «Tarjeta Diners» propio en MEDIO_PAGO (TR-CA-063); segunda lectura sale de la caché; un propio nuevo cambia el ETag solo de ese tenant; el ítem con vigencia desde 2027-01-01 no aparece el 2026-10-10 y sí el 2027-01-01 con `Clock` fijo (TR-CA-062); DNI válido con longitud 8 (TR-CA-070); «Plin» oculto da `OCULTO` (TR-CA-071); código ausente da `INEXISTENTE`; catálogo inexistente lanza `CatalogoNoExisteError`; Redis caído responde igual desde la base con aviso.
   - Verificar: `pnpm nx test catalogos` (Redis 7 en CI).
7. **Controlador, módulo y manifiesto.**
   - `catalogos.controller.ts`, `catalogos.http.ts`, `CatalogosModule`, registro en `AppModule`, manifiesto PLAT `1.9.0`.
   - Pruebas supertest: cada fila de la tabla HTTP; `If-None-Match` igual da 304 sin cuerpo (TR-CA-064); catálogo inexistente da 404 `CATALOGO_NO_EXISTE` (TR-CA-065); sin el permiso da 403 `SIN_PERMISO`; rutas sensibles con aal1 dan 401 step-up; aplicar el manifiesto dos veces da 0 cambios.
   - Verificar: `pnpm nx run-many -t lint test build` con código 0 y las rutas en `/v1/docs`.
8. **Nube, dev (manual).**
   - `pnpm db:up:remoto` y `pnpm manifiesto:aplicar:remoto` del PLAT `1.9.0`. Revisar con el MCP que `cat` no aparece en la Data API y `get_advisors` sin alertas nuevas de RLS.
   - Prueba de humo con la API local contra dev: leer MEDIO_PAGO (200 con ETag), repetir con `If-None-Match` (304), crear un ítem propio de prueba (cambia el ETag) y `validarItem` desde un script (válido, y `INEXISTENTE` para un código inventado). Borrar los datos de prueba con la conexión de migración.
   - Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Catálogos globales (TR-RF-022, TR-RN-012):**

- [ ] Crear MEDIO_PAGO con alcance MIXTO lo deja en versión 1 (TR-CA-058).
- [ ] Crear un GLOBAL con `editable_por_tenant = true` responde 400 «Un catálogo normativo global no puede ser editable por el tenant» (TR-CA-059).
- [ ] Un actor fuera del tenant operador recibe 403 `OPERADOR_REQUERIDO` en las rutas de catálogos e ítems globales, aunque tenga el permiso.
- [ ] Un cambio global sube `cat.catalogo.version` y cambia el ETag de todos los tenants.

**Ítems con vigencia (TR-RF-023, TR-RN-013):**

- [ ] El ítem DNI guarda `{"longitud": 8, "regex": "^[0-9]{8}$"}` en `atributos` (TR-CA-060).
- [ ] Eliminar «Yape» con un verificador que lo da por referenciado responde 409 `ITEM_REFERENCIADO` y el ítem sigue (TR-CA-061).
- [ ] Un ítem con vigencia desde 2027-01-01 no aparece en la lectura del 2026-10-10 (TR-CA-062).
- [ ] Un `PUT` con `version` obsoleta responde 409 `VERSION_OBSOLETA`; uno sin cambios responde `cambiado: false` sin evento.

**Lectura con caché (TR-RF-024, TR-RNF-102):**

- [ ] MEDIO_PAGO para el tenant con «Tarjeta Diners» propio devuelve los globales vigentes más «Tarjeta Diners» (TR-CA-063).
- [ ] Repetir la lectura con `If-None-Match` igual al ETag responde 304 sin cuerpo (TR-CA-064).
- [ ] Un código de catálogo inexistente responde 404 `CATALOGO_NO_EXISTE` (TR-CA-065).
- [ ] Con Redis detenido, la lectura responde lo mismo desde la base y deja el aviso `cat.redis.error`.
- [ ] Con caché caliente, el p95 de 200 lecturas en la prueba de integración es < 50 ms (medición registrada en el cierre).

**Personalización e ítems propios (TR-RF-025, 026):**

- [ ] Ocultar «Plin» en MEDIO_PAGO lo saca de la lista del tenant y no de la de otro (TR-CA-066).
- [ ] Un ajuste sobre un ítem de TIPO_COMPROBANTE responde 409 `ALCANCE_NO_PERMITE` (TR-CA-067).
- [ ] Una especialidad propia de la clínica aparece solo para la clínica (TR-CA-068).
- [ ] Un ítem propio «MED_GEN» en ESPECIALIDAD responde 409 «El código ya existe en el catálogo» (TR-CA-069).

**Validación (TR-RF-027):**

- [ ] `validarItem('TIPO_DOC_IDENTIDAD', 'DNI')` devuelve `valido: true` con `longitud: 8` (TR-CA-070).
- [ ] `validarItem('MEDIO_PAGO', 'PLIN')` con «Plin» oculto devuelve `valido: false` y `motivo: 'OCULTO'` (TR-CA-071).
- [ ] Un código inactivo, fuera de vigencia o ausente devuelve `INACTIVO`, `FUERA_DE_VIGENCIA` o `INEXISTENTE`.

**Aislamiento, seguridad, migraciones y calidad:**

- [ ] Desde el tenant A, con `cat_test_app`, no se lee ni escribe ningún ítem propio ni ajuste de B, y no se inserta ni modifica un ítem con `tenant_id` NULL.
- [ ] Sin el permiso de la ruta responde 403; las rutas de `gestionar` e `item_gestionar` con aal1 responden 401 step-up.
- [ ] Cada escritura deja `catalogo.actualizado` en el outbox en la misma transacción, sin nombres ni correos.
- [ ] `db:up && db:down && db:up` termina con 0 en CI y `db:down` deja la base como la dejó el spec 18b.
- [ ] `src/domain` no importa `@nestjs/*` ni `typeorm`. `catalogos` no importa `org`, `cfg`, `seq` ni `aud` (Nx en CI).
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] Las 11 rutas figuran en `/v1/docs` con sus códigos de error.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, `01f_cat.sql` está aplicada y el manifiesto PLAT `1.9.0` figura en `seg.manifiesto_aplicado`.
- [ ] En dev, el esquema `cat` no está expuesto en la Data API y `get_advisors` no trae alertas nuevas de RLS.
- [ ] En dev, la prueba de humo da 200 con ETag, 304, ETag nuevo tras el ítem propio y `validarItem` correcto, y los datos de prueba se borran.
- [ ] Las horas reales de D-03 quedan registradas en el plan.

## Decisiones

- **Sí:** partición 19a (D-03, back) y 19b (D-04, D-06 y UI de 025/026). Decisión del usuario en el paquete de contexto. 19a no espera a 09 ni a 15.
- **Sí:** dependencia del 06 en lugar del 07, que no existe. Del 12 y 17a por la regla de operador; del 18b por la versión del manifiesto.
- **Sí:** solo el tenant operador escribe globales, con funciones `SECURITY DEFINER` de dueño `cat_editor`. Decisión del usuario. Mismo patrón que `org_lector`; la RLS de la app solo deja leer `tenant_id IS NULL`.
- **No:** política RLS con el UUID del operador. Pondría un dato de ambiente dentro del esquema.
- **No:** globales solo por migración. RF-022 y 023 piden administración desde la consola.
- **Sí:** puerto `VerificadorOperador` implementado en `apps/api` con `ExigirOperador`. Decisión del usuario. `catalogos` no depende de `org` (TR-RNF-119).
- **Sí:** puerto `VerificadoresReferencias`, lista vacía por defecto; borrado físico solo sin referencias, si no 409 con la alternativa de cerrar vigencia. Decisión del usuario. Los productos registran su verificador cuando referencien ítems (spec 25, R2).
- **No:** prohibir el borrado o contar usos en una columna. Lo primero deja basura de ítems creados por error; lo segundo acopla la venta a CAT.
- **Sí:** clave `cat:{codigo}:{tenant}:{vg}.{vt}:{fecha}` y ETag con las mismas partes. Decisión del usuario. La clave del SRS no cambia con propios, ajustes ni con la entrada en vigencia de un ítem futuro.
- **No:** una sola versión por catálogo. Un tenant que agrega un ítem invalidaría la caché de todos.
- **No:** TTL corto como invalidación. Ventana con datos viejos.
- **Sí:** `cat.catalogo.version` es a la vez la versión de contenido global y el bloqueo optimista. RF-022 la pide autoincremental; un cambio de ítem global durante una edición de la definición da 409 y se recarga.
- **Sí:** fecha de vigencia en `America/Lima`, fija. Los catálogos no son de sucursal; un mismo día para todos los tenants.
- **Sí:** vigencia inclusiva en ambos extremos. Cerrar la vigencia hoy deja el ítem visible hasta el fin del día.
- **Sí:** `editable_por_tenant` derivado del alcance y validado (GLOBAL falso; MIXTO y TENANT verdadero). Es la coherencia que pide RF-022; un MIXTO no editable sería un GLOBAL.
- **Sí:** el alcance no cambia después de crear. Pasar de MIXTO a GLOBAL dejaría propios y ajustes huérfanos.
- **Sí:** el código de un ítem no cambia. Los productos guardan el código; cambiarlo rompería referencias.
- **Sí:** un global nuevo no puede repetir un código propio de ningún tenant. Sin esto, un propio quedaría oculto o duplicado en la lista. El error no dice qué tenant lo usa.
- **Sí:** triggers de coherencia ítem-catálogo y ajuste-catálogo en la base. Defensa para el importador del 19b.
- **Sí:** semilla de 4 catálogos con ítems base. Decisión del usuario. Los datos propios de los GWT quedan en las pruebas; la carga completa SUNAT es del 19b.
- **Sí:** dos grupos de rutas, `items-globales` y `items`. Decisión del usuario. `PermisoGuard` evalúa un permiso fijo por ruta y el step-up sale de ese permiso.
- **Sí:** `gestionar` e `item_gestionar` sensibles; `leer`, `personalizar` e `item_propio` no. Decisión del usuario. Un cambio global afecta a todos los tenants (TR-RN-009).
- **Sí:** `alcance_minimo` `TENANT` en los 5 permisos. Los catálogos no son de empresa ni de sucursal.
- **Sí:** `plat.catalogo.leer` solo en `PLAT_PROPIETARIO` y `PLAT_ADMIN_CONFIGURACION`; cada producto lo suma a sus roles. El manifiesto PLAT no conoce los roles de los productos.
- **Sí:** sin opciones de menú. No hay pantalla en este spec.
- **Sí:** la sección «Diseño UI» de `CLAUDE.md` no aplica al 19a porque no tiene pantallas. El 19b la cumple, partiendo de las pantallas tipo propuestas en «Out of scope».
- **Sí:** `CatalogoPort` toma el tenant del `TenantContext` y no evalúa permiso. Decisión del usuario. Igual que `ParametroPort`.
- **Sí:** el puerto no valida el valor contra `regex` o `longitud`. El SRS define `validarItem(catalogo, codigo)`; los atributos vuelven para que el producto valide.
- **Sí:** Redis caído resuelve desde la base. Decisión del usuario. Igual que `parametros`; la venta no se cae por la caché.
- **Sí:** 304 sin tocar Redis: el ETag sale de `cat.versiones`. Una consulta liviana por petición.
- **Sí:** un solo evento `catalogo.actualizado` con `cambio`, versiones y tenant. Decisión del usuario. Le da al spec 20 qué auditar.
- **Sí:** la confirmación con motivo de TR-RNF-021 es de la UI (19b). El back no pide motivo en el `DELETE`.
- **Sí:** migración `01f_cat.sql`, separada de `01d_seq.sql`. El plan juntaba CAT y SEQ; el 10 ya los separó.
- **Sí:** PGlite en local y PostgreSQL 16 y Redis 7 en CI. Sin Docker de Postgres en la máquina (memoria del proyecto).
- **Sí:** prueba de humo en dev con migración y manifiesto. Decisión del usuario. Estimado 8-9 h.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una función `SECURITY DEFINER` escribe globales sin comprobar el operador | `EXECUTE` revocado a `PUBLIC`, `anon` y `authenticated`; la comprobación está en el caso de uso antes de llamarla; prueba del paso 4 con un actor de cliente. Mismo nivel de barrera que el spec 17a. |
| Carrera entre un global nuevo y un propio con el mismo código | Ventana mínima (escrituras raras de operador). Se documenta; el importador del 19b revisa colisiones antes de aplicar. |
| La consulta de versiones en cada petición no cumple p95 < 50 ms | Índices por PK; la prueba del paso 6 mide y se registra. Si falla, se cachean las versiones en Redis con TTL corto en un spec aparte. |
| Claves viejas acumuladas en Redis por cada versión y día | TTL de 24 h; el volumen es catálogos × tenants activos. |
| `regex` de un atributo con retroceso catastrófico en el producto | El dominio limita a 200 caracteres y exige que compile; el SRS deja la validación del valor al consumidor. Se anota en el JSDoc del puerto. |
| 18b no está integrado al implementar | El paso 7 parte del manifiesto `1.8.0`; si `main` sigue en `1.7.0`, se para y se integra 18b primero. |

## Lo que **no** está en este spec

- UI de consola y de admin cliente, y la lista de administración de ítems (spec 19b).
- Importador de tablas oficiales y carga completa SUNAT, UBIGEO y CIE-10 (spec 19b).
- Feriados y `CalendarioPort` (spec 19b).
- `<ui-catalogo-select>` (spec 15 o 25).
- Verificadores de referencias reales (spec 25, R2).
- Opciones de menú (spec 19b).
- Auditoría TR-AUD (spec 20).
- Validar el valor contra los atributos del ítem.
- Prod (plan de migración a producción).

Cada uno entra en su propio spec cuando su sprint lo pida.
