# SPEC 09 — Parámetros jerárquicos: definiciones, valores por alcance y resolución efectiva

> **Status:** Aprobado
> **Depends on:** SPEC 02, SPEC 03, SPEC 04, SPEC 06
> **Date:** 2026-10-24
> **Objective:** Crear `libs/plataforma/parametros` (TR-CFG) con el esquema `cfg`, el registro de definiciones desde el manifiesto, los valores por tenant, empresa y sucursal con restablecer, y `ParametroPort` que resuelve el valor efectivo con su origen y caché Redis versionada, expuesto en `/v1/cfg` con `@Permiso` y OpenAPI.

## Por qué existe este spec

Fila 09 de `docs/roadmap-specs.md` (D-01 y la parte de parámetros de D-05). Contexto de apoyo: `docs/spec-context/09-cfg-parametros.md`. Su sección 9 (ambigüedades y preguntas) queda resuelta por las Decisiones de este spec.

El roadmap pone como dependencia el spec 07. El 07 no existe: el spec 06 absorbió las filas 06 y 07 (`@Permiso`, `X-Sucursal-Id`, caché de permisos). Por eso este spec depende del 06.

El spec 06 dejó `AplicarManifiesto` validando el bloque `parametros` sin aplicarlo. No existe ningún DDL ni código de CFG en `codigo/`: todo se escribe desde cero.

RF cubiertos:

- **TR-RF-030** registrar definiciones de parámetros (desde el manifiesto).
- **TR-RF-031** configurar valor por alcance (parte back; la pantalla va en otro spec).
- **TR-RF-032** resolver valor efectivo (`ParametroPort`).
- **TR-RF-033** ver herencia y restablecer (parte back).

Criterios del SRS: TR-CA-078 a 087. Los criterios de caché, evento y aislamiento son propios de este spec.

Reglas: **TR-RN-014** (de lo más específico a lo más general; alcance máximo), **TR-RN-015** (tipo y esquema), **TR-RN-001** (tenant en toda fila de valores).

RNF propios:

- **TR-RNF-027**: un cliente se configura sin despliegue.
- **TR-RNF-101**: caché Redis, p95 < 20 ms con acierto, invalidación ≤ 5 s.
- **TR-RNF-120**: registrar las mismas definiciones dos veces da 0 cambios.
- **TR-RNF-119**: los productos leen parámetros solo por `ParametroPort`.

RNF heredados: 001, 008, 010, 012, 013 (fila con actor y fecha más evento; la persistencia de auditoría es del spec 20), 024, 025, 026, 106.

Historias del backlog: **D-01** completa y la parte de parámetros de **D-05** sin la pantalla. Estimado: 9 h.

## Alcance

**In:**

- **Migración** `db/01c_cfg.sql`, su inverso `db/rollback/01c_cfg.sql` y prueba `db/tests/01c_cfg.test.sql`. Corre después de `01b_seg_membresias.sql` por orden de nombre.
- **Lib nueva** `libs/plataforma/parametros` (proyecto `parametros`, etiquetas `scope:plataforma`, `type:backend`, `comp:cfg`, alias `@vitrina/plataforma/parametros`). Estructura `domain · application · infrastructure · interface · test`, con la configuración de build, Jest y tsconfig copiada de `seguridad`. No hay generador `modulo-hexagonal` (spec 01).
- **Dominio** en `domain/`: código, tipo y alcance del parámetro, `DefinicionParametro`, agregado `ValorParametro`, eventos y errores.
- **Casos de uso** en `application/`: `RegistrarDefiniciones`, `FijarValor`, `RestablecerValor`, `ListarParametros`, `ConsultarNiveles` y `ResolverParametro` (detrás de `ParametroPort`). Los de escritura con `UnitOfWork`, `TenantContext` y outbox.
- **Puertos** en `application/ports/` y adaptadores en `infrastructure/typeorm/`, `infrastructure/redis/` y `infrastructure/ajv/`.
- **Interfaz**: `interface/parametros.controller.ts` con 4 rutas bajo `/v1/cfg`, DTO, zod y OpenAPI.
- **Cambios mínimos en `seguridad`**: exportar el puerto `AlcanceActor` (envuelve `actorCubre`) y `ConfirmacionRequeridaError`.
- **CLI del manifiesto**: `apps/api/src/cli/manifiesto.cli.ts` valida y registra el bloque `parametros` con `RegistrarDefiniciones`.
- **Manifiesto PLAT** `1.2.0`: permisos `plat.parametro.*`, módulo y opción «Parámetros», rol `PLAT_ADMIN_CONFIGURACION` y el parámetro `plat.sesion.minutos_inactividad`.
- **`apps/api`**: `ParametrosModule.register` en `AppModule`.
- **Pruebas**: dominio (Jest), SQL contra PostgreSQL 16, integración con PostgreSQL 16 y Redis 7 (solo en CI), HTTP con supertest.
- **Nube, dev (manual)**: migración, manifiesto PLAT `1.2.0` y prueba de humo.

**Out of scope (para otros specs):**

- Pantalla de parámetros en `admin-cliente`: árbol de herencia, búsqueda y restablecer (spec posterior al 15; se propone sumarla al 19b).
- Historial de cambios TR-RF-034, `plat.parametro.historial`, TR-CA-088 y 089 (R2).
- Auditoría persistente TR-AUD (spec 20). Consume `parametro.cambiado`.
- Relay del outbox y handlers (spec 11).
- Caché local del agente edge TR-RF-137 (R2+).
- Ruta HTTP para que un consumidor externo resuelva un parámetro (spec 22 si SazónPOS la necesita).
- Migrar los parámetros hardcodeados de SazónPOS (spec 22, CC-05).
- Series (spec 10) y catálogos (spec 19a/19b).
- Siembra de valores al dar de alta un tenant (spec 12).
- Parámetros por unidad operativa: `alcance_maximo` solo admite TENANT, EMPRESA y SUCURSAL.
- Proyecto prod (plan de migración a producción).

