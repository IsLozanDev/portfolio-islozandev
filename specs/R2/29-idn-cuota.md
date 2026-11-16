# SPEC 29 — Identidad: cuota mensual de consultas por tenant, aviso al umbral y administración de proveedores

> **Status:** Aprobado
> **Depends on:** SPEC 09, SPEC 11, SPEC 12, SPEC 17a, SPEC 28
> **Date:** 2026-11-16
> **Objective:** Reemplazar `CuotaNula` por una cuota mensual por tenant en `idn.cuota`, reservada de forma atómica antes de cada llamada al proveedor, que responde 429 `CUOTA_AGOTADA` al llegar al 100 %, publica por outbox el aviso al umbral y el de agotada, se abre cada mes desde el worker y se consulta y ajusta por HTTP junto con la configuración de proveedores.

## Por qué existe este spec

Fila 29 de `docs/roadmap-specs.md` (R2-02, TR-RF-047, back). Contexto: `docs/spec-context/tr-idn/idn-cuota-y-consola-proveedor.md`, partición A. La UI (consola de proveedores y cuotas, tarjeta de consumo en `admin-cliente`, opción de menú) es el spec 30.

El roadmap estima 6 h. Con las decisiones tomadas (endpoints de proveedores aquí, dos eventos de aviso, tarea mensual) queda en 8-9 h. Se mantiene en un spec: las tres áreas son (a) cuota y reserva, (b) tarea mensual y avisos, (c) HTTP.

Lo que hay en el código hoy (revisado al redactar):

- `identidad/application/ports/cuota.port.ts`: `CuotaPort { reservar(tenantId): Promise<boolean>; liberar(tenantId): Promise<void> }`. `CuotaNula` siempre reserva.
- `ConsultarDocumento.prepararConsulta` llama a `cuota.reservar` dentro de su `UnitOfWork.run`, después de la caché. Con `false` escribe bitácora `CUOTA_AGOTADA` y lanza `ProveedorNoDisponibleError` (503, nota de implementación del 28). `cerrarConsulta` llama a `liberar` si todos los proveedores fallan.
- `IdentidadModule.register` arma `ConsultarDocumento` con `new CuotaNula()`. `ConfiguracionProveedoresTypeOrm` lee `idn.proveedor` en cada consulta (sin caché).
- `idn.proveedor` (`db/01j_idn.sql`): `codigo, tipos_doc, prioridad, ttl_dias, timeout_ms, activo`, sin `version`, solo lectura para la API.
- `eslint.config.mjs`: `comp('idn', 'kernel', 'seg')`. IDN no importa `cfg` ni `org`: los parámetros y el plan llegan por puertos con adaptador en las apps (patrón de `DiasGraciaParametros` en `apps/worker`).
- `kernel`: `EventPublisher` (outbox), `TenantContext`, `Clock`, `UnitOfWork`. Eventos con nombre `<agregado>.<hecho>` (`catalogo.actualizado`, `parametro.cambiado`) y esquemas Ajv por lib (`registrarEsquemasCfg`).
- `org`: `PLANES = ['BASICO','PRO','EMPRESA']`, estados `PRUEBA | ACTIVA | VENCIDA | CANCELADA`; sin campo de consultas incluidas ni de ciclo de cobro. `org.tenants_listar` (SECURITY DEFINER) lista tenants por estado.
- `apps/api`: `ExigirOperador` / `OperadorRequeridoError` (`OPERADOR_REQUERIDO`), `VerificadorOperadorOrg`.
- `apps/worker/src/vencimientos/tarea-vencimientos.ts` y `cli/ejecutar-vencimientos.ts`: patrón de tarea BullMQ con `upsertJobScheduler` y zona Lima, más CLI.
- `plat.manifiesto.json` 1.17.0. Los parámetros se declaran en su lista `parametros`.

## Alcance

**Entra:**

- Tabla `idn.cuota` (un periodo `AAAA-MM` por tenant) con RLS y funciones de lectura de consola.
- `ControlCuota`: implementación real de `CuotaPort` con reserva atómica, creación al vuelo del periodo, liberación y avisos.
- Error `CuotaAgotadaError` → 429 `CUOTA_AGOTADA` en la consulta (reemplaza el 503 del 28 para este caso).
- Eventos por outbox: `cuota.umbral_alcanzado`, `cuota.agotada` (una vez cada uno por periodo), `cuota.ajustada` y `proveedor_identidad.actualizado`.
- Parámetros `plat.identidad.cuota_incluidas` (JSON por plan, solo valor por defecto) y `plat.identidad.cuota_umbral_aviso` (NUMERO, 80).
- Tarea mensual en el worker (día 1, 00:05 Lima) y CLI `cuotas:abrir`.
- HTTP: cuota propia, lista y detalle de cuotas de todos los tenants, ajuste de incluidas del periodo, lista y edición de proveedores.
- Permisos `plat.identidad.cuota`, `plat.identidad.cuota_gestionar`, `plat.identidad.proveedor`.

