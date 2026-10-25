# SPEC 10 — Correlativos: series por empresa y numeración atómica con reinicio por periodo

> **Status:** Implementado
> **Depends on:** SPEC 02, SPEC 03, SPEC 06, SPEC 09
> **Date:** 2026-10-24
> **Objective:** Crear `libs/plataforma/correlativos` (TR-SEQ) con el esquema `seq`, la administración de series por empresa, sucursal o unidad en `/v1/seq`, y `CorrelativoPort.siguiente` que entrega dentro de la transacción del producto un número sin duplicados ni huecos, con reinicio anual o diario en la zona horaria de la sucursal.

## Por qué existe este spec

Fila 10 de `docs/roadmap-specs.md` (D-02 y la parte de series de D-05). Contexto de apoyo: `docs/spec-context/10-seq-correlativos.md`. Su sección 9 (ambigüedades y preguntas) queda resuelta por las Decisiones de este spec.

El roadmap pone como dependencia el spec 07. El 07 no existe: el spec 06 absorbió su contenido (`@Permiso`, `X-Sucursal-Id`, `AlcanceActor` vía spec 09). Depende además del 09 porque reutiliza el módulo de menú «Configuración» y el rol `PLAT_ADMIN_CONFIGURACION` del manifiesto PLAT `1.2.0`.

No existe DDL ni código de SEQ en `codigo/` (`transversal/sql/04_seq` no está disponible). Todo se escribe desde cero.

RF cubiertos:

- **TR-RF-035** configurar series y correlativos (parte back; la pantalla va en otro spec).
- **TR-RF-036** obtener siguiente número atómico (`CorrelativoPort`).
- **TR-RF-037** reiniciar correlativo por periodo.

Criterios del SRS: TR-CA-090 a 097. Los criterios de duplicado, inactiva, agotada, aislamiento y reinicio anual son propios de este spec.

Reglas: **TR-RN-016** (numeración atómica sin duplicados ni huecos por empresa, tipo y serie; reinicio NUNCA, ANUAL o DIARIO), **TR-RN-017** (formato de series SUNAT), **TR-RN-009** («cambiar series» es sensible), **TR-RN-001** (tenant en toda fila).

RNF propios:

- **TR-RNF-103**: ≥ 200 números/s por serie con 50 hilos; 0 duplicados y 0 huecos, probado en CI.
- **TR-RNF-017**: solo el formato de serie (RN-017); la homologación SUNAT es de TR-FE.

RNF heredados: 001, 008 (crear y cambiar estado; `siguiente` no es idempotente por naturaleza), 010, 012, 013 (fila con actor y fecha más evento; persistencia en el spec 20), 024, 025, 026, 106, 119.

Historias del backlog: **D-02** completa y la parte de series de **D-05** sin la pantalla. Estimado: 8 h.

## Alcance

**In:**

- **Migración** `db/01d_seq.sql`, su inverso `db/rollback/01d_seq.sql` y prueba `db/tests/01d_seq.test.sql`. Ordena entre `01c_cfg.sql` y `01e_sync_outbox.sql`; no depende del outbox.
- **Lib nueva** `libs/plataforma/correlativos` (proyecto `correlativos`, etiquetas `scope:plataforma`, `type:backend`, `comp:seq`, alias `@vitrina/plataforma/correlativos`). Estructura `domain · application · infrastructure · interface · test`, con build, Jest y tsconfig copiados de `parametros`.
- **Dominio** en `domain/`: tipos, código de serie, agregado `Serie`, `NumeroCorrelativo`, eventos, errores y `PERMISOS_SEQ`.
- **Casos de uso** en `application/`: `CrearSerie`, `CambiarEstadoSerie`, `ListarSeries`, `ConsultarSerie` y `ObtenerSiguiente` (detrás de `CorrelativoPort`).
- **Puertos** en `application/ports/` y adaptadores en `infrastructure/typeorm/`.
- **Interfaz**: `interface/series.controller.ts` con 4 rutas bajo `/v1/seq`, DTO, zod y OpenAPI.
- **Manifiesto PLAT** `1.3.0`: permisos `plat.serie.*`, opción «Series» y `plat.serie.gestionar` en `PLAT_ADMIN_CONFIGURACION`.
- **`apps/api`**: `CorrelativosModule.register` en `AppModule`.
- **Pruebas**: dominio (Jest), SQL contra PostgreSQL 16, integración y concurrencia con PostgreSQL 16 (solo en CI), HTTP con supertest.
- **Nube, dev (manual)**: migración, manifiesto PLAT `1.3.0` y prueba de humo.

**Out of scope (para otros specs):**

