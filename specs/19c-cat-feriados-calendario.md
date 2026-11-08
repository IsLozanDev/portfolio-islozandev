# SPEC 19c — Catálogos: feriados por alcance, `CalendarioPort` de días hábiles y lista de administración de ítems

> **Status:** Implementado
> **Depends on:** SPEC 19a, SPEC 09, SPEC 03
> **Date:** 2026-11-07
> **Objective:** Agregar a `libs/plataforma/catalogos` los feriados GLOBAL, TENANT y SUCURSAL con su administración bajo `/v1/feriados`, el `CalendarioPort` (`sumarDiasHabiles` y `esDiaHabil`) con el parámetro `plat.calendario.sabado_habil`, y la lista paginada de administración de ítems que la UI del 19d necesita.

## Por qué existe este spec

Fila 19c de `docs/roadmap-specs.md`, que es la parte de TR-RF-029 de D-04. Contexto de apoyo: `docs/spec-context/19-cat-catalogos.md`. La partición del spec 19 está en el 19b.

Dependencias:

- **19a**: esquema `cat`, rol `cat_editor`, lib `catalogos`, `VerificadorOperador`, función `cat.items` y estados de ítem.
- **09**: `ParametroPort` y el bloque `parametros` del manifiesto (`plat.calendario.sabado_habil`).
- **03**: `org.sucursal`, con `UNIQUE (tenant_id, id)` para la FK compuesta.

No depende del 19b. Se puede implementar en paralelo.

RF cubierto: **TR-RF-029** (gestionar feriados y calcular días hábiles). También cubre la lista de administración de ítems que el 19a dejó fuera (apoyo a TR-RF-023, 025 y 026 en la UI).

Criterios del SRS: **TR-CA-075, 076 y 077**. Los de recurrencia, operador, aislamiento y la lista de ítems son propios de este spec.

Reglas:

- **TR-RN-012**: feriado GLOBAL solo del operador; el catálogo FERIADO es mixto en la práctica.
- **TR-RN-014**: resolución de `sabado_habil` de sucursal → empresa → tenant → valor por defecto.
- **TR-RN-001**: tenant en toda fila que no sea global.

RNF propios:

- **TR-RNF-027**: feriados propios sin cambios de código.
- **TR-RNF-002**: el cálculo y los listados tienen p95 < 1,5 s; el objetivo de este spec es p95 < 50 ms en el cálculo.

RNF heredados: 008, 010, 012, 013, 024, 025, 026, 101, 106, 119.

Historia del backlog: **D-04**, la parte de RF-029. Estimado: 5 h.

## Alcance

**In:**

- **Migración** `db/01f_cat_feriado.sql`, su inverso `db/rollback/01f_cat_feriado.sql` y la prueba `db/tests/01f_cat_feriado.test.sql`.
- **Semilla** de los feriados nacionales de Perú (ver Modelo de datos).
- **Dominio** en `libs/plataforma/catalogos/src/domain/feriados/`: `Feriado`, alcance, recurrencia, regla de duplicado y cálculo de días hábiles.
- **Casos de uso**:
  - `CrearFeriado`, `ActualizarFeriado` y `EliminarFeriado`, para globales del operador y para feriados del tenant y de sucursal;
  - `ListarFeriados`, por año y con los recurrentes proyectados;
  - `SumarDiasHabiles` y `EsDiaHabil`, detrás de `CalendarioPort`;
  - `ListarItemsAdministracion`.
- **Puertos**:
  - `CalendarioPort`, exportado para los productos;
  - `ParametrosCalendario`, implementado en `apps/api` con `ParametroPort`, porque `catalogos` no importa `parametros`.
- **HTTP**: 4 rutas de feriados bajo `/v1/feriados` y 1 de administración de ítems bajo `/v1/catalogos`.
- **Manifiesto PLAT**:
  - permiso `plat.feriado.gestionar`;
  - parámetro `plat.calendario.sabado_habil`.
- **Pruebas**:
  - dominio (Jest);
  - SQL (PGlite en local, PostgreSQL 16 en CI);
  - integración (CI);
  - HTTP con supertest.
- **Nube, dev (manual)**: migración, manifiesto y prueba de humo.

**Out of scope (para otros specs):**

- **UI de feriados y de la lista de ítems**: spec 19d. Usará `GET /v1/feriados?anio=` para una lista por año y `editable` para habilitar las acciones.
- **`contarDiasHabiles` y días hábiles hacia atrás (`n` negativo)**: el flujo del SRS solo define sumar.
- **Domingo hábil configurable**: el domingo es siempre no hábil.
- **Caché del calendario**: si la medición no alcanza, va en un spec aparte.
- **Horarios de atención o medios días.**
- **Feriados regionales con alcance por ubigeo**: se registran como feriado de sucursal.
- **Opciones de menú**: 19d.
- **Auditoría persistente**: spec 20. Este spec deja `feriado.actualizado` en el outbox.
- **Proyecto prod.**