## Base de código reutilizada

**Se conserva (como patrón):**

- `db/01a_org.sql`: FK compuestas `(tenant_id, id)` a `org.empresa` y `org.sucursal`, RLS `ENABLE + FORCE` con `app.tenant_id`, `REVOKE` a `anon` y `authenticated` si existen.
- Spec 06: clave de caché versionada (`ResolverPermisos`, `seg.version_seguridad` con triggers), funciones `SECURITY INVOKER` con `search_path = ''` que devuelven 0 filas si `p_tenant` no es `app.tenant_id`, `PermisoGuard`, `ContextoTenantInterceptor`, `CodigoPermiso` (misma regla de formato) y el CLI del manifiesto.
- Spec 08: filtro de errores propio con `{ codigo, mensaje }`, validación con zod, `confirmar: true` en acciones destructivas, `actorCubre`.
- `kernel-infra`: `TypeOrmUnitOfWork`, `AlsTenantContext`, `OutboxPublisher`, `InMemoryEventSchemaValidator` (ya usa Ajv).
- `seguridad/src/infrastructure/redis/`: creación del cliente Redis y fallo a base de datos con log `warn`.

**Cambia:**

- `seguridad/src/index.ts` exporta `ALCANCE_ACTOR`, `AlcanceActor` y `ConfirmacionRequeridaError`. `SeguridadModule` provee `AlcanceActor`.
- `manifiesto.cli.ts`: además de `AplicarManifiesto`, valida y registra `parametros`.

**No existe** y se escribe desde cero: esquema `cfg`, `cfg.valor`, toda la lib `parametros`, sus pruebas.

## Modelo de datos

### Migración `db/01c_cfg.sql`

```sql
CREATE SCHEMA cfg;

-- Definiciones globales por producto (sin tenant). Las escribe el CLI con la conexión de migración.
CREATE TABLE cfg.parametro_def (
  codigo          varchar(80)  PRIMARY KEY CHECK (char_length(codigo) >= 3),
  producto_codigo varchar(5)   NOT NULL REFERENCES seg.producto (codigo),
  descripcion     varchar(250) NOT NULL CHECK (char_length(descripcion) >= 3),
  tipo            varchar(8)   NOT NULL CHECK (tipo IN ('TEXTO', 'NUMERO', 'BOOLEANO', 'JSON')),
  valor_defecto   jsonb        NOT NULL,
  alcance_maximo  varchar(8)   NOT NULL CHECK (alcance_maximo IN ('TENANT', 'EMPRESA', 'SUCURSAL')),
  esquema         jsonb        NULL,
  obsoleto        boolean      NOT NULL DEFAULT false,
  actualizado_en  timestamptz  NOT NULL DEFAULT now()
);
-- Sin RLS, igual que el catálogo de seg (seg.producto, seg.permiso, seg.manifiesto_aplicado).

-- Una fila por registro con cambios. vd = max(id), o 0 si no hay filas.
CREATE TABLE cfg.definiciones_aplicadas (
  id              bigserial   PRIMARY KEY,
  producto_codigo varchar(5)  NOT NULL REFERENCES seg.producto (codigo),
  cambios         jsonb       NOT NULL,   -- { insertadas, actualizadas, obsoletas, reactivadas }
  aplicado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cfg.parametro_valor (
  id            uuid         PRIMARY KEY,
  tenant_id     uuid         NOT NULL REFERENCES org.tenant (id),
  codigo        varchar(80)  NOT NULL REFERENCES cfg.parametro_def (codigo),
  alcance       varchar(8)   NOT NULL CHECK (alcance IN ('TENANT', 'EMPRESA', 'SUCURSAL')),
  empresa_id    uuid         NULL,
  sucursal_id   uuid         NULL,
  valor         jsonb        NOT NULL,
  version       bigint       NOT NULL DEFAULT 0,
  modificado_por uuid        NOT NULL REFERENCES seg.usuario (id),
  modificado_en timestamptz  NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, empresa_id)  REFERENCES org.empresa (tenant_id, id),
  FOREIGN KEY (tenant_id, sucursal_id) REFERENCES org.sucursal (tenant_id, id),
  CONSTRAINT ck_valor_ambito CHECK (
       (alcance = 'TENANT'   AND empresa_id IS NULL     AND sucursal_id IS NULL)
    OR (alcance = 'EMPRESA'  AND empresa_id IS NOT NULL AND sucursal_id IS NULL)
    OR (alcance = 'SUCURSAL' AND empresa_id IS NULL     AND sucursal_id IS NOT NULL)),
  CONSTRAINT ux_valor_nivel UNIQUE NULLS NOT DISTINCT (tenant_id, codigo, alcance, empresa_id, sucursal_id)
);
-- RLS ENABLE + FORCE con tenant_id = app.tenant_id para SELECT, INSERT, UPDATE y DELETE.

-- Versión de valores del tenant (TR-RNF-101). La sube un trigger; nadie la escribe a mano.
CREATE TABLE cfg.version_tenant (
  tenant_id   uuid        PRIMARY KEY REFERENCES org.tenant (id),
  version     bigint      NOT NULL DEFAULT 1,
  cambiado_en timestamptz NOT NULL DEFAULT now()
);
-- RLS ENABLE + FORCE; SELECT con tenant_id = app.tenant_id; sin políticas de escritura.
-- Trigger AFTER INSERT OR UPDATE OR DELETE ON cfg.parametro_valor FOR EACH ROW:
-- cfg.subir_version() SECURITY DEFINER, search_path = '', INSERT ... ON CONFLICT DO UPDATE version + 1.

-- REVOKE ALL del esquema cfg a anon y authenticated si existen (regla 8).
```