- Pantalla de series en `admin-cliente` (spec posterior al 15; se propone sumarla al 19b junto a la de parámetros).
- Reserva de bloques offline TR-RF-038, `plat.serie.reservar_bloque`, TR-RN-046 y TR-RNF-108 (R2).
- Emisión de comprobantes TR-FE (R2): usa el puerto, no lo construye. Elegir F### o B### para una nota según el comprobante afectado también es de TR-FE.
- Siembra de series iniciales en el alta de tenant (spec 12): usa `CrearSerie` exportado.
- Migración de la numeración de SazónPOS (spec 22, CC-03).
- Auditoría persistente TR-AUD (spec 20). Consume `serie.creada` y `serie.estado_cambiado`.
- Relay del outbox (spec 11).
- Editar, bajar o ajustar `ultimo_numero` después de crear, y borrar series. Sin RF.
- Ruta HTTP para `siguiente`.
- Proyecto prod (plan de migración a producción).

## Base de código reutilizada

**Se conserva (como patrón):**

- `db/01a_org.sql` y `db/01c_cfg.sql`: FK compuestas `(tenant_id, id)`, RLS `ENABLE + FORCE` con `app.tenant_id`, `REVOKE` a `anon` y `authenticated` si existen, funciones `SECURITY INVOKER` con `search_path = ''` que devuelven 0 filas si `p_tenant` no es `app.tenant_id`.
- Spec 09: estructura de la lib `parametros`, entidades `EntitySchema` y mapeo explícito (`mapeo.ts`), entidades ORM de solo lectura sobre `org` (`entidades-org.ts`), filtro de errores y `validar` propios en `interface/*.http.ts`, registro del módulo con `ENTIDADES_*`.
- `seguridad`: `AlcanceActor.cubre`, `PermisoGuard`, metadata `REQUIERE_MFA` para permisos sensibles, `ContextoTenantInterceptor`.
- `kernel-infra`: `TypeOrmUnitOfWork` (su `manager` lanza `NoActiveTransactionError` fuera de `run`), `AlsTenantContext`, `OutboxPublisher`.
- `kernel`: puerto `Clock`.

**Cambia:**

- `plat.manifiesto.json` pasa a `1.3.0`.
- `apps/api/src/app.module.ts` registra `CorrelativosModule`.

**No existe** y se escribe desde cero: esquema `seq`, `seq.siguiente`, toda la lib `correlativos` y sus pruebas.

## Modelo de datos

### Migración `db/01d_seq.sql`

```sql
CREATE SCHEMA seq;

CREATE TABLE seq.serie (
  id             uuid         PRIMARY KEY,
  tenant_id      uuid         NOT NULL REFERENCES org.tenant (id),
  empresa_id     uuid         NOT NULL,
  sucursal_id    uuid         NULL,
  unidad_id      uuid         NULL,
  tipo           varchar(12)  NOT NULL CHECK (tipo IN ('BOLETA','FACTURA','NOTA_CREDITO','NOTA_DEBITO',
                                                        'TICKET','KARDEX','EXPEDIENTE','HC','ESCRITURA')),
  serie          varchar(10)  NOT NULL CHECK (serie ~ '^[A-Z0-9]{1,10}$'),
  digitos        smallint     NOT NULL CHECK (digitos BETWEEN 1 AND 10),
  reinicio       varchar(7)   NOT NULL CHECK (reinicio IN ('NUNCA','ANUAL','DIARIO')),
  ultimo_numero  bigint       NOT NULL CHECK (ultimo_numero >= 0),
  periodo        varchar(10)  NULL,          -- '2026' o '2026-10-10'; NULL si NUNCA
  activa         boolean      NOT NULL DEFAULT true,
  version        bigint       NOT NULL DEFAULT 0,
  creado_por     uuid         NOT NULL REFERENCES seg.usuario (id),
  creado_en      timestamptz  NOT NULL DEFAULT now(),
  modificado_por uuid         NOT NULL REFERENCES seg.usuario (id),
  modificado_en  timestamptz  NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, empresa_id)  REFERENCES org.empresa (tenant_id, id),
  FOREIGN KEY (tenant_id, sucursal_id) REFERENCES org.sucursal (tenant_id, id),
  FOREIGN KEY (tenant_id, unidad_id)   REFERENCES org.unidad_operativa (tenant_id, id),
  CONSTRAINT ux_serie UNIQUE (tenant_id, empresa_id, tipo, serie),
  CONSTRAINT ck_serie_agotada CHECK (ultimo_numero < 10::bigint ^ digitos),
  CONSTRAINT ck_serie_periodo CHECK ((reinicio = 'NUNCA') = (periodo IS NULL)),
  CONSTRAINT ck_serie_sunat CHECK (
       (tipo = 'FACTURA' AND serie ~ '^F[A-Z0-9]{3}$')
    OR (tipo = 'BOLETA'  AND serie ~ '^B[A-Z0-9]{3}$')
    OR (tipo IN ('NOTA_CREDITO','NOTA_DEBITO') AND serie ~ '^[FB][A-Z0-9]{3}$')
    OR tipo NOT IN ('FACTURA','BOLETA','NOTA_CREDITO','NOTA_DEBITO')),
  CONSTRAINT ck_serie_sunat_ambito CHECK (
    tipo NOT IN ('FACTURA','BOLETA','NOTA_CREDITO','NOTA_DEBITO') OR (sucursal_id IS NOT NULL AND digitos = 8))
);
-- RLS ENABLE + FORCE con tenant_id = app.tenant_id para SELECT, INSERT y UPDATE. Sin política de DELETE.
-- REVOKE ALL del esquema seq a anon y authenticated si existen (regla 8).
```