## Base de código reutilizada

**Se conserva (como patrón):**

- `db/01f_cat.sql`:
  - rol `cat_editor`;
  - escritura de globales con funciones `SECURITY DEFINER`;
  - RLS `ENABLE + FORCE` con `NULLIF(current_setting('app.tenant_id', true), '')::uuid`;
  - `REVOKE` a `anon` y `authenticated`.
- `libs/plataforma/catalogos`:
  - `VERIFICADOR_OPERADOR`;
  - `ZONA_CATALOGOS` (`America/Lima`);
  - filtro de errores de `catalogos.http.ts`;
  - `mapeo.ts` y `event-schemas.ts`;
  - `CatalogosModule.register`.
- `apps/api/src/catalogos/verificador-operador.ts`: patrón de adaptador en la app para un puerto de la lib.
- `ParametroPort.valor(codigo, { sucursalId })` del spec 09.

**Cambia:**

- `CatalogosModule.register` recibe `parametrosCalendario`.
- `apps/api` agrega `apps/api/src/catalogos/parametros-calendario.ts`.
- `plat.manifiesto.json` sube a la versión siguiente libre:
  - `1.11.0` si el 19b ya está integrado;
  - si no, `1.10.0`, y el 19b toma `1.11.0`.

## Modelo de datos

### Migración `db/01f_cat_feriado.sql`

```sql
CREATE TABLE cat.feriado (
  id                uuid         PRIMARY KEY,
  alcance           varchar(8)   NOT NULL CHECK (alcance IN ('GLOBAL','TENANT','SUCURSAL')),
  tenant_id         uuid         NULL REFERENCES org.tenant (id),
  sucursal_id       uuid         NULL,
  fecha             date         NOT NULL,      -- con año; si es recurrente vale desde ese año
  nombre            varchar(100) NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 100),
  recurrente_anual  boolean      NOT NULL DEFAULT false,
  version           bigint       NOT NULL DEFAULT 0,
  creado_por        uuid         NULL REFERENCES seg.usuario (id),   -- NULL en la semilla
  creado_en         timestamptz  NOT NULL DEFAULT now(),
  modificado_por    uuid         NULL REFERENCES seg.usuario (id),
  modificado_en     timestamptz  NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, sucursal_id) REFERENCES org.sucursal (tenant_id, id),
  CONSTRAINT ck_feriado_alcance CHECK (
       (alcance = 'GLOBAL'   AND tenant_id IS NULL     AND sucursal_id IS NULL)
    OR (alcance = 'TENANT'   AND tenant_id IS NOT NULL AND sucursal_id IS NULL)
    OR (alcance = 'SUCURSAL' AND tenant_id IS NOT NULL AND sucursal_id IS NOT NULL))
);
CREATE INDEX ix_feriado_fecha ON cat.feriado (fecha);
CREATE INDEX ix_feriado_mes_dia ON cat.feriado ((extract(month FROM fecha)), (extract(day FROM fecha))) WHERE recurrente_anual;
CREATE INDEX ix_feriado_tenant ON cat.feriado (tenant_id, sucursal_id);
```

- `ix_feriado_mes_dia` usa `extract` y no `to_char(fecha, 'MM-DD')`: `to_char` no es IMMUTABLE y PostgreSQL no lo indexa (decidido al implementar el paso 1).
- La FK compuesta garantiza que la sucursal es del mismo tenant. Con `sucursal_id` NULL no se evalúa (`MATCH SIMPLE`).
- El duplicado (TR-CA-077) se valida en el dominio y se repite en la función `cat.feriado_choca`. No hay índice único: la regla cruza niveles y recurrencia.
- RLS `ENABLE + FORCE`:

  | Rol | Operación | Condición |
  | --- | --- | --- |
  | App | `SELECT` | `tenant_id IS NULL OR tenant_id = app.tenant_id` |
  | App | `INSERT`, `UPDATE`, `DELETE` | Solo `tenant_id = app.tenant_id` |
  | `cat_editor` | Todo | Para los globales |

- `REVOKE ALL` de la tabla y las funciones a `anon` y `authenticated` (regla 8).
- El inverso borra las funciones y la tabla.

### Funciones SQL (`search_path = ''`)