- La sucursal no guarda `empresa_id`: la empresa se deriva de `org.sucursal` en `cfg.valor`. Evita una fila con empresa y sucursal incoherentes.
- `UNIQUE NULLS NOT DISTINCT` requiere PostgreSQL 15 o superior; CI y Supabase usan 16.
- El inverso borra el esquema `cfg` completo (`DROP SCHEMA cfg CASCADE`).

### Funciones SQL (`SECURITY INVOKER`, `SET search_path = ''`, `STABLE`)

```sql
cfg.valor(p_codigo varchar, p_tenant uuid, p_empresa uuid DEFAULT NULL, p_sucursal uuid DEFAULT NULL)
  RETURNS TABLE (valor jsonb, origen varchar)   -- origen: SUCURSAL | EMPRESA | TENANT | DEFECTO
cfg.versiones(p_tenant uuid)
  RETURNS TABLE (vt bigint, vd bigint)
```

`cfg.valor` (TR-RN-014):

- `p_tenant` distinto de `app.tenant_id`: 0 filas.
- Código inexistente: 0 filas. Código obsoleto: resuelve igual.
- Con `p_sucursal` y sin `p_empresa`, toma la empresa de `org.sucursal`. Una sucursal de otro tenant no aparece por la RLS y se resuelve como si no se hubiera pasado.
- Orden: valor `SUCURSAL` de `p_sucursal`, valor `EMPRESA` de la empresa, valor `TENANT`, `valor_defecto`. Ignora niveles más específicos que `alcance_maximo` (defensa; el caso de uso ya los rechaza).
- `vt` es `cfg.version_tenant.version` o 0. `vd` es `max(cfg.definiciones_aplicadas.id)` o 0.

### Dominio

```ts
// domain/tipos.ts
export type TipoParametro = 'TEXTO' | 'NUMERO' | 'BOOLEANO' | 'JSON';
export type AlcanceParametro = 'TENANT' | 'EMPRESA' | 'SUCURSAL';
export type OrigenValor = AlcanceParametro | 'DEFECTO';

// domain/codigo-parametro.ts
// ^[a-z]{2,5}\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$, de 3 a 80, y el prefijo = lower(producto_codigo).
export class CodigoParametro { static de(valor: string, productoCodigo: string): CodigoParametro }

// domain/definicion-parametro.ts
export class DefinicionParametro {
  static crear(d: { codigo; productoCodigo; descripcion; tipo; valorDefecto; alcanceMaximo; esquema? },
               esquemas: ValidadorEsquema): DefinicionParametro;  // valida defecto contra tipo y esquema
  validarValor(valor: unknown, esquemas: ValidadorEsquema): void;  // TR-RN-015, lanza ValorInvalidoError
  admite(alcance: AlcanceParametro): void;                         // TR-RN-014, lanza AlcanceNoPermitidoError
  difiereDe(otra: DefinicionParametro): boolean;
}

// domain/valor-parametro.ts (AggregateRoot con version)
export class ValorParametro extends AggregateRoot {
  static fijar(d: { id; tenantId; codigo; ambito: AmbitoValor; valor; por; ahora }): ValorParametro;
  cambiar(valor: unknown, por: string, ahora: Date): boolean;  // false si el valor es igual: sin evento
  restablecer(por: string, ahora: Date): void;                 // evento con restablecido: true
}

export interface AmbitoValor { alcance: AlcanceParametro; empresaId: string | null; sucursalId: string | null }
```

Tipos (TR-RN-015): `TEXTO` es string, `NUMERO` es number finito, `BOOLEANO` es boolean, `JSON` es objeto o arreglo. Luego, si hay esquema, se valida contra él.

`ValidadorEsquema` es un puerto de dominio. Su adaptador Ajv acepta solo `minimum`, `maximum`, `enum`, `pattern`, `minLength`, `maxLength` y, para `JSON`, `type`, `properties`, `required`, `items`. Otra palabra clave rechaza la definición. Los mensajes en español los arma el adaptador:

| Palabra clave | Mensaje |
| --- | --- |
| `minimum` y `maximum` | «El valor debe estar entre 0 y 20» (TR-CA-082) |
| solo `minimum` / solo `maximum` | «El valor debe ser mayor o igual a N» / «menor o igual a N» |
| `enum` | «El valor debe ser uno de: a, b, c» |
| `pattern` | «El valor no tiene el formato esperado» |
| `minLength` / `maxLength` | «El texto debe tener entre N y M caracteres» |
| tipo | «Se esperaba un valor NUMERO» (TR-CA-079) |

Errores de dominio nuevos (heredan de `DomainError`):

| Clase | `code` | HTTP | Mensaje |
| --- | --- | --- | --- |
| `ParametroNoDefinidoError(codigo)` | `PARAMETRO_NO_DEFINIDO` | 404 | El parámetro `<codigo>` no está definido (TR-CA-085) |
| `ParametroObsoletoError(codigo)` | `PARAMETRO_OBSOLETO` | 409 | El parámetro fue retirado y no admite valores nuevos |
| `AlcanceNoPermitidoError(maximo)` | `ALCANCE_NO_PERMITIDO` | 400 | «Este parámetro se configura como máximo a nivel de empresa» (TR-CA-081; `tenant` o `empresa` según el máximo) |
| `ValorInvalidoError(mensaje)` | `VALOR_INVALIDO` | 400 | Mensajes de la tabla anterior |
| `AmbitoValorInvalidoError` | `AMBITO_INVALIDO` | 400 | El alcance no corresponde a la empresa o sucursal indicadas |
| `DefinicionInvalidaError(detalles)` | `DEFINICION_INVALIDA` | — | Lista cada error con su ruta (p. ej. `parametros[0].valor_defecto: Se esperaba un valor NUMERO`) |
| `ValorNoConfiguradoError` | `VALOR_NO_CONFIGURADO` | 404 | No hay valor en ese nivel |