- `ultimo_numero` es el último número emitido. El siguiente es `ultimo_numero + 1`. Al crear se fija el último ya usado (0 para una serie nueva; el valor real al migrar una serie existente).
- Si la serie tiene unidad, `sucursal_id` guarda la sucursal de la unidad (o NULL si es un `ALMACEN` sin sucursal). Lo valida `CrearSerie`; la base solo tiene las FK.
- `ck_serie_agotada`: con 8 dígitos el máximo es 99 999 999. Superarlo falla el `UPDATE` y se traduce a `SerieAgotadaError`.
- El inverso borra el esquema `seq` completo (`DROP SCHEMA seq CASCADE`).

### Funciones SQL (`SET search_path = ''`)

```sql
-- IMMUTABLE. NULL si NUNCA; 'YYYY' si ANUAL; 'YYYY-MM-DD' si DIARIO, de p_instante en p_zona.
seq.periodo_de(p_reinicio varchar, p_zona varchar, p_instante timestamptz) RETURNS varchar

-- Trigger BEFORE INSERT ON seq.serie: fija periodo = seq.periodo_de(reinicio, zona, creado_en).
seq.fijar_periodo_inicial() RETURNS trigger

-- SECURITY INVOKER, VOLATILE. Un solo UPDATE ... RETURNING.
seq.siguiente(p_tenant uuid, p_empresa uuid, p_tipo varchar, p_serie varchar, p_instante timestamptz DEFAULT now())
  RETURNS TABLE (serie varchar, numero bigint, digitos smallint)
```

`seq.siguiente` (TR-RN-016, TR-RF-036, TR-RF-037):

- `p_tenant` distinto de `app.tenant_id`: 0 filas.
- Zona horaria: `org.sucursal.zona_horaria` de `sucursal_id`; sin sucursal, `America/Lima`.
- `UPDATE seq.serie SET ultimo_numero = CASE WHEN periodo IS DISTINCT FROM nuevo THEN 1 ELSE ultimo_numero + 1 END, periodo = nuevo WHERE tenant_id, empresa_id, tipo, serie AND activa RETURNING ...`, con `nuevo = seq.periodo_de(reinicio, zona, p_instante)`.
- El bloqueo de fila del `UPDATE` serializa a los emisores de la serie hasta el commit. Bajo `READ COMMITTED`, PostgreSQL reevalúa el `SET` sobre la versión ya commiteada, así que dos pedidos en el cambio de día no reinician dos veces.
- Inexistente o inactiva: 0 filas. El adaptador distingue el caso con una lectura por la clave única.
- No modifica `version`: el bloqueo optimista es solo para la administración.
- Nunca se usa una `SEQUENCE` de PostgreSQL: se consume aunque la transacción se revierta y deja huecos.

### Dominio

```ts
// domain/tipos.ts
export type TipoDocumento = 'BOLETA' | 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO'
  | 'TICKET' | 'KARDEX' | 'EXPEDIENTE' | 'HC' | 'ESCRITURA';
export type Reinicio = 'NUNCA' | 'ANUAL' | 'DIARIO';
export const TIPOS_COMPROBANTE: readonly TipoDocumento[];   // BOLETA, FACTURA, NOTA_CREDITO, NOTA_DEBITO
export const DIGITOS_COMPROBANTE = 8;
export const DIGITOS_POR_DEFECTO = 8;

// domain/ambito-serie.ts
export interface AmbitoSerie { empresaId: string; sucursalId: string | null; unidadId: string | null }

// domain/serie.ts (AggregateRoot con version)
export class Serie extends AggregateRoot {
  static crear(datos: { id; tenantId; ambito: AmbitoSerie; tipo; codigo; digitos?; reinicio;
                        ultimoNumero; por; ahora }): Serie;   // valida y emite serie.creada
  cambiarEstado(activa: boolean, por: string, ahora: Date): boolean;  // false si no cambia: sin evento
}

// domain/numero-correlativo.ts
export class NumeroCorrelativo {
  static de(serie: string, numero: bigint, digitos: number): NumeroCorrelativo;
  get formateado(): string;   // `${serie}-${numero con relleno de ceros a digitos}`: B002-00000125, A-001
}
```

Validaciones de `Serie.crear` (TR-RN-017, en este orden):