```sql
-- SECURITY INVOKER, STABLE. Fechas de feriado (sin repetir) que aplican al tenant del contexto
-- y a p_sucursal (NULL: solo globales y del tenant) entre p_desde y p_hasta, con recurrentes proyectados.
cat.fechas_feriado(p_desde date, p_hasta date, p_sucursal uuid) RETURNS SETOF date

-- SECURITY INVOKER, STABLE. true si (p_fecha, p_recurrente) choca en el mismo nivel o en uno más amplio
-- (ver Regla de duplicado). p_excluir: el id que se está editando.
cat.feriado_choca(p_alcance varchar, p_sucursal uuid, p_fecha date, p_recurrente boolean, p_excluir uuid)
  RETURNS boolean

-- SECURITY DEFINER (cat_editor). Escritura de globales; la app comprueba el operador antes.
cat.guardar_feriado_global(p_id uuid, p_version bigint /* NULL al crear */, p_fecha date, p_nombre varchar,
                           p_recurrente boolean, p_por uuid) RETURNS bigint      -- NULL si version no coincide
cat.eliminar_feriado_global(p_id uuid, p_version bigint) RETURNS boolean

-- SECURITY INVOKER, STABLE. Lista de administración de ítems (ver más abajo).
cat.items_administracion(p_codigo varchar, p_tenant uuid, p_fecha date, p_texto varchar, p_estado varchar,
                         p_origen varchar, p_limite int, p_desplazamiento int)
  RETURNS TABLE (item_id uuid, codigo varchar, codigo_externo varchar, nombre varchar, abreviatura varchar,
                 orden integer, atributos jsonb, vigente_desde date, vigente_hasta date, activo boolean,
                 propio boolean, estado varchar, ajuste_visible boolean, ajuste_orden integer,
                 ajuste_alias varchar, version bigint, ajuste_version bigint, total bigint)
```

- Proyección de un recurrente: vale en el año `A` si `A >= extract(year from fecha)`. Cae el día y mes de `fecha` del año `A`. Un 29 de febrero recurrente solo aplica en años bisiestos.
- `cat.items_administracion`:
  - combina globales y propios del tenant con el ajuste del tenant y el `estado` de `cat.items` (mismo orden de reglas);
  - `p_texto` busca en `codigo` o `nombre` con `ILIKE`; ignorar tildes no se pide;
  - `total` es `count(*) OVER ()`.
- SQL crudo justificado por la regla 11:
  - proyección de recurrentes y regla de duplicado entre niveles en una sola consulta;
  - escritura de globales con `SECURITY DEFINER`;
  - la lista de ítems reutiliza la lógica de estados de `cat.items`.
- Las escrituras de feriados del tenant y de sucursal van con TypeORM.

### Regla de duplicado (TR-CA-077)

Un feriado nuevo o editado choca si existe otro con la misma fecha efectiva **en el mismo nivel o en uno que lo cubre**:

| Nuevo | Se compara con |
| --- | --- |
| GLOBAL | GLOBAL |
| TENANT | GLOBAL y TENANT del mismo tenant |
| SUCURSAL | GLOBAL, TENANT del tenant y SUCURSAL de la misma sucursal |

"Misma fecha efectiva" depende de si los feriados son recurrentes:

| Caso | Hay choque si |
| --- | --- |
| Dos no recurrentes | Tienen la misma `fecha` |
| Un recurrente desde el año `A` y un no recurrente `D` | Tienen el mismo día y mes, y el año de `D` es `>= A` |
| Dos recurrentes | Tienen el mismo día y mes (sus años se solapan desde el mayor) |

- Un global nuevo no revisa los feriados de los tenants. En el cálculo, una fecha repetida cuenta una sola vez.
- Un feriado de tenant no revisa los de sus sucursales. Uno de sucursal que quede debajo de uno de tenant es redundante, pero válido.
- Mensaje del error: «La fecha ya está registrada como feriado».

### Semilla (feriados nacionales de Perú)

| Fecha | Nombre | Recurrente |
| --- | --- | --- |
| 2026-01-01 | Año Nuevo | sí |
| 2026-04-02 | Jueves Santo | no |
| 2026-04-03 | Viernes Santo | no |
| 2026-05-01 | Día del Trabajo | sí |
| 2026-06-07 | Batalla de Arica y Día de la Bandera | sí |
| 2026-06-29 | San Pedro y San Pablo | sí |
| 2026-07-23 | Día de la Fuerza Aérea | sí |
| 2026-07-28 | Fiestas Patrias | sí |
| 2026-07-29 | Fiestas Patrias | sí |
| 2026-08-06 | Batalla de Junín | sí |
| 2026-08-30 | Santa Rosa de Lima | sí |
| 2026-10-08 | Combate de Angamos | sí |
| 2026-11-01 | Todos los Santos | sí |
| 2026-12-08 | Inmaculada Concepción | sí |
| 2026-12-09 | Batalla de Ayacucho | sí |
| 2026-12-25 | Navidad | sí |
| 2027-03-25 | Jueves Santo | no |
| 2027-03-26 | Viernes Santo | no |