**No entra (specs futuros):**

- UI: consola de proveedores y cuotas, tarjeta de consumo en `admin-cliente`, opción de menú `plat.consola.identidad` → spec 30.
- Correo o notificación del aviso: TR-NOT (R2-09/R2-10) consumirá los eventos.
- Ciclo de cobro mensual o anual con descuento: es precio, no cuota. Va al spec 118 (`org-facturacion-suscripcion`). Un plan anual también recibe su cuota cada mes.
- Modo degradado al 100 % (seguir consultando y facturar excedente) y cobro por excedente.
- Cuotas de IA y mensajería (resto de TR-RNF-128).
- Estado del circuit breaker (abierto/cerrado, último error) en la consola.
- Alta y baja de proveedores, y sus credenciales (siguen en entorno, regla 9).
- Bitácora de consultas como pantalla o endpoint de detalle por consulta.
- Override de las incluidas para meses futuros: el ajuste vale solo para el periodo indicado.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `CuotaPort` | Se conserva la firma. `ControlCuota` la implementa; `CuotaNula` queda solo para pruebas. |
| `ConsultarDocumento` | Solo cambia la rama de cuota agotada: lanza `CuotaAgotadaError` en vez de `ProveedorNoDisponibleError`. Reserva y liberación siguen en las mismas transacciones. |
| `idn.proveedor` | Se agrega `version` y permiso de `UPDATE` a la API. |
| `ExigirOperador`, `VerificadorOperadorOrg` | Se reutilizan para `OPERADOR_REQUERIDO`. |
| `tarea-vencimientos.ts`, `ejecutar-vencimientos.ts` | Patrón de la tarea y la CLI nuevas. |
| `org.tenants_listar` | Fuente de tenants activos para la tarea mensual. |
| `01a_org_consola.sql` | Patrón de función `SECURITY DEFINER` con dueño lector, `REVOKE` a `PUBLIC`, `anon` y `authenticated`. |

## Modelo de datos

### Migración `db/01k_idn_cuota.sql` (+ `db/rollback/01k_idn_cuota.sql`, `db/tests/01k_idn_cuota.test.sql`)

```sql
CREATE TABLE idn.cuota (
  tenant_id           uuid NOT NULL,
  periodo             char(7) NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  plan                varchar(10) NOT NULL CHECK (plan IN ('BASICO','PRO','EMPRESA')),
  incluidas           integer NOT NULL CHECK (incluidas >= 0),
  consumidas          integer NOT NULL DEFAULT 0 CHECK (consumidas >= 0),
  avisado_umbral_en   timestamptz,
  avisado_agotada_en  timestamptz,
  creada_en           timestamptz NOT NULL DEFAULT now(),
  version             integer NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, periodo),
  CONSTRAINT ck_cuota_tope CHECK (consumidas <= incluidas)
);

ALTER TABLE idn.proveedor ADD COLUMN version integer NOT NULL DEFAULT 1;
```

- `idn.cuota`: RLS con `tenant_id = current_setting('app.tenant_id')::uuid`; `SELECT, INSERT, UPDATE` al rol de la API; sin `DELETE`.
- `idn.proveedor`: se agrega `UPDATE` (columnas `prioridad, ttl_dias, timeout_ms, activo, version`) al rol de la API. Sin `INSERT`/`DELETE`.
- Funciones de consola, `SECURITY DEFINER`, `STABLE`, dueño lector (patrón de `01a_org_consola.sql`), sin acceso de `PUBLIC`, `anon` ni `authenticated`:
  - `idn.cuotas_del_periodo(p_periodo char(7), p_q varchar, p_limite int, p_desplazamiento int)` → `tenant_id, tenant_nombre, plan, incluidas, consumidas, avisado_umbral_en, avisado_agotada_en, version, total` (join con `org.tenant`, filtro por nombre o código, orden por porcentaje de consumo descendente).
  - `idn.cuota_detalle(p_tenant uuid, p_periodo char(7))` → la fila de la cuota más los contadores del periodo en `idn.consulta_log` por `resultado` (`CACHE`, `PROVEEDOR`, `NO_ENCONTRADO`, `INVALIDO`, `CUOTA_AGOTADA`, `PROVEEDOR_NO_DISPONIBLE`), con el periodo en hora de Lima.