| Regla | Error |
| --- | --- |
| `codigo` de 1 a 10, `^[A-Z0-9]+$` | `SerieInvalidaError` «La serie debe tener de 1 a 10 letras mayúsculas o dígitos» |
| `FACTURA`: `^F[A-Z0-9]{3}$` | `SerieInvalidaError` «Las series de factura deben iniciar con F y tener 4 caracteres» (TR-CA-091) |
| `BOLETA`: `^B[A-Z0-9]{3}$` | `SerieInvalidaError` «Las series de boleta deben iniciar con B y tener 4 caracteres» |
| Notas: `^[FB][A-Z0-9]{3}$` | `SerieInvalidaError` «Las series de notas deben iniciar con F o B y tener 4 caracteres» |
| Comprobante con `digitos` distinto de 8 | `SerieInvalidaError` «Los comprobantes electrónicos usan 8 dígitos» |
| Comprobante sin sucursal | `AmbitoSerieInvalidoError` «Las series de comprobantes se asocian a una sucursal» |
| `digitos` fuera de 1-10 | `SerieInvalidaError` «Los dígitos deben estar entre 1 y 10» |
| `ultimoNumero` < 0 o ≥ 10^digitos | `SerieInvalidaError` «El último número no cabe en N dígitos» |

`digitos` omitido toma `DIGITOS_POR_DEFECTO` (8). El periodo inicial no se calcula en el dominio: lo fija el trigger con `seq.periodo_de`. Hay una sola implementación del periodo, en SQL.

Errores de dominio nuevos (heredan de `DomainError`):

| Clase | `code` | HTTP | Mensaje |
| --- | --- | --- | --- |
| `SerieInvalidaError(mensaje)` | `SERIE_INVALIDA` | 400 | Mensajes de la tabla anterior |
| `AmbitoSerieInvalidoError(mensaje)` | `AMBITO_INVALIDO` | 400 | La unidad no pertenece a la sucursal, o la sucursal no pertenece a la empresa |
| `SerieDuplicadaError` | `SERIE_DUPLICADA` | 409 | Ya existe la serie `<serie>` de `<tipo>` en la empresa |
| `SerieNoEncontradaError` | `SERIE_NO_ENCONTRADA` | 404 | La serie no existe |
| `SerieInactivaError` | `SERIE_INACTIVA` | 409 | La serie está desactivada |
| `SerieAgotadaError` | `SERIE_AGOTADA` | 409 | La serie llegó a su número máximo |

Se reutilizan: `NoActiveTransactionError` (kernel) y `ActorSinAlcanceError` (seguridad, 403).

### Puertos (`application/ports/`)

```ts
// Exportado en index.ts: lo usan los productos (TR-RNF-119).
export const CORRELATIVO_PORT = Symbol('CorrelativoPort');
export interface CorrelativoPort {
  /** Corre en la transacción activa del UnitOfWork; fuera de ella lanza NoActiveTransactionError. */
  siguiente(solicitud: { empresaId: string; tipo: TipoDocumento; serie: string }):
    Promise<{ serie: string; numero: bigint; numeroFormateado: string }>;
}

RepositorioSeries { buscar(id): Serie | null; insertar(serie); guardarEstado(serie) }  // guardarEstado no toca ultimo_numero
NumeracionSql     { siguiente(tenantId, solicitud, instante): FilaNumerada | null; estado(tenantId, solicitud): 'INACTIVA' | null }
UbicacionesSerie  { sucursalDeUnidad(unidadId): { sucursalId: string | null; empresaId: string } | null;
                    empresaDeSucursal(sucursalId): string | null }
LecturaSeries     { listar(filtro): SerieListada[]; consultar(id): SerieDetalle | null }
```

- `AlcanceActor` (de `seguridad`): `cubre(usuarioId, destino, ahora)` con `{ alcance, empresaId, sucursalId }` del ámbito de la serie.
- `NumeracionSql` en `infrastructure/typeorm/numeracion-sql.typeorm.ts`: llama a `seq.siguiente` con el `EntityManager` de la transacción activa (`TypeOrmUnitOfWork.manager`). SQL crudo justificado por la regla 11: función de base de datos con bloqueo y reinicio atómicos.
- `UbicacionesSerie` usa entidades ORM de solo lectura sobre `org.sucursal` y `org.unidad_operativa`. La RLS oculta las de otro tenant.

### Casos de uso: puntos no obvios

**`CrearSerie({ ambito, tipo, codigo, digitos?, reinicio, ultimoNumero, actor })`** (TR-RF-035), exportado en `index.ts` para el spec 12:

1. Ámbito: con unidad, se toma su sucursal y empresa de `UbicacionesSerie`; si la sucursal enviada difiere o la empresa no coincide → `AmbitoSerieInvalidoError`. Con sucursal, su empresa debe ser la enviada. Unidad o sucursal de otro tenant → 404 `NO_ENCONTRADO`.
2. `AlcanceActor.cubre(actor, ámbito)` o `ActorSinAlcanceError`. Alcance `SUCURSAL` si hay sucursal; `EMPRESA` si no.
3. `Serie.crear` (validaciones de la tabla).
4. Transacción: `INSERT` y `serie.creada` en el outbox. Violación de `ux_serie` → `SerieDuplicadaError`. Un reintento con los mismos datos también da 409: el cliente lo trata como ya creada.

**`CambiarEstadoSerie({ id, activa, actor })`**:

1. Inexistente → `SerieNoEncontradaError`. Mismo chequeo de alcance del actor.
2. Mismo estado: 200 sin escribir ni publicar (TR-RNF-008).
3. Transacción: `UPDATE` solo de `activa`, `version`, `modificado_por` y `modificado_en` con `WHERE version = :anterior`, y `serie.estado_cambiado` en el outbox. Nunca escribe `ultimo_numero` ni `periodo`: un `save` del agregado completo pisaría números emitidos en paralelo.

**`ObtenerSiguiente`** (TR-RF-036, TR-RF-037, implementa `CorrelativoPort`):

1. Tenant desde `TenantContext`. Instante desde `Clock` (en prod, la hora del sistema; en pruebas, fijo para TR-CA-096 y 097).
2. `NumeracionSql.siguiente` en la transacción activa del producto. No abre transacción propia: si el producto revierte, el número no se consume (TR-CA-095).
3. 0 filas: `estado` distingue `SerieInactivaError` de `SerieNoEncontradaError`. Violación de `ck_serie_agotada` → `SerieAgotadaError`.
4. Devuelve `NumeroCorrelativo.formateado`. No publica evento ni escribe log por número; solo log `debug` sin datos personales.
5. No evalúa `plat.serie.numerar`: el puerto es interno, como `ParametroPort`.

**`ListarSeries({ empresa_id?, sucursal_id?, tipo?, activa? })`** y **`ConsultarSerie(id)`**: filas del tenant con `ultimo_numero`, `periodo`, `digitos`, nombres de empresa, sucursal y unidad, y `siguiente_formateado` (vista previa, no reserva).

### Eventos (outbox, `schema_version = 1`, esquemas en `infrastructure/event-schemas.ts`)

| `event_type` | `aggregate_type` | Payload |
| --- | --- | --- |
| `serie.creada` | `serie` | `serie_id`, `empresa_id`, `sucursal_id`, `unidad_id`, `tipo`, `serie`, `digitos`, `reinicio`, `ultimo_numero`, `por` |
| `serie.estado_cambiado` | `serie` | `serie_id`, `tipo`, `serie`, `activa`, `por` |

Sin evento por número emitido. Sin nombres ni correos (TR-RNF-026).

### Permisos (manifiesto PLAT `1.3.0` y `PERMISOS_SEQ`)

| Código | `alcance_minimo` | `sensible` | Uso |
| --- | --- | --- | --- |
| `plat.serie.gestionar` | `SUCURSAL` | sí | Las 4 rutas, con chequeo de alcance del actor. aal2 y MFA ≤ 15 min (TR-RN-009) |
| `plat.serie.numerar` | `SUCURSAL` | no | Declarado. `CorrelativoPort` no lo exige; no va en roles humanos |

- Opción `plat.configuracion.series` («Series», `/admin/series`, icono `format_list_numbered`, orden 2, permisos `plat.serie.gestionar`) bajo `plat.configuracion`.
- `PLAT_ADMIN_CONFIGURACION` suma `plat.serie.gestionar`.

### HTTP

Todas con `@ApiBearerAuth()`, `X-Sucursal-Id` (lo exige `PermisoGuard`), `@Permiso('plat.serie.gestionar')` (sin aal2 → 401 step-up), zod (400 `SOLICITUD_INVALIDA`) y errores `{ codigo, mensaje }`.

| Método y ruta | Entrada | Éxito |
| --- | --- | --- |
| `GET /v1/seq/series` | query `empresa_id?`, `sucursal_id?`, `tipo?`, `activa?` | 200 `[{ id, empresa_id, sucursal_id, unidad_id, tipo, serie, digitos, reinicio, ultimo_numero, periodo, activa, siguiente_formateado }]` |
| `GET /v1/seq/series/{id}` | — | 200 lo anterior más nombres de entidades, `creado_por`, `creado_en`, `modificado_por`, `modificado_en` |
| `POST /v1/seq/series` | `{ empresa_id, sucursal_id?, unidad_id?, tipo, serie, digitos?, reinicio, ultimo_numero }` | 201 la serie creada |
| `PUT /v1/seq/series/{id}/estado` | `{ activa }` | 200 `{ id, activa, modificado_en, cambiado }` |

- Id no UUID o serie de otro tenant: 404 `NO_ENCONTRADO`.
- El filtro de errores es propio de la lib, como en `parametros.http.ts`.

### Configuración

Sin variables nuevas. `CorrelativosModule.register({ dataSource })`; las entidades se registran con `ENTIDADES_SEQ`.

## Plan de implementación