- Todos son GLOBAL. La lista coincide con la clave `feriados` de `3_plan.json` para 2026-12 a 2027-12.
- El operador agrega cada año los de Semana Santa siguientes desde la consola (19d).

### Dominio

```ts
// domain/feriados/tipos.ts
export type AlcanceFeriado = 'GLOBAL' | 'TENANT' | 'SUCURSAL';
export const DIAS_HABILES_MAXIMOS = 366;

// domain/feriados/feriado.ts (AggregateRoot con version)
export class Feriado extends AggregateRoot {
  static crear(datos: { id; alcance; tenantId: string | null; sucursalId: string | null; fecha: string;
                        nombre: string; recurrenteAnual: boolean; por; ahora }): Feriado;
  actualizar(datos: { fecha; nombre; recurrenteAnual; por; ahora }): boolean;   // alcance y sucursal no cambian
  fechaEnAnio(anio: number): string | null;                                      // null si no aplica ese año
}

// domain/feriados/calendario.ts (funciones puras)
export function sumarDiasHabiles(fecha: string, dias: number, feriados: ReadonlySet<string>, sabadoHabil: boolean): string;
export function esDiaHabil(fecha: string, feriados: ReadonlySet<string>, sabadoHabil: boolean): boolean;
```

- **Día hábil**: no es domingo, no es sábado salvo que `sabadoHabil` sea true, y no está en `feriados`.
- **`sumarDiasHabiles(fecha, n)`**:
  - no cuenta `fecha`: avanza día por día y cuenta solo los hábiles hasta llegar a `n`;
  - con `n = 0` devuelve `fecha` si es hábil y, si no, el siguiente hábil.
- **TR-CA-075**: desde el miércoles 2026-10-07, con `n = 3`, feriado el jueves 08 y sábado hábil, se cuentan el viernes 09, el sábado 10 y el lunes 12. Resultado: 2026-10-12.

Validaciones:

| Regla | Error |
| --- | --- |
| `nombre` de 3 a 100 | `FeriadoInvalidoError` «El nombre debe tener de 3 a 100 caracteres» |
| `fecha` válida `YYYY-MM-DD` | `FeriadoInvalidoError` «La fecha no es válida» |
| SUCURSAL sin `sucursal_id`, o TENANT o GLOBAL con él | `FeriadoInvalidoError` «La sucursal solo aplica a feriados de sucursal» |
| Cambiar `alcance` o `sucursal_id` al editar | `FeriadoInvalidoError` «El alcance de un feriado no se cambia» |
| Duplicado | `FeriadoDuplicadoError` (409 `FERIADO_DUPLICADO`) «La fecha ya está registrada como feriado» (TR-CA-077) |
| `n` fuera de 0 a 366 | `FeriadoInvalidoError` «Los días hábiles deben estar entre 0 y 366» |

Errores nuevos:

| Clase | `code` | HTTP | Mensaje |
| --- | --- | --- | --- |
| `FeriadoInvalidoError(mensaje)` | `FERIADO_INVALIDO` | 400 | El de la tabla anterior |
| `FeriadoDuplicadoError` | `FERIADO_DUPLICADO` | 409 | La fecha ya está registrada como feriado |
| `FeriadoNoEncontradoError` | `FERIADO_NO_ENCONTRADO` | 404 | El feriado no existe |
| `SucursalNoEncontradaError` | `SUCURSAL_NO_ENCONTRADA` | 404 | La sucursal no existe (violación de la FK compuesta) |

Se reutilizan `VersionObsoletaError` y `OperadorRequeridoError` del 19a.

### Puertos (`application/ports/`)

```ts
// Exportado en index.ts: lo usan los productos (TR-RNF-119).
export const CALENDARIO_PORT = Symbol('CalendarioPort');
export interface CalendarioPort {
  /** Tenant del TenantContext. Sin sucursal: la del contexto, si la hay; si no, solo globales y del tenant. */
  sumarDiasHabiles(fecha: string, dias: number, sucursalId?: string): Promise<string>;
  esDiaHabil(fecha: string, sucursalId?: string): Promise<boolean>;
}

// Exportado: apps/api lo implementa con ParametroPort('plat.calendario.sabado_habil', { sucursalId }).
export const PARAMETROS_CALENDARIO = Symbol('ParametrosCalendario');
export interface ParametrosCalendario { sabadoHabil(sucursalId: string | null): Promise<boolean> }

RepositorioFeriados  { buscar(id): Feriado | null; choca(feriado, excluirId | null): boolean;
                       guardarDelTenant(feriado, versionAnterior | null): boolean; eliminarDelTenant(id, version): boolean;
                       guardarGlobal(feriado, versionAnterior | null): boolean; eliminarGlobal(id, version): boolean;
                       delAnio(anio, sucursalId | null): Feriado[] }
LecturaCalendario    { fechasFeriado(desde, hasta, sucursalId | null): string[] }
LecturaItemsAdministracion { listar(filtro): { filas: FilaAdministracion[]; total: number } }
```