Se reutilizan de `seguridad`: `ActorSinAlcanceError` (403) y `ConfirmacionRequeridaError` (400).

### Puertos (`application/ports/`)

```ts
// Exportado en index.ts: lo usan los productos (TR-RNF-119).
export const PARAMETRO_PORT = Symbol('ParametroPort');
export interface ParametroPort {
  /** Tenant desde TenantContext. Sin empresa ni sucursal, usa la sucursal del contexto si existe. */
  valor<T = unknown>(codigo: string, contexto?: { empresaId?: string; sucursalId?: string }):
    Promise<{ valor: T; origen: OrigenValor }>;   // ParametroNoDefinidoError si no existe
}

RepositorioDefiniciones { todasDe(producto): DefinicionParametro[]; buscar(codigo): DefinicionParametro | null;
                          aplicar(producto, cambios): Promise<void> }   // inserta fila en definiciones_aplicadas
RepositorioValores      { buscar(codigo, ambito): ValorParametro | null; guardar(v); eliminar(v);
                          niveles(codigo): NivelValor[] }
ResolucionSql           { versiones(tenant): { vt; vd }; valor(codigo, tenant, empresa?, sucursal?): Efectivo | null;
                          listar(filtro, sucursal): ParametroListado[] }
CacheParametros         { leer(clave); guardar(clave, valor, ttlSeg) }
ValidadorEsquema        { soporta(esquema): string[]; validar(esquema, valor): string | null }
```

- `AlcanceActor` (de `seguridad`): `cubre(usuarioId, destino: AmbitoValor, hoy): Promise<boolean>`. Propietario pasa; alcance `TENANT` cubre todo; `EMPRESA` cubre esa empresa y sus sucursales; `SUCURSAL` solo esa sucursal.
- `CacheParametros` en `infrastructure/redis/cache-parametros.redis.ts` y una versión en memoria para pruebas.

### Casos de uso: puntos no obvios

**`RegistrarDefiniciones({ productoCodigo, parametros })`** (TR-RF-030):

1. `validar` puro, sin base: código con `CodigoParametro`, descripción 3-250, tipo y alcance válidos, esquema soportado, defecto del tipo y del esquema, códigos únicos. Un solo error lanza `DefinicionInvalidaError` con todos los detalles.
2. Diff contra `todasDe(producto)`: inserta las nuevas; actualiza `descripcion`, `valor_defecto`, `alcance_maximo` o `esquema` si cambiaron; marca `obsoleto` las que ya no vienen; reactiva las que vuelven.
3. Sin cambios: no escribe nada y devuelve 0 (TR-RNF-120). Con cambios: una transacción y una fila en `cfg.definiciones_aplicadas`, que sube `vd`.
4. Bajar `alcance_maximo` no borra valores más específicos existentes: `cfg.valor` los ignora y la API los muestra como `fuera_de_alcance: true` para que se restablezcan.
5. No publica evento: la definición es global y `sync.outbox.tenant_id` es `NOT NULL` (mismo criterio del spec 06).

**`FijarValor({ codigo, ambito, valor, actor })`** (TR-RF-031):

1. `buscar(codigo)`: no existe → `ParametroNoDefinidoError`; obsoleto → `ParametroObsoletoError`.
2. `admite(alcance)` (TR-CA-081), coherencia del ámbito y `validarValor` (TR-CA-079, 082).
3. `AlcanceActor.cubre(actor, ambito)` o `ActorSinAlcanceError`.
4. Transacción: crea o cambia la fila. Valor igual al guardado: 200 sin escribir ni publicar (TR-RNF-008). Si escribe, el trigger sube `vt` y se publica `parametro.cambiado`.
5. Una empresa o sucursal de otro tenant falla la FK o no se ve por RLS: 404 `NO_ENCONTRADO`.

**`RestablecerValor({ codigo, ambito, confirmar, actor })`** (TR-RF-033):

1. `confirmar !== true` → `ConfirmacionRequeridaError`.
2. Mismo chequeo de alcance del actor. No exige definición vigente: un obsoleto se puede restablecer.
3. Sin fila en ese nivel → `ValorNoConfiguradoError`.
4. Transacción: `DELETE` físico, sube `vt`, publica `parametro.cambiado` con `restablecido: true`. Después resuelve `cfg.valor` para la entidad del nivel y lo devuelve (TR-CA-086, 087).

**`ResolverParametro`** (TR-RF-032, implementa `ParametroPort`):

1. Lee `vt` y `vd` (una consulta por PK).
2. Clave `cfg:{tenant}:{vt}.{vd}:{codigo}:{empresa|-}:{sucursal|-}`; acierto devuelve.
3. Fallo: `cfg.valor`; 0 filas → `ParametroNoDefinidoError` (no se cachea). Guarda con TTL 60 s.
4. Redis caído: resuelve en la base y log `warn` `cfg.redis.error`. No falla.
5. Código obsoleto: devuelve el valor y escribe log `warn` `cfg.parametro.obsoleto`.

**`ListarParametros({ producto?, q?, obsoletos? })`**: definiciones de `PLAT` y de productos con suscripción `PRUEBA` o `ACTIVA` vigente del tenant, filtradas por producto y por texto en código o descripción. Cada una trae el efectivo para la sucursal de `X-Sucursal-Id`.