1. **Migración y funciones SQL.**
   - `db/01d_seq.sql`, su inverso y `db/tests/01d_seq.test.sql` con un rol sin `BYPASSRLS` (`seq_test_app`).
   - Casos: cada CHECK (`ck_serie_sunat` con «B001» en FACTURA, `ck_serie_sunat_ambito`, `ck_serie_periodo`, `ck_serie_agotada`); `ux_serie`; trigger del periodo inicial; incremento 124 → 125; reinicio DIARIO con instante 2026-10-10 13:01 UTC tras terminar el 09/10 en 342 da 1 (TR-CA-096); 2026-10-10 04:30 UTC con zona Lima continúa (TR-CA-097); reinicio ANUAL al cambiar de año; serie de empresa sin sucursal usa America/Lima; inactiva da 0 filas; `p_tenant` distinto da 0 filas; RLS entre dos tenants; FK a sucursal de otro tenant falla; `ROLLBACK` no consume el número.
   - Verificar: `pnpm nx test migrar` (en CI) y `db:up` / `db:down` / `db:up` en CI.
2. **Lib `correlativos` vacía.**
   - `project.json`, `tsconfig*.json`, `jest.config.mjs` y `src/index.ts` copiados de `parametros`; alias en `tsconfig.base.json`; etiqueta `comp:seq`.
   - Verificar: `pnpm nx run correlativos:lint correlativos:build` y `pnpm nx test boundaries-test` (seq no importa `org`, `cfg` ni `aud`).
3. **Dominio.**
   - `tipos.ts`, `ambito-serie.ts`, `serie.ts`, `numero-correlativo.ts`, `eventos.ts`, `errores.ts`, `permisos-seq.ts`.
   - Pruebas: cada fila de la tabla de validaciones; «B001» en FACTURA con el mensaje exacto (TR-CA-091); B002 de BOLETA queda con último 0 y 8 dígitos (TR-CA-090); TICKET «A» con DIARIO y 3 dígitos (TR-CA-092); `formateado` da B002-00000125 y A-001; `cambiarEstado` al mismo estado no emite evento.
   - Verificar: `pnpm nx test correlativos` y cobertura de `src/domain/**` ≥ 70 %.
4. **`CrearSerie` y `CambiarEstadoSerie`.**
   - Casos de uso, `RepositorioSeries` y `UbicacionesSerie` TypeORM, `mapeo.ts`, esquemas de eventos.
   - Pruebas: TR-CA-090 con «Cayma» (establecimiento 0002); TR-CA-092 con la unidad «Ventanilla 1»; duplicado da 409; unidad de otra sucursal da 400; actor con alcance en otra sucursal da 403; eventos en el outbox en la misma transacción; cambiar estado no toca `ultimo_numero` aunque otra transacción haya numerado entre la lectura y la escritura.
   - Verificar: `pnpm nx test correlativos`.
5. **`ObtenerSiguiente` y `CorrelativoPort`.**
   - Caso de uso, `NumeracionSql` TypeORM, export del puerto y de `CrearSerie` en `index.ts`.
   - Pruebas de integración: TR-CA-093; TR-CA-095 (F001 en 80, rollback, la siguiente es 81); TR-CA-096 y 097 con `Clock` fijo; fuera de `UnitOfWork.run` lanza `NoActiveTransactionError`; inactiva, inexistente y agotada con su error; tenant A no numera series de B.
   - Prueba de concurrencia (TR-CA-094, TR-RNF-103): 50 conexiones piden número a B002 en 200 a la vez, cada una en su transacción; resultado 201 a 250 sin duplicados ni huecos. Luego 50 hilos piden 1 000 números: 0 duplicados, 0 huecos y ≥ 200 números/s.
   - Verificar: `pnpm nx test correlativos` en CI.
6. **Lecturas, controlador y manifiesto.**
   - `ListarSeries`, `ConsultarSerie`, `series.controller.ts`, `series.http.ts`, `CorrelativosModule`, registro en `AppModule`, manifiesto PLAT `1.3.0`.
   - Pruebas supertest: cada fila de la tabla HTTP; sin `plat.serie.gestionar` da 403 `SIN_PERMISO`; con aal1 da 401 step-up; serie de otro tenant da 404; aplicar el manifiesto dos veces da 0 cambios.
   - Verificar: `pnpm nx run-many -t lint test build` con código 0 y las rutas en `/v1/docs`.
7. **Nube, dev (manual).**
   - `pnpm db:up:remoto` y `pnpm manifiesto:aplicar:remoto` del PLAT `1.3.0`. Revisar con el MCP que `seq` no aparece en la Data API y `get_advisors` sin alertas nuevas de RLS.
   - Prueba de humo con la API local contra dev: crear una serie TICKET de prueba, desactivarla y activarla, y numerar tres veces desde un script con `CorrelativoPort` (1, 2, 3). Borrar los datos de prueba con la conexión de migración.
   - Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Configurar series (TR-RF-035, TR-RN-017):**

- [ ] Registrar B002 de BOLETA con reinicio NUNCA en «Cayma» (establecimiento 0002) deja la serie asociada a «Cayma» con último número 0 (TR-CA-090).
- [ ] Registrar «B001» como FACTURA responde 400 «Las series de factura deben iniciar con F y tener 4 caracteres» (TR-CA-091).
- [ ] Registrar la serie A de TICKET con reinicio DIARIO en la unidad «Ventanilla 1» queda con `reinicio = 'DIARIO'` y el periodo del día (TR-CA-092).
- [ ] Repetir empresa, tipo y serie responde 409 `SERIE_DUPLICADA`.
- [ ] Una serie de comprobante sin sucursal o con dígitos distintos de 8 responde 400.
- [ ] Crear y cambiar estado dejan `serie.creada` o `serie.estado_cambiado` en el outbox en la misma transacción; cambiar al mismo estado no escribe ni publica.
- [ ] Cambiar el estado no modifica `ultimo_numero` ni `periodo`.