- **Rango que lee `SumarDiasHabiles`**: de `fecha` a `fecha + n × 3 + 30` días, en una sola consulta. Si el cálculo se sale del rango, lee el tramo siguiente; solo pasa con decenas de feriados seguidos.
- **`CalendarioPort`**:
  - no evalúa permiso, igual que `CatalogoPort`;
  - abre `uow.run` y reutiliza la transacción activa;
  - el parámetro `sabado_habil` se resuelve con la misma sucursal que se pasa al cálculo (TR-RN-014).
- **Sucursal de otro tenant pasada al puerto**: la RLS no devuelve sus feriados de sucursal. Se calcula solo con los globales y los del tenant.

### Casos de uso: puntos no obvios

**`CrearFeriado`, `ActualizarFeriado` y `EliminarFeriado`:**

1. Con alcance GLOBAL, se llama a `VerificadorOperador.exigir`; fuera del operador da 403 `OPERADOR_REQUERIDO`. Se escribe con la función `DEFINER`.
2. Con alcance TENANT o SUCURSAL, `tenant_id` sale del contexto y nunca del cuerpo. Un id global o de otro tenant da 404 `FERIADO_NO_ENCONTRADO`. Un no operador no puede editar ni borrar un global: también da 404.
3. Se aplica la regla de duplicado con `choca` antes de escribir, en la misma transacción.
4. `version` distinta de la guardada da 409 `VERSION_OBSOLETA`. Sin cambios responde 200 con `cambiado: false`, sin escribir ni publicar.
5. `feriado.actualizado` va al outbox en la misma transacción.

**`ListarFeriados`** (`anio`, `sucursal_id` opcional):

- Devuelve los globales, los del tenant y los de sus sucursales (o solo los de `sucursal_id`) que aplican en `anio`.
- Cada uno lleva `fecha_en_anio`, y la lista va ordenada por esa fecha.
- `editable` es false en los globales si el actor no es del operador. Lo resuelve `VerificadorOperador` una vez por petición.

**`ListarItemsAdministracion`**:

- Llama a `cat.items_administracion` con el tenant del contexto y la fecha de hoy en `America/Lima`.
- Catálogo inexistente: 404 `CATALOGO_NO_EXISTE`.

### Eventos (outbox, `schema_version = 1`)

| `event_type` | `aggregate_type` | Payload |
| --- | --- | --- |
| `feriado.actualizado` | `feriado` | `feriado_id`, `accion` (`CREADO`, `MODIFICADO` o `ELIMINADO`), `alcance`, `tenant_id` (NULL si es global), `sucursal_id`, `fecha`, `nombre`, `recurrente_anual`, `version`, `por` |

Sin datos personales. El evento de un global se escribe con el tenant del operador.

### Permiso y parámetro (manifiesto PLAT)

| Código | `alcance_minimo` | `sensible` | Roles |
| --- | --- | --- | --- |
| `plat.feriado.gestionar` | `TENANT` | no | `PLAT_PROPIETARIO`, `PLAT_ADMIN_CONFIGURACION` |

```json
{ "codigo": "plat.calendario.sabado_habil", "descripcion": "El sábado cuenta como día hábil",
  "tipo": "BOOLEANO", "valor_defecto": true, "alcance_maximo": "SUCURSAL" }
```

Sin opciones de menú: llegan con el 19d.

### HTTP

Todas las rutas:

- llevan `@ApiBearerAuth()` y `X-Sucursal-Id`;
- validan con zod (400 `SOLICITUD_INVALIDA`);
- responden errores `{ codigo, mensaje }`;
- usan `snake_case`.

| Método y ruta | Permiso | Entrada | Éxito |
| --- | --- | --- | --- |
| `GET /v1/feriados` | `feriado.gestionar` | `anio` (2000-2100), `sucursal_id?` | 200 `[{ id, alcance, sucursal_id, fecha, fecha_en_anio, nombre, recurrente_anual, version, editable }]` |
| `POST /v1/feriados` | `feriado.gestionar` | `{ alcance, sucursal_id?, fecha, nombre, recurrente_anual }` | 201 el feriado |
| `PUT /v1/feriados/{id}` | `feriado.gestionar` | `{ fecha, nombre, recurrente_anual, version }` | 200 `{ ..., version, cambiado }` |
| `DELETE /v1/feriados/{id}` | `feriado.gestionar` | query `version` | 204 |
| `GET /v1/catalogos/{codigo}/items/administracion` | `catalogo.leer` | `texto?` (≤ 60), `estado?` (`VISIBLE`, `INACTIVO`, `FUERA_DE_VIGENCIA`, `OCULTO`), `origen?` (`GLOBAL`, `PROPIO`), `pagina` (≥ 1), `tamano` (1-100, 25 por defecto) | 200 `{ items: [...], total, pagina, tamano }` con los campos de `cat.items_administracion` y `ajuste` como objeto o null |