**`ConsultarNiveles(codigo)`**: definición, defecto y todas las filas del tenant con `alcance`, `empresa_id`, `sucursal_id`, nombre de la entidad, `valor`, `modificado_por` (uuid), `modificado_en` y `fuera_de_alcance`.

### Eventos (outbox, `schema_version = 1`, esquemas en `infrastructure/event-schemas.ts`)

| `event_type` | `aggregate_type` | Payload |
| --- | --- | --- |
| `parametro.cambiado` | `parametro_valor` | `codigo`, `alcance`, `empresa_id`, `sucursal_id`, `valor_anterior` (o null), `valor` (null si restablecido), `restablecido` (bool), `por` |

El evento es el rastro de auditoría hasta el spec 20. No lleva nombres ni correos (TR-RNF-026).

### Permisos (manifiesto PLAT `1.2.0` y `PERMISOS_CFG`)

| Código | `alcance_minimo` | `sensible` | Uso |
| --- | --- | --- | --- |
| `plat.parametro.definir` | `TENANT` | no | Declarado. El CLI usa la conexión de migración. |
| `plat.parametro.leer` | `SUCURSAL` | no | `GET` de `/v1/cfg/parametros`. `ParametroPort` no lo exige. |
| `plat.parametro.editar` | `SUCURSAL` | no | Fijar y restablecer, con chequeo de alcance del actor |

- Módulo `configuracion` («Configuración», orden 2). Opción `plat.configuracion` (padre, icono `settings`) y `plat.configuracion.parametros` («Parámetros», `/admin/parametros`, icono `tune`, permisos `plat.parametro.leer`).
- Rol predefinido `PLAT_ADMIN_CONFIGURACION` («Administrador de configuración») con `plat.parametro.leer`, `plat.parametro.editar` y `plat.sesion.contexto`.
- Parámetro `plat.sesion.minutos_inactividad`: `NUMERO`, defecto `30`, `alcance_maximo` `TENANT`, sin esquema, descripción «Minutos de inactividad antes de cerrar la sesión».

Formato de cada elemento de `parametros` en el manifiesto:

```json
{ "codigo": "rest.propina.porcentaje", "descripcion": "Porcentaje de propina sugerida",
  "tipo": "NUMERO", "valor_defecto": 10, "alcance_maximo": "SUCURSAL",
  "esquema": { "minimum": 0, "maximum": 20 } }
```

`producto_codigo` sale de la raíz del manifiesto.

### CLI del manifiesto

`pnpm manifiesto:aplicar <archivo>` (y `:remoto`), en este orden:

1. `RegistrarDefiniciones.validar` del bloque `parametros`. Si falla, sale con 1 y no escribe nada en `seg` ni en `cfg` (TR-CA-079).
2. `AplicarManifiesto` del spec 06.
3. `RegistrarDefiniciones` en su propia transacción.
4. Imprime `{ producto, version, cambios, parametros: { insertadas, actualizadas, obsoletas, reactivadas } }`.

Repetir el mismo archivo da 0 cambios en ambos.

### HTTP

Todas con `@ApiBearerAuth()`, `X-Sucursal-Id` (lo exige `PermisoGuard`), zod (400 `SOLICITUD_INVALIDA`) y errores `{ codigo, mensaje }`.

| Método y ruta | Permiso | Entrada | Éxito |
| --- | --- | --- | --- |
| `GET /v1/cfg/parametros` | `plat.parametro.leer` | query `producto?`, `q?`, `obsoletos?` | 200 `[{ codigo, producto_codigo, descripcion, tipo, alcance_maximo, valor_defecto, esquema, obsoleto, efectivo: { valor, origen } }]` |
| `GET /v1/cfg/parametros/{codigo}` | `plat.parametro.leer` | — | 200 `{ definicion, niveles: [{ alcance, empresa_id, sucursal_id, entidad_nombre, valor, modificado_por, modificado_en, fuera_de_alcance }] }` |
| `PUT /v1/cfg/parametros/{codigo}/valores` | `plat.parametro.editar` | `{ alcance, empresa_id?, sucursal_id?, valor }` | 200 `{ alcance, empresa_id, sucursal_id, valor, modificado_en, cambiado }` |
| `DELETE /v1/cfg/parametros/{codigo}/valores` | `plat.parametro.editar` | query `alcance`, `empresa_id?`, `sucursal_id?`, `confirmar=true` | 200 `{ efectivo: { valor, origen } }` |

- Código inexistente: 404 `PARAMETRO_NO_DEFINIDO`. Entidad de otro tenant o id no UUID: 404 `NO_ENCONTRADO`.
- El filtro de errores es propio de la lib, como en `membresias.controller.ts`.

### Configuración

Sin variables nuevas. `ParametrosModule.register({ dataSource, redisUrl })` crea su cliente Redis con el mismo `REDIS_URL`.

## Plan de implementación

1. **Migración y funciones SQL.**
   - `db/01c_cfg.sql`, su inverso y `db/tests/01c_cfg.test.sql` con un rol sin `BYPASSRLS` (`cfg_test_app`).
   - Casos: herencia sucursal → empresa → tenant → defecto (TR-CA-080, 083, 084); empresa derivada de la sucursal; nivel más específico que `alcance_maximo` ignorado; `ck_valor_ambito`; unicidad por nivel con nulos; `p_tenant` distinto de `app.tenant_id` da 0 filas; RLS de `parametro_valor` y `version_tenant` entre dos tenants; FK a sucursal de otro tenant falla; cada escritura sube `vt`; `vd` sube con `definiciones_aplicadas`.
   - Verificar: `pnpm nx test migrar` (en CI) y `db:up` / `db:down` / `db:up` en CI.