- Inverso: `DROP FUNCTION` de ambas, `DROP TABLE idn.cuota`, `ALTER TABLE idn.proveedor DROP COLUMN version` y el `REVOKE UPDATE`.

### Dominio (`libs/plataforma/identidad/src/domain/`)

- `periodo.ts`: `Periodo` (`AAAA-MM`), `periodoDe(instante: Date)` en `America/Lima` con `Intl`, `esPeriodoValido(texto)`, `compararPeriodos`. Constante `ZONA_CUOTA = 'America/Lima'`.
- `plan-cuota.ts`: `PLANES_CUOTA = ['BASICO','PRO','EMPRESA']` (mismo orden que ORG, de menor a mayor), `planMasAlto(planes): PlanCuota` (sin planes → `BASICO`), `incluidasDe(plan, tabla: IncluidasPorPlan)`.
- `aviso-cuota.ts`: `avisosPendientes(estado: EstadoCuota, umbralPorcentaje): AvisoCuota[]` → `UMBRAL` si `consumidas * 100 >= incluidas * umbral` y no avisado; `AGOTADA` si `consumidas >= incluidas` y no avisada. Con `incluidas = 0` solo `AGOTADA`.
- `ajuste-cuota.ts`: `validarAjuste({ incluidasNuevas, consumidas, periodo, periodoActual })` → `IncluidasMenorQueConsumidasError` si baja de `consumidas`; `PeriodoCerradoError` si el periodo es anterior al actual.
- `proveedor-editable.ts`: `CambiosProveedor { prioridad?, ttlDias?, timeoutMs?, activo? }` con rangos (prioridad > 0, ttl 1-365, timeout 100-10 000) y `UltimoProveedorActivoError` si desactivar deja algún tipo de documento sin proveedor activo.
- `eventos-idn.ts`:

```ts
export const EVENTOS_IDN = {
  cuotaUmbralAlcanzado: 'cuota.umbral_alcanzado',
  cuotaAgotada: 'cuota.agotada',
  cuotaAjustada: 'cuota.ajustada',
  proveedorActualizado: 'proveedor_identidad.actualizado',
} as const;
```

| Evento | Payload (schema_version 1) |
| --- | --- |
| `cuota.umbral_alcanzado` | `tenant_id, periodo, incluidas, consumidas, porcentaje, umbral` |
| `cuota.agotada` | `tenant_id, periodo, incluidas, consumidas` |
| `cuota.ajustada` | `tenant_id, periodo, incluidas_anteriores, incluidas, actor_id` |
| `proveedor_identidad.actualizado` | `codigo, prioridad, ttl_dias, timeout_ms, activo, actor_id` |

- `errores.ts` suma: `CuotaAgotadaError`, `IncluidasMenorQueConsumidasError` y `PeriodoCerradoError` (ValidationError), `UltimoProveedorActivoError` (ValidationError), `CuotaNoEncontradaError` y `ProveedorNoEncontradoError` (NotFoundError).
- `permisos-idn.ts` suma `cuota: 'plat.identidad.cuota'`, `cuotaGestionar: 'plat.identidad.cuota_gestionar'`, `proveedor: 'plat.identidad.proveedor'`.

### Puertos (`application/ports/`)

```ts
interface RepositorioCuotas {
  crearSiFalta(cuota: CuotaNueva): Promise<void>;                       // INSERT ... ON CONFLICT DO NOTHING
  reservarUnidad(tenantId, periodo): Promise<EstadoCuota | 'SIN_CUOTA' | 'AGOTADA'>;
  liberarUnidad(tenantId, periodo): Promise<void>;
  marcarAviso(tenantId, periodo, aviso: AvisoCuota, en: Date): Promise<boolean>;  // false si ya estaba marcado
  buscar(tenantId, periodo): Promise<EstadoCuota | null>;
  guardarIncluidas(tenantId, periodo, incluidas, versionEsperada): Promise<void>;  // bloqueo optimista
}
interface LecturaCuotasConsola {                                        // funciones SECURITY DEFINER
  delPeriodo(filtro): Promise<Pagina<FilaCuotaConsola>>;
  detalle(tenantId, periodo): Promise<DetalleCuota | null>;
}
interface PlanDelTenant { planVigente(): Promise<PlanCuota> }                 // tenant del contexto
interface ConfiguracionCuota {
  incluidasPorPlan(): Promise<IncluidasPorPlan>;
  umbralAvisoPorcentaje(): Promise<number>;
}
interface TenantsActivos { listar(): AsyncIterable<string> }             // solo la tarea mensual
interface RepositorioProveedores { listar(); buscar(codigo); guardar(proveedor, versionEsperada) }
interface VerificadorOperador { exigir(): Promise<void> }                 // OPERADOR_REQUERIDO
```