**Numeración (TR-RF-036, TR-RN-016, TR-RNF-103):**

- [ ] Con B002 en 124, el puerto devuelve 125 y `B002-00000125` (TR-CA-093).
- [ ] Con B002 en 200, 50 transacciones concurrentes reciben 201 a 250 sin duplicados ni huecos (TR-CA-094).
- [ ] 50 hilos obtienen 1 000 números con 0 duplicados, 0 huecos y ≥ 200 números/s en CI.
- [ ] Con F001 en 80, una transacción que pide número y se revierte deja la siguiente en 81 (TR-CA-095).
- [ ] Fuera de una transacción del `UnitOfWork`, el puerto lanza `NoActiveTransactionError`.
- [ ] Una serie inactiva lanza `SERIE_INACTIVA`, una inexistente `SERIE_NO_ENCONTRADA` y una en su máximo `SERIE_AGOTADA`.

**Reinicio (TR-RF-037):**

- [ ] La serie A terminó el 09/10/2026 en 342; a las 08:01 de Lima del 10/10/2026 el puerto devuelve 1 y `A-001` (TR-CA-096).
- [ ] A las 23:30 de Lima del 09/10/2026 (04:30 UTC del 10/10) el ticket continúa en 343 y no reinicia (TR-CA-097).
- [ ] Una serie ANUAL reinicia a 1 en el primer número del año nuevo y no antes.

**Aislamiento, seguridad, migraciones y calidad:**

- [ ] Desde el tenant A, con `seq_test_app`, no se lee ni escribe ninguna fila de `seq.serie` de B, y `seq.siguiente` con el tenant de B da 0 filas.
- [ ] Una sucursal o unidad de otro tenant responde 404 al crear.
- [ ] Sin `plat.serie.gestionar` las rutas responden 403; con aal1 responden 401 step-up.
- [ ] `db:up && db:down && db:up` termina con 0 en CI y `db:down` deja la base como la dejó el spec 09.
- [ ] `src/domain` no importa `@nestjs/*` ni `typeorm`. `correlativos` no importa `org`, `cfg` ni `aud` (Nx en CI).
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] Las 4 rutas figuran en `/v1/docs` con sus códigos de error.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, `01d_seq.sql` está aplicada y el manifiesto PLAT `1.3.0` figura en `seg.manifiesto_aplicado`.
- [ ] En dev, el esquema `seq` no está expuesto en la Data API.
- [ ] En dev, la prueba de humo crea, desactiva, activa y numera 1, 2, 3, y los datos de prueba se borran.
- [ ] Las horas reales de D-02 y de la parte de D-05 quedan registradas en el plan.

## Decisiones