2. **Lib `parametros` vacía.**
   - `project.json`, `tsconfig*.json`, `jest.config.mjs` y `src/index.ts` copiados de `seguridad`; alias en `tsconfig.base.json`; etiquetas `comp:cfg`.
   - Verificar: `pnpm nx run parametros:lint parametros:build` y `pnpm nx test boundaries-test` (cfg no importa `org` ni `aud`).
3. **Dominio.**
   - `tipos.ts`, `codigo-parametro.ts`, `definicion-parametro.ts`, `valor-parametro.ts`, `eventos.ts`, `errores.ts`, puerto `ValidadorEsquema` y adaptador `infrastructure/ajv/validador-esquema.ajv.ts`.
   - Pruebas: tipos válidos e inválidos por cada `TipoParametro`; defecto «treinta» en `NUMERO` (TR-CA-079); 25 con rango 0-20 (TR-CA-082); palabra clave no soportada; `admite('SUCURSAL')` con máximo `EMPRESA` (TR-CA-081); `cambiar` con el mismo valor no emite evento; `restablecer` emite `restablecido: true`; código con prefijo de otro producto.
   - Verificar: `pnpm nx test parametros` y cobertura de `src/domain/**` ≥ 70 %.
4. **`RegistrarDefiniciones` y CLI.**
   - Caso de uso, `RepositorioDefiniciones` TypeORM y cambio en `manifiesto.cli.ts`.
   - Pruebas: TR-CA-078 (`rest.propina.porcentaje` del manifiesto REST `1.5.0` queda con máximo `SUCURSAL`); TR-CA-079 (sale con 1 y `seg` no cambia); repetir da 0 cambios y `vd` no sube; retirar marca obsoleto y conserva valores; volver a declararla la reactiva.
   - Verificar: `pnpm nx test parametros` y `pnpm nx test api`.
5. **`AlcanceActor` en seguridad.**
   - Puerto exportado, implementación con `actorCubre` y `UbicacionesOrg`, provisto en `SeguridadModule`; exportar `ConfirmacionRequeridaError`.
   - Pruebas: propietario; `TENANT`; `EMPRESA` cubre su sucursal y no otra empresa; `SUCURSAL` no cubre `TENANT`.
   - Verificar: `pnpm nx test seguridad`.
6. **`FijarValor` y `RestablecerValor`.**
   - Casos de uso, `RepositorioValores` TypeORM (bloqueo optimista por `version`) y esquema del evento.
   - Pruebas: TR-CA-080 («Food court Jockey» 0, demás 10); TR-CA-081; TR-CA-082; TR-CA-086 (restablecer la sucursal resuelve 10 `TENANT`); TR-CA-087 (resuelve defecto `DEFECTO`); valor igual no publica; obsoleto da 409 al fijar y se restablece; admin de sucursal no fija a nivel tenant (403); `parametro.cambiado` en el outbox en la misma transacción; sin `confirmar` da 400.
   - Verificar: `pnpm nx test parametros`.
7. **`ResolverParametro` y caché.**
   - `ParametroPort`, `CacheParametros` Redis y en memoria, `ResolucionSql`.
   - Pruebas: TR-CA-083 (12 `EMPRESA` en «Cayma»); TR-CA-084 (30 `DEFECTO`); TR-CA-085 (`rest.mesa.color` lanza `PARAMETRO_NO_DEFINIDO`); tras fijar, la siguiente resolución ve el valor nuevo sin esperar el TTL; cambiar un default en el manifiesto también invalida; Redis caído resuelve desde la base; tenant A no ve valores de B; p95 con caché < 20 ms en 200 llamadas contra Redis de CI.
   - Verificar: `pnpm nx test parametros`.
8. **Lecturas, controlador y manifiesto.**
   - `ListarParametros`, `ConsultarNiveles`, `parametros.controller.ts`, DTO, filtro de errores, `ParametrosModule`, registro en `AppModule`, `PERMISOS_CFG` y manifiesto PLAT `1.2.0`.
   - Pruebas supertest: cada fila de la tabla HTTP; sin `plat.parametro.editar` da 403 `SIN_PERMISO`; sucursal de otro tenant da 404; lista sin productos no contratados; aplicar el manifiesto dos veces da 0 cambios.
   - Verificar: `pnpm nx run-many -t lint test build` con código 0 y las rutas en `/v1/docs`.
9. **Nube, dev (manual).**
   - `pnpm db:up:remoto` y `pnpm manifiesto:aplicar:remoto` del PLAT `1.2.0`. Revisar con el MCP que `cfg` no aparece en la Data API y `get_advisors` sin alertas nuevas de RLS.
   - Prueba de humo con la API local contra dev: listar, fijar `plat.sesion.minutos_inactividad` en 20 para el tenant, resolver con origen `TENANT`, restablecer y ver `DEFECTO`. Borrar los datos de prueba.
   - Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Definiciones (TR-RF-030, TR-RNF-120):**

- [ ] Aplicar el manifiesto REST `1.5.0` con `rest.propina.porcentaje` `NUMERO` defecto 10 deja la definición con `alcance_maximo = 'SUCURSAL'` (TR-CA-078).
- [ ] Un manifiesto con `plat.sesion.minutos_inactividad` defecto «treinta» sale con código 1, el error dice «Se esperaba un valor NUMERO» y no cambia nada en `seg` ni en `cfg` (TR-CA-079).
- [ ] Aplicar dos veces el mismo manifiesto da 0 cambios de parámetros la segunda vez y `vd` no sube.
- [ ] Una definición retirada queda `obsoleto = true`, sus valores siguen y `ParametroPort` la resuelve.
- [ ] Un esquema con una palabra clave fuera del subconjunto rechaza la definición.