`EstadoCuota { tenantId, periodo, plan, incluidas, consumidas, avisadoUmbralEn, avisadoAgotadaEn, version }`.

### Casos de uso (`application/`)

- `control-cuota.ts` — `ControlCuota implements CuotaPort`. Corre dentro de la transacción de quien lo llama (`ConsultarDocumento`), así la reserva, la bitácora y los eventos van juntos al outbox.
  - `reservar(tenantId)`: `periodo = periodoDe(reloj.now())`. `reservarUnidad`; si `SIN_CUOTA` → `abrirPeriodo` y reintenta una vez; si `AGOTADA` → `false`. Con la reserva hecha, `avisosPendientes(estado, umbral)` y por cada uno `marcarAviso` (solo publica si devolvió `true`, así dos reservas concurrentes no duplican el evento). Devuelve `true`.
  - `liberar(tenantId)`: `liberarUnidad` del periodo actual (no baja de 0). No revierte avisos ya enviados.
  - `abrirPeriodo(tenantId, periodo)`: `planDelTenant.planVigente()`, `incluidasDe(plan, configuracion.incluidasPorPlan())`, `crearSiFalta`.
- `abrir-periodo-cuotas.ts` — `AbrirPeriodoCuotas.ejecutar(periodo)`: recorre `TenantsActivos` y, para cada uno, `TenantContext.run(tenantId)` + `UnitOfWork.run` + `abrirPeriodo`. Idempotente; un fallo en un tenant se registra y sigue con el siguiente. Devuelve `{ creadas, existentes, fallidas }`.
- `consultar-cuota-actual.ts` — cuota del tenant del contexto en el periodo actual. Si no hay fila, responde la que tendría (`consumidas = 0`, plan e incluidas calculados) **sin crearla**: un GET no escribe.
- `listar-cuotas.ts` y `detalle-cuota.ts` — operador; por `LecturaCuotasConsola`.
- `ajustar-cuota.ts` — operador. Corre en `TenantContext.run(tenantObjetivo)` (como `ProcesarVencimientosTenant`) para que la RLS y el outbox queden en el tenant de la cuota; el actor sigue siendo el operador. Si el periodo es el actual o futuro y no hay fila, la crea con las incluidas pedidas. `validarAjuste`, `guardarIncluidas` con `version`, evento `cuota.ajustada`.
- `listar-proveedores.ts` y `actualizar-proveedor.ts` — operador. `actualizar` aplica `CambiosProveedor`, verifica `UltimoProveedorActivoError` contra los demás, guarda con `version` y publica `proveedor_identidad.actualizado`. Como `ConfiguracionProveedoresTypeOrm` lee la tabla en cada consulta, el cambio de prioridad aplica a la consulta siguiente.

`ConsultarDocumento`: la rama `CUOTA_AGOTADA` lanza `CuotaAgotadaError` (bitácora `CUOTA_AGOTADA` como hoy). Una consulta resuelta por caché no llama a `reservar` (TR-RN-031, TR-CA-122). Un documento inválido tampoco.

### Infraestructura (`infrastructure/`)

- `typeorm/cuota.repositorio.ts`: `RepositorioCuotasTypeOrm` sobre el `EntityManager` de la transacción activa. `CuotaEntidad` en `entidades.ts` (se suma a `ENTIDADES_IDN`) y `version` en `ProveedorEntidad`.
  - **SQL crudo justificado (regla 11)** en `reservarUnidad`: `UPDATE idn.cuota SET consumidas = consumidas + 1 WHERE tenant_id = $1 AND periodo = $2 AND consumidas < incluidas RETURNING ...`. Es la única forma de incrementar condicionalmente y leer el resultado en una sola sentencia atómica sin `FOR UPDATE` ni carrera entre lectura y escritura. Si no devuelve fila, un `SELECT` por QueryBuilder distingue `SIN_CUOTA` de `AGOTADA`.
  - `marcarAviso`: `UPDATE ... SET avisado_umbral_en = $3 WHERE ... AND avisado_umbral_en IS NULL` por QueryBuilder; `affected = 1` → `true`.
  - `liberarUnidad`: QueryBuilder `consumidas = consumidas - 1` con `consumidas > 0`.
  - `crearSiFalta`: QueryBuilder `insert().orIgnore()`.