- La ruta de administración de ítems se declara antes de las rutas con `{id}` del controlador del 19a.
- Un id que no es UUID da 404.

### Configuración

Sin variables nuevas. `CatalogosModule.register({ ..., parametrosCalendario })`. El adaptador está en `apps/api/src/catalogos/parametros-calendario.ts`.

## Plan de implementación

1. **Migración y semilla.**
   - Crear `db/01f_cat_feriado.sql`, su inverso y `db/tests/01f_cat_feriado.test.sql` con `cat_test_app`.
   - Casos:
     - `ck_feriado_alcance`, con sus tres combinaciones válidas y una inválida;
     - FK compuesta: una sucursal de otro tenant falla;
     - `cat.fechas_feriado`:
       - proyecta recurrentes desde su año y no antes;
       - el 29 de febrero solo aparece en años bisiestos;
       - incluye globales, del tenant y de la sucursal pedida;
       - no incluye los de otra sucursal ni los de otro tenant;
     - `cat.feriado_choca`, con cada fila de las dos tablas de la regla de duplicado;
     - `cat.guardar_feriado_global` con versión obsoleta da NULL;
     - `cat.items_administracion`: filtros, `total`, estados y ajuste del tenant;
     - RLS entre dos tenants;
     - la semilla carga 18 filas.
   - Verificar: `db:up`, `db:down` y `db:up`, y la prueba SQL en PGlite y en CI.
2. **Dominio.**
   - Crear `tipos.ts`, `feriado.ts`, `calendario.ts` y los errores.
   - Pruebas:
     - TR-CA-075 da 2026-10-12;
     - con sábado no hábil, el mismo caso da 2026-10-13;
     - `n = 0` en un día hábil y en un domingo;
     - un tramo con varios feriados seguidos;
     - `fechaEnAnio` con recurrente, no recurrente y 29 de febrero;
     - cada fila de la tabla de validaciones;
     - actualizar sin cambios no emite evento.
   - Verificar: `pnpm nx test catalogos` y cobertura de `src/domain/**` ≥ 70 %.
3. **Casos de uso y repositorios.**
   - Crear `CrearFeriado`, `ActualizarFeriado`, `EliminarFeriado`, `ListarFeriados`, `RepositorioFeriados` (TypeORM más funciones `DEFINER`) y el esquema del evento.
   - Pruebas:
     - un feriado de la sucursal «Cusco» solo afecta el cálculo de esa sucursal (TR-CA-076);
     - registrar el 2026-10-08 en un tenant da 409 «La fecha ya está registrada como feriado», porque ya existe como global recurrente (TR-CA-077);
     - un global desde fuera del operador da 403;
     - editar un global desde un tenant da 404;
     - la lista de 2027 trae Fiestas Patrias con `fecha_en_anio = 2027-07-28` y `editable: false` para un tenant;
     - `feriado.actualizado` queda en el outbox en la misma transacción.
   - Verificar: `pnpm nx test catalogos` (integración en CI).
4. **`CalendarioPort` y parámetro.**
   - Crear `SumarDiasHabiles`, `EsDiaHabil`, `LecturaCalendario`, el puerto `ParametrosCalendario` y el adaptador de `apps/api`, y declarar el parámetro en el manifiesto.
   - Pruebas:
     - TR-CA-075 con la semilla da 2026-10-12;
     - `sabado_habil = false` fijado en la sucursal cambia el resultado solo para esa sucursal;
     - sin sucursal usa la del contexto;
     - p95 < 50 ms en 200 cálculos de `n = 30` (medición registrada en el cierre).
   - Verificar: `pnpm nx test catalogos`.
5. **Lista de administración de ítems.**
   - Crear `ListarItemsAdministracion` y `LecturaItemsAdministracion`.
   - Pruebas:
     - MEDIO_PAGO para un tenant con «Plin» oculto y un propio trae los dos con su `estado` y su `ajuste`;
     - `origen=PROPIO` filtra;
     - `texto` busca por código y nombre;
     - `tamano` 101 da 400;
     - catálogo inexistente da 404.
   - Verificar: `pnpm nx test catalogos`.
6. **HTTP y manifiesto.**
   - Agregar las 5 rutas al controlador.
   - Agregar `plat.feriado.gestionar` y `plat.calendario.sabado_habil` al manifiesto con la versión siguiente libre.
   - Pruebas supertest:
     - cada fila de la tabla HTTP;
     - sin el permiso da 403;
     - aplicar el manifiesto dos veces da 0 cambios.
   - Verificar: `pnpm nx run-many -t lint test build` con código 0 y las rutas en `/v1/docs`.