**Valores (TR-RF-031, TR-RN-014, TR-RN-015):**

- [ ] Con propina 10 en el tenant, fijar 0 en «Food court Jockey» hace que esa sucursal resuelva 0 y las demás 10 (TR-CA-080).
- [ ] Fijar `plat.factura.moneda_defecto` (máximo `EMPRESA`) en una sucursal responde 400 «Este parámetro se configura como máximo a nivel de empresa» (TR-CA-081).
- [ ] Fijar 25 en `rest.propina.porcentaje` (0 a 20) responde 400 «El valor debe estar entre 0 y 20» (TR-CA-082).
- [ ] Un actor con alcance `SUCURSAL` no fija un valor a nivel `TENANT` (403 `ACTOR_SIN_ALCANCE`).
- [ ] Fijar el mismo valor dos veces no escribe ni publica la segunda vez.
- [ ] Cada cambio deja `modificado_por`, `modificado_en` y `parametro.cambiado` en el outbox en la misma transacción.
- [ ] Fijar un valor en un parámetro obsoleto responde 409 `PARAMETRO_OBSOLETO`.

**Resolución (TR-RF-032, TR-RNF-101):**

- [ ] Con 12 en la empresa y nada en «Cayma», el puerto devuelve 12 con origen `EMPRESA` (TR-CA-083).
- [ ] Sin valores de `plat.sesion.minutos_inactividad`, el puerto devuelve 30 con origen `DEFECTO` (TR-CA-084).
- [ ] Pedir `rest.mesa.color` lanza `PARAMETRO_NO_DEFINIDO` (TR-CA-085).
- [ ] Tras fijar o restablecer, la siguiente resolución devuelve el valor nuevo (≤ 5 s, sin esperar el TTL).
- [ ] Con Redis detenido, el puerto resuelve desde la base y escribe un log `warn`.
- [ ] El p95 de 200 resoluciones con caché es menor a 20 ms en CI.

**Restablecer (TR-RF-033):**

- [ ] Con propina 0 en «Food court Jockey» y 10 en el tenant, restablecer la sucursal devuelve 10 con origen `TENANT` (TR-CA-086).
- [ ] Con solo el valor del tenant, restablecerlo devuelve el defecto con origen `DEFECTO` (TR-CA-087).
- [ ] Sin `confirmar=true` responde 400 y no borra.
- [ ] Restablecer publica `parametro.cambiado` con `restablecido: true` y `valor_anterior`.
- [ ] `GET /v1/cfg/parametros/{codigo}` devuelve el defecto y cada nivel con entidad, valor, `modificado_por` y `modificado_en`.

**Aislamiento, migraciones y calidad:**

- [ ] Desde el tenant A, con `cfg_test_app`, no se lee ni escribe ninguna fila de `cfg.parametro_valor` de B, y `cfg.valor` con el tenant de B da 0 filas.
- [ ] Fijar un valor con una sucursal de otro tenant responde 404.
- [ ] `db:up && db:down && db:up` termina con 0 en CI y `db:down` deja la base como la dejó el spec 08.
- [ ] `src/domain` no importa `@nestjs/*`, `typeorm`, `ioredis` ni `ajv`. `parametros` no importa `org` ni `aud` (Nx en CI).
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] Las 4 rutas figuran en `/v1/docs` con sus códigos de error.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, `01c_cfg.sql` está aplicada y el manifiesto PLAT `1.2.0` figura en `seg.manifiesto_aplicado`.
- [ ] En dev, el esquema `cfg` no está expuesto en la Data API.
- [ ] En dev, la prueba de humo fija, resuelve y restablece `plat.sesion.minutos_inactividad`, y los datos de prueba se borran.
- [ ] Las horas reales de D-01 y de la parte de D-05 quedan registradas en el plan.

## Decisiones