- `typeorm/lectura-cuotas-consola.ts`: llama a las dos funciones `SECURITY DEFINER` (SQL crudo permitido: funciones de base de datos).
- `typeorm/proveedores.repositorio.ts`: lectura y guardado con bloqueo optimista por `version`.
- `event-schemas.ts`: `ESQUEMAS_IDN` y `registrarEsquemasIdn` (mismo criterio que cfg: Ajv estricto).

### Adaptadores en las apps

- `apps/api/src/identidad/` y `apps/worker/src/cuotas/` (un archivo por adaptador, compartido si el patrón del repo lo permite):
  - `PlanDelTenantOrg`: suscripciones del tenant del contexto con estado `PRUEBA` o `ACTIVA` por la API pública de `org`; `planMasAlto`.
  - `ConfiguracionCuotaParametros`:
    - `incluidasPorPlan()` lee **solo el `valor_defecto` de la definición** `plat.identidad.cuota_incluidas` (por `DefinicionesRepositorioTypeOrm` de `parametros`), nunca un valor fijado por el tenant. Si el tenant tiene un valor propio se ignora y se registra un aviso en el log (sin datos personales). Cambiar las incluidas por plan exige una versión nueva del manifiesto.
    - `umbralAvisoPorcentaje()` usa `ParametroPort.valor('plat.identidad.cuota_umbral_aviso')` del tenant; fuera de 1-100 → 80 y aviso en el log.
  - `TenantsActivosOrg` (solo worker): `org.tenants_listar` con estado `ACTIVO`, paginado.
  - `VerificadorOperador` de idn: reutiliza `ExigirOperador`.
- `IdentidadModule.register` recibe `planDelTenant`, `configuracionCuota` y `verificadorOperador` como instancias (igual que `hasher` en el 28) y arma `ControlCuota` en lugar de `CuotaNula`.

### Worker (`apps/worker/src/cuotas/`)

- `tarea-cuotas.ts`: `TareaCuotas`, cola y programador `idn-cuotas`, patrón `5 0 1 * *`, `tz: 'America/Lima'`, sin reintentos (idempotente). Ejecuta `AbrirPeriodoCuotas.ejecutar(periodoDe(reloj.now()))` y registra el resultado.
- `cuotas.module.ts` y su registro en `worker.module.ts`.
- `cli/ejecutar-cuotas.ts` + `cli/cuotas.cli.ts`: `cuotas:abrir [--periodo AAAA-MM]` para correrla a mano.

### Parámetros (`plat.manifiesto.json`)

```json
{ "codigo": "plat.identidad.cuota_incluidas", "descripcion": "Consultas DNI/RUC incluidas por mes según el plan (solo vale el valor por defecto)", "tipo": "JSON", "valor_defecto": { "BASICO": 200, "PRO": 500, "EMPRESA": 2000 }, "alcance_maximo": "TENANT", "esquema": { "...": "BASICO, PRO y EMPRESA enteros >= 0, sin otras claves" } },
{ "codigo": "plat.identidad.cuota_umbral_aviso", "descripcion": "Porcentaje de la cuota DNI/RUC que dispara el aviso", "tipo": "NUMERO", "valor_defecto": 80, "alcance_maximo": "TENANT" }
```

### HTTP (`interface/cuotas.controller.ts`, `proveedores.controller.ts`, DTO en `cuotas.dto.ts`, `proveedores.dto.ts`)

| Método y ruta | Permiso | Operador | Respuesta |
| --- | --- | --- | --- |
| `GET /v1/identidad/cuota-actual` | `plat.identidad.cuota` | No | 200 `{ periodo, plan, incluidas, consumidas, porcentaje, umbral_aviso }` |
| `GET /v1/identidad/cuotas?periodo=&q=&pagina=&tamano=` | `plat.identidad.cuota_gestionar` | Sí | 200 página de `{ tenant_id, tenant_nombre, plan, incluidas, consumidas, porcentaje, avisado_umbral_en, avisado_agotada_en, version }`; `periodo` por defecto el actual |
| `GET /v1/identidad/cuotas/{tenantId}/{periodo}` | `plat.identidad.cuota_gestionar` | Sí | 200 la fila + `consultas_por_resultado` |
| `PATCH /v1/identidad/cuotas/{tenantId}/{periodo}` | `plat.identidad.cuota_gestionar` (sensible, aal2) | Sí | 200 la cuota; body `{ incluidas, version }` |
| `GET /v1/identidad/proveedores` | `plat.identidad.proveedor` | Sí | 200 `[{ codigo, tipos_doc, prioridad, ttl_dias, timeout_ms, activo, version }]` por prioridad |
| `PATCH /v1/identidad/proveedores/{codigo}` | `plat.identidad.proveedor` (sensible, aal2) | Sí | 200 el proveedor; body parcial `{ prioridad?, ttl_dias?, timeout_ms?, activo?, version }` |