7. **Nube, dev (manual).**
   - Aplicar con `pnpm db:up:remoto` y `pnpm manifiesto:aplicar:remoto`.
   - Revisar con el MCP que `cat.feriado` no está expuesta en la Data API y que `get_advisors` no trae alertas nuevas.
   - Prueba de humo con la API local contra dev:
     - listar 2026;
     - crear un feriado de sucursal de prueba;
     - calcular TR-CA-075 desde un script con `CalendarioPort`;
     - borrar los datos de prueba.
   - Dejar la evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Feriados (TR-RF-029):**

- [ ] `sumarDiasHabiles('2026-10-07', 3)` con la semilla y `sabado_habil` por defecto devuelve `2026-10-12` (TR-CA-075).
- [ ] Un feriado de la sucursal «Cusco» cambia el cálculo para «Cusco» y no para otra sucursal del mismo tenant (TR-CA-076).
- [ ] Registrar como feriado del tenant una fecha que ya es feriado global, o una repetida en el mismo nivel, responde 409 «La fecha ya está registrada como feriado» (TR-CA-077).
- [ ] Un feriado recurrente de 2026 aplica en 2027 y no en 2025.
- [ ] El domingo nunca es hábil. El sábado es hábil según `plat.calendario.sabado_habil` resuelto por sucursal → empresa → tenant → defecto (`true`).
- [ ] `esDiaHabil('2026-07-28')` es false y `esDiaHabil('2026-07-27')` es true.
- [ ] `n` fuera de 0 a 366 lanza `FeriadoInvalidoError`.

**Administración:**

- [ ] Un actor fuera del tenant operador recibe 403 `OPERADOR_REQUERIDO` al crear un feriado GLOBAL, y 404 al editar o borrar uno.
- [ ] `GET /v1/feriados?anio=2027` trae los recurrentes de la semilla proyectados a 2027, ordenados por fecha y con `editable: false` en los globales para un tenant.
- [ ] Un `PUT` con `version` obsoleta responde 409 `VERSION_OBSOLETA`. Uno sin cambios responde `cambiado: false` y no genera evento.
- [ ] Cada escritura deja `feriado.actualizado` en el outbox en la misma transacción.

**Lista de administración de ítems:**

- [ ] `GET /v1/catalogos/MEDIO_PAGO/items/administracion` para un tenant con «Plin» oculto devuelve «Plin» con `estado: OCULTO` y su `ajuste`, y los propios con `propio: true`.
- [ ] Los filtros `texto`, `estado` y `origen` y la paginación devuelven el `total` correcto.
- [ ] Un catálogo inexistente responde 404 `CATALOGO_NO_EXISTE`.

**Aislamiento, migraciones y calidad:**

- [ ] Desde el tenant A, con `cat_test_app`, no se lee ni se escribe un feriado de B, y no se inserta ni modifica uno con `tenant_id` NULL.
- [ ] Una sucursal de otro tenant en `POST /v1/feriados` responde 404 `SUCURSAL_NO_ENCONTRADA`.
- [ ] `db:up && db:down && db:up` termina con 0 en CI.
- [ ] `src/domain` no importa `@nestjs/*` ni `typeorm`. `catalogos` no importa `parametros` ni `org` (Nx en CI).
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] El p95 de `sumarDiasHabiles` con `n = 30` es menor de 50 ms en integración (medición registrada).
- [ ] Las 5 rutas figuran en `/v1/docs` con sus códigos de error.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, con evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev está aplicada `01f_cat_feriado.sql`, y la versión nueva del manifiesto PLAT figura en `seg.manifiesto_aplicado` con el permiso y el parámetro.
- [ ] En dev, `cat.feriado` no está expuesta y `get_advisors` no trae alertas nuevas de RLS.
- [ ] En dev, la prueba de humo da 2026-10-12 para TR-CA-075 y los datos de prueba se borran.
- [ ] Las horas reales de D-04 (parte de RF-029) quedan registradas en el plan.

## Decisiones