- **Sí:** dependencia del 06 en lugar del 07, y del 09. El 07 no existe; el 09 trae el módulo «Configuración», `PLAT_ADMIN_CONFIGURACION` y `SeguridadModule` global.
- **Sí:** solo back. Decisión del usuario. No hay app Angular, shell (15) ni `shared/auth` (13). La pantalla va en un spec posterior al 15; se propone sumarla al 19b.
- **Sí:** función SQL `seq.siguiente` con un solo `UPDATE ... RETURNING` (bloqueo, reinicio e incremento atómicos). Decisión del usuario. SQL crudo justificado por la regla 11: una ida a la base por número y sin carrera en el cambio de periodo.
- **No:** `SELECT ... FOR UPDATE` con TypeORM y periodo en TS. Dos idas a la base en el camino crítico de la venta y zona horaria duplicada.
- **No:** `SEQUENCE` de PostgreSQL. Se consume al revertir y deja huecos (contradice TR-CA-095).
- **Sí:** periodo calculado solo en SQL (`seq.periodo_de`), usado por `seq.siguiente` y por el trigger del periodo inicial. Una sola implementación; una serie migrada con último 342 no reinicia en su primer número del mismo día.
- **Sí:** instante desde el `Clock` del kernel, pasado a `seq.siguiente`. En prod es la hora del sistema; permite probar TR-CA-096 y 097 sin esperar.
- **Sí:** zona horaria de la sucursal de la serie (o de la sucursal de su unidad); sin sucursal, `America/Lima`.
- **Sí:** `numero_formateado` con relleno según `digitos` de la serie. Decisión del usuario. Comprobantes con 8 fijos (RN-017); el resto 1-10, defecto 8. TR-CA-096 (A-001) se cumple con una serie de 3 dígitos.
- **Sí:** `ck_serie_agotada` en la base y `SERIE_AGOTADA`. Un número que no cabe en sus dígitos rompería el formato fiscal.
- **Sí:** notas con `^[FB][A-Z0-9]{3}$`. Decisión del usuario. Qué serie usa cada nota según el comprobante afectado lo decide TR-FE (R2).
- **Sí:** las reglas SUNAT también como CHECK en la base. Defensa ante inserciones que no pasen por el dominio (siembra del spec 12, migración del 22).
- **Sí:** alcance empresa, sucursal o unidad. Decisión del usuario. Comprobantes exigen sucursal (establecimiento); con unidad se guarda también su sucursal.
- **No:** exigir que la serie coincida con el código de establecimiento SUNAT de la sucursal. SUNAT no lo exige; B002 en «0002» es convención del cliente.
- **Sí:** `plat.serie.gestionar` sensible (aal2, MFA ≤ 15 min). Decisión del usuario. TR-RN-009 nombra «cambiar series».
- **Sí:** `alcance_minimo` `SUCURSAL` con `AlcanceActor.cubre` sobre el ámbito, igual que `plat.parametro.editar`. Propuesta de redacción: revisar al aprobar.
- **Sí:** listar, ver, crear y activar/desactivar. Decisión del usuario. Sin editar ni bajar el contador y sin borrar: un contador más bajo duplicaría números ya emitidos.
- **Sí:** `ultimo_numero` solo se fija al crear. Permite migrar series existentes (spec 22).
- **Sí:** `CambiarEstadoSerie` actualiza solo sus columnas con bloqueo optimista; `seq.siguiente` no toca `version`. Numerar no invalida una edición en curso y una edición no pisa números.
- **Sí:** `CorrelativoPort` exige transacción activa y no abre una propia. Decisión del usuario. Es lo que hace que un rollback no consuma el número.
- **Sí:** el puerto no evalúa `plat.serie.numerar`. Decisión del usuario. Es interno, como `ParametroPort`; el permiso queda declarado.
- **No:** ruta HTTP para `siguiente`. El SRS lo define como llamada transaccional del módulo; si SazónPOS la necesita, se decide en el spec 22.
- **Sí:** eventos `serie.creada` y `serie.estado_cambiado`. Decisión del usuario. El segundo no está en el SRS; deja rastro para el spec 20. Ninguno por número emitido.
- **Sí:** `CrearSerie` exportado y sin siembra aquí. Decisión del usuario. El spec 12 lo invoca en el alta.
- **Sí:** `plat.serie.gestionar` en `PLAT_ADMIN_CONFIGURACION` y opción «Series» bajo «Configuración». Decisión del usuario.
- **Sí:** crear con datos ya existentes responde 409, no 200. Sin clave de idempotencia en R1; el cliente trata el 409 como ya creada.
- **Sí:** migración propia `01d_seq.sql`. El plan juntaba CAT y SEQ en `01d_cat_seq.sql`; el roadmap los separa. CAT usará otro nombre (spec 19a). El migrador aplica pendientes por conjunto, así que ordenar antes de `01e_sync_outbox.sql` no rompe dev.
- **Sí:** sin PostgreSQL ni Supabase locales. Pruebas SQL, de integración y de concurrencia solo en CI con `TEST_DATABASE_URL`; en local se saltan. Verificación real en dev en el paso 7 (mismo criterio del spec 09).
- **Sí:** prueba de humo en dev con migración y manifiesto. Decisión del usuario.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una venta lenta retiene el bloqueo de la serie hasta su commit y frena a las demás cajas | Es el costo de «sin huecos». Se documenta en el JSDoc del puerto: pedir el número al final de la transacción, justo antes de commitear. La prueba de TR-RNF-103 lo mide. |
| `now()` de PostgreSQL es la hora de inicio de la transacción, no del pedido | El instante sale del `Clock` de la app, no de `now()`. |
| Bloqueo mutuo si una transacción numera dos series en distinto orden que otra | Raro (una venta usa una serie). Se documenta: numerar varias series en orden de `serie`. |
| `save` completo del agregado pisa `ultimo_numero` | `guardarEstado` actualiza solo columnas de estado; prueba del paso 4 con numeración intercalada. |
| Zona horaria inválida en `org.sucursal` | `AT TIME ZONE` falla y la venta no numera. org valida la zona al crear la sucursal; se agrega un caso de prueba en el paso 1 que documenta el error. |
| 200 números/s no se alcanza en el runner de CI | Se registra la medición; si falla por el runner y no por la función, se ajusta el umbral con evidencia en el spec. |

## Lo que **no** está en este spec

- Pantalla de series en `admin-cliente` (spec posterior al 15, propuesto 19b).
- Reserva de bloques offline TR-RF-038 (R2).
- Emisión de comprobantes TR-FE (R2).
- Siembra en el alta de tenant (spec 12) y migración de SazónPOS (spec 22).
- Auditoría TR-AUD (spec 20) y relay del outbox (spec 11).
- Editar el contador, borrar series y ruta HTTP de `siguiente`.
- Prod (plan de migración a producción).

Cada uno entra en su propio spec cuando su sprint lo pida.