Errores: 429 `CUOTA_AGOTADA` en `GET /v1/identidad/{tipo}/{numero}` (sin `Retry-After`: el cliente pasa a ingreso manual, TR-RNF-007); 422 `INCLUIDAS_MENOR_QUE_CONSUMIDAS`, `PERIODO_CERRADO`, `ULTIMO_PROVEEDOR_ACTIVO`, `PERIODO_INVALIDO`; 404 `CUOTA_NO_ENCONTRADA` (detalle de un periodo pasado sin fila), `PROVEEDOR_NO_ENCONTRADO`; 409 `VERSION_OBSOLETA`; 403 `OPERADOR_REQUERIDO`. OpenAPI completo. Las credenciales de proveedor no aparecen en ninguna respuesta (regla 9).

`cuota-actual` es un segmento propio para no chocar con `GET /v1/identidad/{tipo}/{numero}`.

### Permisos (`plat.manifiesto.json` 1.18.0)

| Código | Alcance | Sensible | Rol predefinido |
| --- | --- | --- | --- |
| `plat.identidad.cuota` | TENANT | No | `PLAT_PROPIETARIO` |
| `plat.identidad.cuota_gestionar` | TENANT | Sí | `PLAT_ADMIN_TENANTS` |
| `plat.identidad.proveedor` | TENANT | Sí | `PLAT_ADMIN_TENANTS` |

Los dos de gestión exigen además el tenant operador (`OPERADOR_REQUERIDO`) y aal2: un administrador del cliente no los puede usar aunque tenga el rol. Sin opción de menú (la agrega el spec 30).

### Eventos

Los cuatro de la tabla de dominio, por `EventPublisher` dentro de la transacción del caso de uso (regla 4). Esquemas registrados en el validador de eventos de la API y del worker.

## Plan de implementación

1. **Migración.** `db/01k_idn_cuota.sql`, inverso y prueba SQL: `ck_cuota_tope`, formato de periodo, RLS de `idn.cuota` entre dos tenants, sin `DELETE`, las dos funciones devuelven todos los tenants y no tienen acceso de `anon`/`authenticated`/`PUBLIC`, `version` en `idn.proveedor`, ida y vuelta.
2. **Dominio.** `periodo`, `plan-cuota`, `aviso-cuota`, `ajuste-cuota`, `proveedor-editable`, eventos, errores, permisos. Pruebas unitarias (periodo en el cambio de mes en Lima, plan más alto, umbral 400/500 = 80 %, incluidas 0).
3. **`ControlCuota` y repositorio.** Puertos, `ControlCuota`, `RepositorioCuotasTypeOrm`, entidad. Pruebas del caso de uso con dobles y de integración contra base temporal: reserva concurrente, creación al vuelo, aviso una sola vez, liberar.
4. **Consulta.** `CuotaAgotadaError` en `ConsultarDocumento`, `IdentidadModule` con `ControlCuota` y los adaptadores de `apps/api` (`PlanDelTenantOrg`, `ConfiguracionCuotaParametros`), parámetros en el manifiesto, esquemas de eventos. Pruebas TR-CA-120, 121 y 122.
5. **Tarea mensual.** `AbrirPeriodoCuotas`, `TenantsActivosOrg`, `TareaCuotas`, módulo y CLI `cuotas:abrir`. Prueba de la tarea con reloj falso y de idempotencia.
6. **HTTP de cuotas.** Casos de uso de lectura y ajuste, `LecturaCuotasConsola`, controlador, DTO, OpenAPI, permisos. Pruebas e2e: 403 sin permiso, 403 `OPERADOR_REQUERIDO` desde un tenant cliente, 422, 409.
7. **HTTP de proveedores.** Casos de uso, repositorio, controlador, DTO. Prueba e2e: cambiar prioridades cambia el proveedor que responde en la consulta siguiente; desactivar el último → 422.
8. **Cierre.** Manifiesto 1.18.0 (y versión esperada en las pruebas de manifiesto), `nx affected -t lint test build` verde, `code-simplifier` sobre los archivos tocados, prueba en staging con `IDN_PROVEEDOR=falso` y la CLI `cuotas:abrir`.

## Criterios de aceptación