- **Sí:** tabla propia `cat.feriado`, sin catálogo FERIADO de ítems. La decidió el usuario en el 19b: los ítems no soportan alcance por sucursal ni la regla de duplicado.
- **Sí:** los feriados GLOBAL solo los escribe el operador, con funciones `SECURITY DEFINER`. Mismo patrón que los ítems globales del 19a.
- **Sí:** la semilla trae los feriados nacionales de Perú 2026-2027: los fijos como recurrentes y Semana Santa por año. La decidió el usuario en el 19b. Incluye el 08/10 que usa TR-CA-075.
- **Sí:** el duplicado se revisa en el mismo nivel o en uno más amplio. Lo decidió el usuario en el 19b. Un global nuevo no revisa los de los tenants.
- **Sí:** los recurrentes cuentan día y mes desde su año. Lo decidió el usuario. Un recurrente nuevo no altera cálculos de años anteriores.
- **No:** recurrente en cualquier año. Cambiaría resultados pasados.
- **Sí:** `sumarDiasHabiles` no cuenta el día de inicio y el sábado es hábil por defecto. Lo decidió el usuario en el 19b. Así TR-CA-075 pasa sin configurar nada.
- **Sí:** `plat.calendario.sabado_habil` con `alcance_maximo` SUCURSAL. Lo decidió el usuario en el 19b. Una sede puede abrir los sábados y otra no.
- **Sí:** el domingo es siempre no hábil. Lo decidió el usuario. El SRS solo nombra el parámetro del sábado.
- **Sí:** `CalendarioPort` expone `sumarDiasHabiles` y `esDiaHabil`. Lo decidió el usuario.
- **No:** `contarDiasHabiles`. El flujo del SRS no lo define.
- **Sí:** `n` entre 0 y 366; `n = 0` devuelve la misma fecha o la siguiente hábil. Los plazos negativos no tienen caso de uso.
- **Sí:** puerto `ParametrosCalendario` implementado en `apps/api`. `catalogos` no puede importar `parametros` (TR-RNF-119), igual que `VerificadorOperador`.
- **Sí:** sin caché en el calendario, con una consulta por cálculo sobre el rango. Lo decidió el usuario. Son pocas filas con índice; se mide.
- **No:** caché Redis por tenant y año. Suma versión, invalidación y respaldo sin una medición que lo pida.
- **Sí:** `plat.feriado.gestionar` no sensible y con `alcance_minimo` TENANT. Lo decidieron el usuario en el 19b (sensibilidad) y en este spec (alcance). Lo usan los administradores del tenant para el tenant y sus sucursales.
- **No:** un administrador de sucursal que gestione los feriados de su sede. Exigiría validar `X-Sucursal-Id` contra `sucursal_id`.
- **Sí:** `PUT` con versión y `DELETE` físico. Lo decidió el usuario. Nada referencia un feriado; el evento deja la traza para el spec 20.
- **Sí:** la lista de feriados es por año, con los recurrentes proyectados y sin paginar. La decidió el usuario. Son menos de 50 filas por año y la UI no recalcula fechas.
- **Sí:** la lista de administración de ítems va en una ruta paginada con filtros y `plat.catalogo.leer`. La decidió el usuario en el 19b y en este spec. Sirve igual al operador (sin ajustes propios) y al tenant.
- **No:** dos rutas de lista, una global y otra propia. Duplica la consulta.
- **Sí:** FK compuesta `(tenant_id, sucursal_id)` hacia `org.sucursal`. La base garantiza que la sucursal es del tenant, sin trigger.
- **Sí:** la migración se llama `01f_cat_feriado.sql` y es independiente de `01f_cat_importacion.sql`. 19b y 19c se pueden aplicar en cualquier orden.
- **Sí:** el manifiesto toma la versión siguiente libre al implementar. 19b y 19c corren en paralelo.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El runner de migraciones rechaza aplicar `01f_cat_feriado.sql` después de `01f_cat_importacion.sql` (orden alfabético inverso) | Se revisa en el paso 1. Si el runner exige orden, se renombra a un nombre que quede después del último aplicado y se anota. |
| Una consulta por cálculo no cumple p95 < 50 ms | Índices por fecha y por día y mes; medición en el paso 4. Si falla, la caché va en un spec aparte. |
| Falta cargar Semana Santa de 2028 en adelante | El cálculo sigue sin ese feriado. Se anota en `docs/ops/supabase-ambientes.md` como tarea anual del operador. |
| Un producto pasa una sucursal de otro tenant al puerto | La RLS no devuelve sus feriados y se calcula solo con globales y del tenant. `sabado_habil` resuelve con `ParametroPort`, que también aísla por tenant. |
| Carrera entre dos altas del mismo feriado | Ventana mínima. El duplicado solo genera un feriado redundante y el cálculo cuenta la fecha una vez. |

## Lo que **no** está en este spec

- UI de feriados y de la lista de ítems (spec 19d).
- `contarDiasHabiles` y plazos hacia atrás.
- Domingo hábil configurable.
- Caché del calendario.
- Horarios o medios días.
- Feriados por ubigeo.
- Opciones de menú (19d).
- Auditoría TR-AUD (spec 20).
- Prod (plan de migración a producción).

Cada uno entra en su propio spec cuando su sprint lo pida.