- **Sí:** dependencia del spec 06 en lugar del 07. El 07 no existe; el 06 absorbió su contenido.
- **Sí:** solo back. Decisión del usuario. No hay app Angular, shell (15) ni `shared/auth` (13). La pantalla va en un spec posterior al 15; se propone sumarla al 19b.
- **Sí:** el CLI del manifiesto compone `AplicarManifiesto` (seg) y `RegistrarDefiniciones` (cfg). Decisión del usuario. `seg` no puede importar `cfg` (PL-10); `apps/api` sí compone ambos.
- **Sí:** validar `parametros` antes de aplicar `seg`. Un defecto inválido rechaza todo el manifiesto, como TR-CA-024.
- **No:** evento `manifiesto.aplicado` para disparar cfg. Exige el relay del spec 11 y el spec 06 lo descartó.
- **Sí:** definiciones globales sin tenant y valores con `tenant_id` y RLS. Una definición es del producto, no del cliente.
- **Sí:** auditoría con `modificado_por`/`modificado_en` en la fila y `parametro.cambiado` con valor anterior y nuevo. Decisión del usuario. El spec 20 audita consumiendo el evento.
- **No:** puerto `AuditoriaPort` nulo ni tabla de historial. El primero no aporta nada hoy; la segunda es RF-034 (R2).
- **Sí:** caché con clave versionada `cfg:{tenant}:{vt}.{vd}:...`, TTL 60 s. Decisión del usuario. Mismo patrón que permisos: invalida al commit, sin borrar claves.
- **Sí:** `vd` global por registro de definiciones. Un cambio de defecto o de alcance máximo invalida a todos los tenants.
- **No:** borrado explícito por índice `cfg-idx`. Con versiones no hace falta y un fallo de borrado dejaría datos viejos.
- **Sí:** restablecer con `DELETE` físico y `parametro.cambiado` con `restablecido: true`. Decisión del usuario. El SRS no pide evento, pero sin él el edge (R2) no se entera.
- **Sí:** `plat.parametro.editar` no sensible, `alcance_minimo` `SUCURSAL`, con chequeo `cubre` del actor sobre el nivel. Decisión del usuario. Un admin de sucursal edita su sucursal; el propietario pasa.
- **Sí:** `AlcanceActor` exportado por `seguridad`. `cfg` puede importar `seg`; reutiliza `actorCubre` sin copiarlo.
- **Sí:** `plat.parametro.leer` en las dos rutas `GET`. El SRS lo asocia a RF-032; `ParametroPort` es interno y no lo exige.
- **Sí:** manifiesto PLAT `1.2.0` con los tres permisos, la opción «Parámetros» y `plat.sesion.minutos_inactividad` (defecto 30, máximo `TENANT`). Decisión del usuario. Los de REST quedan como fixtures de prueba.
- **Sí:** rol nuevo `PLAT_ADMIN_CONFIGURACION` en lugar de sumar a `PLAT_ADMIN_SEGURIDAD`. Configurar no es seguridad. Propuesta de redacción: revisar al aprobar.
- **Sí:** 4 rutas bajo `/v1/cfg`. Decisión del usuario. Resolver es solo interno; una ruta para SazónPOS se decide en el spec 22.
- **Sí:** `DELETE` con `confirmar=true` en la query. Un cuerpo en `DELETE` no es fiable en todos los clientes.
- **Sí:** subconjunto acotado de JSON Schema con Ajv y mensajes propios en español. Decisión del usuario. Ajv ya está en dependencias.
- **Sí:** `ValidadorEsquema` como puerto; Ajv solo en `infrastructure/ajv/`. El dominio no depende de librerías.
- **Sí:** un obsoleto resuelve (con log `warn`), no se edita y sí se restablece. Decisión del usuario. No rompe a un consumidor ya desplegado.
- **Sí:** código con la regla de `CodigoPermiso` (`producto.ambito.nombre`, prefijo = `lower(producto_codigo)`), en una clase propia de cfg. Resuelve el choque del SRS entre `plat` y `producto_codigo` de 5 letras.
- **Sí:** la sucursal no guarda `empresa_id`; se deriva en `cfg.valor`. Evita incoherencias sin un trigger extra.
- **Sí:** una sola implementación de la herencia, en SQL (`cfg.valor`). El dominio valida tipo y alcance; no duplica la resolución.
- **Sí:** bajar `alcance_maximo` no borra valores; se ignoran y se marcan `fuera_de_alcance`. Borrar datos del cliente desde un manifiesto es peor.
- **Sí:** fijar el mismo valor no escribe ni publica (TR-RNF-008).
- **Sí:** sin PostgreSQL ni Supabase locales. Pruebas de integración y SQL solo en CI con `TEST_DATABASE_URL`; en local se saltan. Verificación real en dev en el paso 9 (mismo criterio del spec 08).
- **Sí:** `cfg.parametro_def` y `cfg.definiciones_aplicadas` sin RLS, como el catálogo de seg. Decisión del usuario al implementar el paso 1: el texto original pedía RLS de solo lectura «igual que seg», pero seg no la tiene.
- **Sí:** cambiar el `tipo` de una definición existente se rechaza con `DefinicionInvalidaError` y no se escribe nada. Decisión del usuario al implementar el paso 4: los valores guardados dejarían de cumplir el tipo; un tipo nuevo es un código nuevo.
- **Sí:** `RepositorioDefiniciones` como `transaccion(sesion => { todasDe, aplicar })`, igual que `RepositorioManifiestos`. Corre con la conexión de migración; `buscar` va al puerto de lectura de la aplicación (paso 6).
- **Sí:** prueba de humo en dev con migración y manifiesto. Decisión del usuario.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `seg` se aplica y `cfg` falla después (dos transacciones) | Se valida `parametros` antes de tocar `seg`. Si falla la escritura de `cfg`, repetir el CLI es idempotente y completa. |
| Cada resolución hace una consulta de versiones antes de Redis | Es una lectura por PK, como permisos. Se mide el p95 en CI; si no llega, se cachean las versiones 1 s en memoria (otro spec). |
| Un consumidor guarda el valor y no vuelve a resolver | `ParametroPort` es la única vía (TR-RNF-119); el consumidor llama por operación y la caché responde. |
| `UNIQUE NULLS NOT DISTINCT` no existe antes de PostgreSQL 15 | CI y Supabase usan 16; la prueba de unicidad lo cubre. |
| Las palabras clave de Ajv y el subconjunto se desalinean | El adaptador lista las permitidas y rechaza el resto al registrar; API de Ajv consultada con context7 en el paso 3. |
| El admin de sucursal ve en `GET` los valores de otras sucursales del tenant | Solo lectura dentro del mismo tenant; se acepta en R1. Filtrar por alcance del lector entra con la pantalla si se pide. |

## Lo que **no** está en este spec

- Pantalla de parámetros en `admin-cliente` (spec posterior al 15, propuesto 19b).
- Historial TR-RF-034 (R2) y auditoría TR-AUD (spec 20).
- Relay del outbox (spec 11) y caché del edge (R2+).
- Ruta de resolución para consumidores externos y migración de parámetros de SazónPOS (spec 22).
- Siembra de valores en el alta de tenant (spec 12).
- Parámetros por unidad operativa.
- Prod (plan de migración a producción).

Cada uno entra en su propio spec cuando su sprint lo pida.