- [ ] TR-CA-120: tenant con 500 incluidas en 2026-10 y 399 consumidas; la consulta 400 al proveedor deja `consumidas = 400` y escribe en el outbox un `cuota.umbral_alcanzado` con `porcentaje = 80`, `umbral = 80`.
- [ ] TR-CA-121: 500 de 500 consumidas y DNI fuera de caché → 429 `CUOTA_AGOTADA`, bitácora `CUOTA_AGOTADA`, el proveedor no se llama.
- [ ] TR-CA-122: cuota agotada y DNI vigente en caché → 200 con `fuente = CACHE`; `consumidas` no cambia.
- [ ] Documento inválido o respuesta desde caché no cambian `consumidas` (TR-RN-031).
- [ ] El aviso de umbral y el de agotada se publican una sola vez por periodo, aunque haya más consultas o reservas concurrentes que crucen el umbral.
- [ ] Reserva concurrente: con 10 consultas restantes, 50 reservas en paralelo contra la base dejan exactamente 10 `true` y `consumidas = incluidas`.
- [ ] Todos los proveedores fallan → `consumidas` vuelve al valor previo a la reserva.
- [ ] Tenant sin fila del periodo: la primera consulta la crea con las incluidas de su plan y reserva una unidad.
- [ ] Cambio de mes (reloj en 2026-11-01 00:00 Lima): la reserva usa `2026-11` con `consumidas` en 0; la fila de `2026-10` no cambia.
- [ ] Plan: un tenant con suscripciones BASICO (ACTIVA) y EMPRESA (PRUEBA) recibe 2000; uno sin suscripción vigente, 200.
- [ ] Un valor de `plat.identidad.cuota_incluidas` fijado por el tenant no cambia sus incluidas.
- [ ] `plat.identidad.cuota_umbral_aviso` fijado en 90 por el tenant mueve el aviso a 450 de 500.
- [ ] La tarea mensual crea la fila del periodo para cada tenant ACTIVO; correrla dos veces no duplica ni cambia `consumidas`; `cuotas:abrir --periodo 2026-12` funciona.
- [ ] `GET /v1/identidad/cuota-actual` devuelve la cuota del tenant del token y no crea fila si no existe.
- [ ] `GET /v1/identidad/cuotas` desde el tenant operador lista todos los tenants del periodo; desde un tenant cliente responde 403 `OPERADOR_REQUERIDO` aunque tenga el permiso.
- [ ] `PATCH` de incluidas por debajo de `consumidas` → 422 `INCLUIDAS_MENOR_QUE_CONSUMIDAS`; a un periodo pasado → 422 `PERIODO_CERRADO`; con `version` vieja → 409; válido → 200 y evento `cuota.ajustada` en el outbox del tenant de la cuota.
- [ ] Cambiar la prioridad de proveedores por `PATCH` cambia el orden de respaldo en la consulta siguiente; desactivar el último activo de un tipo → 422 `ULTIMO_PROVEEDOR_ACTIVO`; ninguna respuesta incluye credenciales.
- [ ] Los `PATCH` sin aal2 → 403; endpoints en OpenAPI bajo `/v1`.
- [ ] Un tenant no ve ni modifica la cuota de otro (prueba SQL con dos `app.tenant_id`).
- [ ] Migración `01k_idn_cuota` reversible y probada en CI contra PostgreSQL 16.
- [ ] `comp:idn` sigue importando solo `kernel`, `seg` y `scope:shared` (prueba de límites).
- [ ] Cobertura de dominio de `identidad` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; el único SQL crudo fuera de funciones es `reservarUnidad`, con la razón en el código del adaptador.
- [ ] `nx affected -t lint test build` verde.

## Decisiones

- **Sí:** incluidas por plan en el parámetro `plat.identidad.cuota_incluidas` (BASICO 200, PRO 500, EMPRESA 2000). Decisión del usuario. Sin tocar `org.suscripcion`.
- **Sí:** solo vale el `valor_defecto` de ese parámetro. Decisión del usuario: lo controla solo la plataforma, nunca el cliente. TR-CFG no tiene alcance «plataforma», así que el adaptador ignora el valor del tenant. Cambiar los números = nueva versión del manifiesto.
- **No:** constante en el dominio ni columna en `org.suscripcion`. La constante obliga a desplegar código; la columna toca ORG y su migración.
- **Sí:** plan del tenant = el más alto de sus suscripciones `PRUEBA` o `ACTIVA`; sin ninguna, BASICO. La cuota es por tenant (el RF) aunque el plan viva por producto.
- **Sí:** cuota siempre mensual. Decisión del usuario. El ciclo de cobro mensual/anual con descuento es precio y va al spec 118.
- **Sí:** 429 `CUOTA_AGOTADA` con error propio. Decisión del usuario. Distinto de 503 para que el front explique la causa; los dos llevan a ingreso manual.
- **No:** modo degradado ni parámetro `al_agotar`. Fuera de R2.
- **Sí:** eventos `cuota.umbral_alcanzado` y `cuota.agotada`, una vez cada uno por periodo con `avisado_*_en`. Decisión del usuario. TR-NOT los consumirá.
- **Sí:** eventos `cuota.ajustada` y `proveedor_identidad.actualizado` en los cambios del operador (regla 4; también son el rastro de auditoría).
- **Sí:** umbral de aviso por tenant con `ParametroPort` (80 por defecto): es preferencia de aviso del cliente, no da consultas.
- **Sí:** tres permisos: `cuota` (cliente), `cuota_gestionar` y `proveedor` (operador, sensibles). Decisión del usuario. Los dos de gestión van a `PLAT_ADMIN_TENANTS` y además exigen `OPERADOR_REQUERIDO` y aal2.
- **Sí:** tarea mensual en el worker y creación al vuelo en `reservar`. Decisión del usuario. La tarea cumple el flujo del RF y la consola ve los tenants sin consultas; el vuelo cubre una tarea que no corrió.
- **Sí:** el ajuste vale solo para el periodo indicado (actual o futuro). Decisión del usuario.
- **Sí:** endpoints de cuotas y de proveedores en este spec; el 30 es solo UI. Decisión del usuario.
- **No:** estado del circuit breaker en la consola. Vive en memoria por instancia; exponerlo exige Redis y tocar el breaker del 28.
- **Sí:** reserva con `UPDATE ... WHERE consumidas < incluidas RETURNING` en SQL crudo (regla 11, justificado arriba). `ck_cuota_tope` es la segunda barrera.
- **Sí:** `ControlCuota` corre dentro de la transacción de `ConsultarDocumento`: la reserva, la bitácora y los avisos se confirman juntos.
- **Sí:** `marcarAviso` condicionado a `IS NULL` para no duplicar eventos con reservas concurrentes.
- **Sí:** liberar no revierte avisos ya publicados.
- **Sí:** IDN no importa `cfg` ni `org`: plan, parámetros, tenants activos y operador llegan por puertos con adaptadores en `apps/api` y `apps/worker` (PL-10, patrón de `DiasGraciaParametros`).
- **Sí:** el ajuste de otro tenant corre en `TenantContext.run` de ese tenant; las lecturas de todos los tenants van por funciones `SECURITY DEFINER` (patrón del 17a).
- **Sí:** `GET /v1/identidad/cuota-actual` no crea la fila: un GET no escribe.
- **Sí:** ruta `cuota-actual` en un segmento para no chocar con `/v1/identidad/{tipo}/{numero}`.
- **Sí:** no se puede desactivar el último proveedor activo de un tipo; sin él toda consulta sería 503.
- **No:** alta y baja de proveedores ni credenciales en la API (regla 9).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La fila de la cuota queda bloqueada mientras dura la transacción de `prepararConsulta`, y las consultas del mismo tenant se serializan | La transacción es corta (caché, reserva, configuración); la llamada al proveedor ya va fuera (spec 28). |
| La tarea del día 1 corre con una suscripción todavía en PRUEBA que luego pasa a otro plan | El plan queda fijado en la fila del periodo; el operador ajusta con `PATCH`. El mes siguiente toma el plan nuevo. |
| Un cliente fija `plat.identidad.cuota_incluidas` en la pantalla de parámetros creyendo que sube su cuota | Se ignora y se loguea; la descripción del parámetro lo dice. Ocultarlo del cliente necesita un alcance «plataforma» en TR-CFG (spec aparte). |
| TR-NOT llega en R2-09: hasta entonces el aviso solo queda en el outbox | TR-CA-120 se prueba con el evento publicado; la tarjeta de consumo del spec 30 muestra el porcentaje. |
| Cambio de mes en UTC vs Lima | `periodoDe` siempre en `America/Lima`, con prueba en el borde. |

## Lo que **no** entra en este spec

- UI de consola y tarjeta de consumo en `admin-cliente` (spec 30).
- Correo del aviso (TR-NOT).
- Ciclo de cobro mensual/anual con descuento (spec 118).
- Modo degradado, cobro por excedente, cuotas de IA y mensajería.
- Estado del circuit breaker, alta/baja de proveedores y credenciales.
- Override de incluidas para meses futuros.
