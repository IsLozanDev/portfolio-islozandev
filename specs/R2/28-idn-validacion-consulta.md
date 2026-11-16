# SPEC 28 — Identidad: validación de DNI/RUC y consulta con caché central, proveedor con respaldo y bitácora

> **Status:** Aprobado
> **Depends on:** SPEC 06, SPEC 21
> **Date:** 2026-11-16
> **Objective:** Crear `libs/plataforma/identidad` (TR-IDN) con la validación de formato de DNI, RUC, CE y pasaporte en `shared/util` y la consulta de DNI y RUC por `GET /v1/identidad`, resuelta desde una caché central con campos mínimos o desde Decolecta con timeout de 3 s, respaldo y circuit breaker, dejando cada consulta en una bitácora por tenant con el número hasheado.

## Por qué existe este spec

Fila 28 de `docs/roadmap-specs.md` (R2-02). Contexto de apoyo: `docs/spec-context/tr-idn/idn-validacion-consulta-dni-ruc.md`. Sus ambigüedades (sec. 9) quedan resueltas en las Decisiones.

Se reduce el alcance de la fila 28: el adaptador real de `PadronRucPort` para ORG, TR-CA-004 y TR-CA-006 (advertencia NO HABIDO en `RegistrarEmpresa`) salen a un spec corto propio, `28b-idn-padron-ruc-org`. Así el 28 queda dentro de una sola lib más la extensión de `shared/util`, y ORG no cambia. El roadmap suma la fila 28b al aprobar este spec.

Lo que hay en el código hoy (revisado al redactar):

- `libs/shared/util/src/ruc.ts`: `validarRuc(ruc): boolean` (prefijo 10/15/17/20 y módulo 11). Lo usa `org/domain/valores.ts`. No hay validación de DNI, CE ni pasaporte, ni motivo.
- `libs/plataforma/observabilidad`: `hashDocumento(numero, sal)` (`sha256:` + 64 hex) y `salDocumento(entorno)` sobre `OBS_SAL_DOCUMENTO` (TR-RNF-111, spec 21). `comp:obs` no está entre los predecesores de IDN en PL-10, así que la lib no lo importa: `apps/api` lo inyecta.
- `eslint.config.mjs` no tiene regla `comp:idn`. Última migración: `db/01i_seg_vigencia_peru.sql`.
- `plat.manifiesto.json` en versión 1.15.0, sin permisos de identidad.
- `kernel`: `ValidationError`, `NotFoundError`, `TenantContext`, `UnitOfWork`, `Clock`. `seguridad`: `@Permiso`, `PrincipalActual`.

## Alcance

**Entra:**

- TR-RF-044: `validarDocumento(tipo, numero)` en `shared/util` con motivo, y `GET /v1/identidad/{tipo}/{numero}/validez`.
- TR-RF-045: consulta de DNI con caché global, Decolecta como proveedor de prioridad 1, respaldo por prioridad, circuit breaker propio, caché solo con nombres y apellidos.
- TR-RF-046: consulta de RUC con razón social, estado, condición, dirección fiscal, ubigeo y `apto_factura`.
- `IdentidadPort` (`validar`, `consultar`) exportado para consumidores en proceso.
- Bitácora `idn.consulta_log` por tenant con número hasheado.
- `CuotaPort` (`reservar`, `liberar`) con adaptador nulo «sin límite».
- Adaptador falso configurable para local, CI y staging.
- Migración `db/01j_idn.sql` con su inverso y prueba SQL.
- Permisos `plat.identidad.validar` y `plat.identidad.consultar` en el manifiesto.

**No entra (specs futuros):**

- Adaptador de `PadronRucPort` en ORG, TR-CA-004 y TR-CA-006 → spec 28b.
- Cuota mensual, tabla `idn.cuota`, aviso 80 % (TR-RF-047) → spec 29. Consola de proveedor y cuotas → spec 30.
- Adaptador RENIEC por convenio y carga diaria del padrón SUNAT (`SunatPadronAdapter`).
- Identidad portable (TR-RF-048 a 051).
- Caché de NO_ENCONTRADO.
- UI: el prellenado lo muestra `<ui-persona-buscador>` de TR-PER (spec 31).
- Consulta de CE y pasaporte en proveedor: solo se validan.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `shared/util/ruc.ts` | Se conserva `validarRuc` (firma intacta para ORG); pasa a usar internamente el nuevo validador de RUC. |
| `observabilidad/hashDocumento` y `salDocumento` | Se reutilizan desde `apps/api` para implementar `HasherDocumento`. Mismo formato que los logs: un hash de bitácora y uno de log se pueden cruzar. |
| `kernel-infra/TypeOrmUnitOfWork`, `AlsTenantContext`, `SystemClock` | Sin cambios. |
| `catalogos` | Referencia de estructura de lib, `project.json`, jest y `temp-db`. |

## Modelo de datos

### `shared/util` (`src/documento.ts`)

```ts
export type TipoDocumento = 'DNI' | 'RUC' | 'CE' | 'PAS';
export type MotivoInvalidez = 'LONGITUD' | 'PREFIJO' | 'DIGITO_VERIFICADOR' | 'CARACTERES';
export type ValidezDocumento = { valido: true } | { valido: false; motivo: MotivoInvalidez };

export function validarDocumento(tipo: TipoDocumento, numero: string): ValidezDocumento;
```

Reglas, en este orden (el primer fallo gana):

| Tipo | CARACTERES | LONGITUD | PREFIJO | DIGITO_VERIFICADOR |
| --- | --- | --- | --- | --- |
| DNI | solo dígitos | 8 | — | — |
| RUC | solo dígitos | 11 | 10, 15, 17, 20 | módulo 11 SUNAT |
| CE | alfanumérico | 1 a 12 | — | — |
| PAS | alfanumérico | 1 a 12 | — | — |

### Migración `db/01j_idn.sql` (+ `db/rollback/01j_idn.sql`, `db/tests/01j_idn.test.sql`)

```sql
CREATE SCHEMA idn;

CREATE TABLE idn.proveedor (
  codigo       varchar(30) PRIMARY KEY,
  tipos_doc    varchar(3)[] NOT NULL,
  prioridad    smallint NOT NULL CHECK (prioridad > 0),
  ttl_dias     smallint NOT NULL CHECK (ttl_dias > 0),
  timeout_ms   integer  NOT NULL DEFAULT 3000 CHECK (timeout_ms BETWEEN 100 AND 10000),
  activo       boolean  NOT NULL DEFAULT true
);
INSERT INTO idn.proveedor VALUES ('DECOLECTA', '{DNI,RUC}', 1, 30, 3000, true);

CREATE TABLE idn.cache_documento (
  tipo_doc      varchar(3) NOT NULL CHECK (tipo_doc IN ('DNI','RUC')),
  numero        varchar(11) NOT NULL,
  datos         jsonb NOT NULL,
  fuente        varchar(30) NOT NULL,
  consultado_en timestamptz NOT NULL,
  expira_en     timestamptz NOT NULL,
  PRIMARY KEY (tipo_doc, numero),
  CONSTRAINT ck_cache_campos CHECK (
    (tipo_doc = 'DNI' AND datos - ARRAY['nombres','apellidos'] = '{}'::jsonb)
    OR (tipo_doc = 'RUC' AND datos - ARRAY['razon_social','estado','condicion','direccion_fiscal','ubigeo'] = '{}'::jsonb)
  )
);

CREATE TABLE idn.consulta_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  usuario_id      uuid,
  producto_codigo varchar(10),
  tipo_doc        varchar(3) NOT NULL,
  numero_hash     varchar(71) NOT NULL CHECK (numero_hash ~ '^sha256:[0-9a-f]{64}$'),
  motivo          varchar(30) NOT NULL CHECK (motivo IN ('REGISTRO_CLIENTE','EMISION_COMPROBANTE','VERIFICACION_IDENTIDAD','OTRO')),
  resultado       varchar(30) NOT NULL CHECK (resultado IN ('CACHE','PROVEEDOR','NO_ENCONTRADO','INVALIDO','CUOTA_AGOTADA','PROVEEDOR_NO_DISPONIBLE')),
  proveedor       varchar(30),
  consultado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_consulta_log_tenant_fecha ON idn.consulta_log (tenant_id, consultado_en DESC);
```

- `consulta_log`: RLS con `tenant_id = current_setting('app.tenant_id')::uuid` (mismo patrón que `cat`), solo `SELECT, INSERT` al rol de la API; sin `UPDATE`/`DELETE`.
- `cache_documento` y `proveedor`: globales, sin columna de tenant. RLS habilitado con política de lectura y escritura para el rol de la API (la caché) y solo lectura (el proveedor).
- `REVOKE ALL ON SCHEMA idn FROM anon, authenticated` (regla 8).
- Inverso: `DROP SCHEMA idn CASCADE`.

### Dominio (`libs/plataforma/identidad/src/domain/`)

- `datos-identidad.ts`: `DatosDni { nombres, apellidos }`, `DatosRuc { razonSocial, estado, condicion, direccionFiscal, ubigeo }`.
- `apto-factura.ts`: `evaluarAptoFactura(datos: DatosRuc): { apto: boolean; motivo?: string }`. Apto si `estado === 'ACTIVO'` y `condicion === 'HABIDO'`; si no, motivo `Estado <estado>` o `Condición <condicion>` (TR-RN-019, TR-CA-119).
- `entrada-cache.ts`: `EntradaCache { tipo, numero, datos, fuente, consultadoEn, expiraEn }` y `estaVigente(ahora)`. `campos-minimos.ts` recorta a los campos permitidos (TR-RN-032) antes de guardar.
- `motivo-consulta.ts`, `resultado-consulta.ts`: uniones con los valores del CHECK.
- `errores.ts`: `DocumentoInvalidoError` (ValidationError, lleva `motivo`), `TipoNoConsultableError` (ValidationError, CE y PAS), `DocumentoNoEncontradoError` (NotFoundError), `ProveedorNoDisponibleError`.

### Puertos (`application/ports/`)

```ts
export interface IdentidadPort {
  validar(tipo: TipoDocumento, numero: string): ValidezDocumento;
  consultar(consulta: ConsultaDocumento): Promise<RespuestaConsulta>;
}
type ConsultaDocumento = { tipo: 'DNI' | 'RUC'; numero: string; motivo: MotivoConsulta; productoCodigo?: string };
type RespuestaConsulta =
  | { tipo: 'DNI'; datos: DatosDni; fuente: 'CACHE' | 'PROVEEDOR'; proveedor: string; consultadoEn: Date }
  | { tipo: 'RUC'; datos: DatosRuc; aptoFactura: boolean; motivoNoApto?: string; fuente: 'CACHE' | 'PROVEEDOR'; proveedor: string; consultadoEn: Date };

interface ProveedorIdentidad {           // un adaptador por proveedor
  readonly codigo: string;
  consultarDni(numero: string, señal: AbortSignal): Promise<DatosDni | null>;   // null = no existe
  consultarRuc(numero: string, señal: AbortSignal): Promise<DatosRuc | null>;
}
interface ConfiguracionProveedores { activosPara(tipo): Promise<ProveedorConfigurado[]> }  // idn.proveedor por prioridad
interface CacheIdentidadRepository { obtener(tipo, numero); guardar(entrada) }
interface BitacoraConsultas { registrar(registro) }
interface CuotaPort { reservar(tenantId): Promise<boolean>; liberar(tenantId): Promise<void> }
interface HasherDocumento { hashear(numero: string): string }
```

### Caso de uso `ConsultarDocumento` (`application/consultar-documento.ts`)

1. `validarDocumento`; inválido → bitácora `INVALIDO` y `DocumentoInvalidoError`. CE/PAS → `TipoNoConsultableError` sin bitácora.
2. Caché vigente → bitácora `CACHE`, responde. No toca la cuota (TR-CA-115).
3. `CuotaPort.reservar`; `false` → bitácora `CUOTA_AGOTADA`. (Con el nulo nunca pasa.)
4. `ProveedorConRespaldo` recorre los proveedores activos del tipo por prioridad, cada uno con su `timeout_ms` vía `AbortSignal.timeout` y su circuit breaker. Respuesta `null` → NO_ENCONTRADO (no prueba el siguiente). Error, timeout o breaker abierto → siguiente.
5. Todos fallan → `CuotaPort.liberar`, bitácora `PROVEEDOR_NO_DISPONIBLE`, `ProveedorNoDisponibleError`.
6. Encontrado → `campos-minimos` y guarda en caché con `expira_en = ahora + ttl_dias`; bitácora `PROVEEDOR`. No encontrado → bitácora `NO_ENCONTRADO`, sin caché.

La llamada al proveedor va **fuera** de la transacción. Caché y bitácora se escriben en una transacción corta posterior (`UnitOfWork`), así no se retiene una conexión durante 3 s. Sin eventos ni outbox: no hay cambio de negocio.

### Infraestructura (`infrastructure/`)

- `decolecta/proveedor.decolecta.ts`: `fetch` a `https://api.decolecta.com/v1/reniec/dni?numero=` y `/v1/sunat/ruc?numero=` con `Authorization: Bearer`. Mapeo: DNI `nombres = first_name`, `apellidos = first_last_name + ' ' + second_last_name`; RUC `razon_social`, `estado`, `condicion`, `direccion → direccionFiscal`, `ubigeo`. 404 y 422 → `null`; 401/403/429/5xx y errores de red → error (pasa al respaldo). Ningún otro campo sale del adaptador.
- `falso/proveedor.falso.ts`: datos fijos (fixtures en `falso/fixtures.ts`) con los documentos de los GWT, demora y fallo configurables por constructor para las pruebas.
- `respaldo/proveedor-con-respaldo.ts` y `respaldo/circuit-breaker.ts`: breaker en memoria por proveedor e instancia; `UMBRAL_FALLOS = 5` seguidos lo abren, `APERTURA_MS = 30_000` después pasa a semiabierto y una llamada exitosa lo cierra.
- `cuota.nula.ts`: `reservar` → `true`, `liberar` → no hace nada.
- `typeorm/`: entidades `ProveedorEntidad`, `CacheDocumentoEntidad`, `ConsultaLogEntidad` y sus adaptadores sobre el `EntityManager` de la transacción activa. `guardar` de caché con `upsert` por `(tipo_doc, numero)`. Sin SQL crudo.
- Entorno (`interface/entorno-identidad.ts`, zod): `IDN_PROVEEDOR` (`decolecta` | `falso`, por defecto `falso`), `IDN_DECOLECTA_TOKEN`. `exigirProveedorReal`: en `APP_ENV=production` exige `decolecta` y token; en `local`, `test` y `staging` se admite `falso`. Cuando `IDN_PROVEEDOR=falso`, el adaptador falso responde bajo el código `DECOLECTA` de `idn.proveedor`.

### HTTP (`interface/identidad.controller.ts`, `identidad.dto.ts`)

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `GET /v1/identidad/{tipo}/{numero}/validez` | `plat.identidad.validar` | 200 `{ valido, motivo? }` (siempre 200, también si es inválido) |
| `GET /v1/identidad/{tipo}/{numero}?motivo=&producto=` | `plat.identidad.consultar` | 200 DNI `{ nombres, apellidos, fuente, consultado_en }`; RUC `{ razon_social, estado, condicion, direccion_fiscal, ubigeo, apto_factura, motivo_no_apto?, fuente, consultado_en }` |

Errores: 422 `DOCUMENTO_INVALIDO` (con `motivo`) o `TIPO_NO_CONSULTABLE`; 404 `NO_ENCONTRADO`; 503 `PROVEEDOR_NO_DISPONIBLE` (el cliente sigue con registro manual, TR-RNF-007). `motivo` obligatorio y validado contra la lista; `producto` opcional `^[A-Z]{2,10}$`. OpenAPI completo. `fuente` en la respuesta HTTP es `CACHE` o `PROVEEDOR`; el código del proveedor no se expone.

### Composición

- `IdentidadModule.register({ proveedor, decolectaToken })` exporta `IDENTIDAD` (`IdentidadPort`). `apps/api` lo registra y provee `HASHER_DOCUMENTO` con `hashDocumento(numero, salDocumento(entorno))`.
- `eslint.config.mjs`: `comp('idn', 'kernel', 'seg')` y fixture `comp:idn` en `tools/boundaries-test`.
- `.env.example`: `IDN_PROVEEDOR`, `IDN_DECOLECTA_TOKEN` (secreto, regla 9).
- `plat.manifiesto.json` 1.16.0: `plat.identidad.validar` y `plat.identidad.consultar`, alcance `TENANT`, no sensibles. Sin opción de menú.

### Eventos

Ninguno.

## Plan de implementación

1. **Validadores.** `shared/util/src/documento.ts` con `validarDocumento`; `validarRuc` delega en él. Pruebas: TR-CA-112, 113, 114 y una por motivo y tipo. Las pruebas de ORG siguen verdes.
2. **Migración.** `db/01j_idn.sql`, inverso y prueba SQL: CHECK de campos (rechaza `direccion` en un DNI), RLS de la bitácora entre dos tenants, sin `UPDATE`/`DELETE` en la bitácora, sin acceso de `anon`/`authenticated`, ida y vuelta.
3. **Lib y dominio.** `nx g` de `libs/plataforma/identidad` con tags `scope:plataforma`, `type:backend`, `comp:idn`; regla de eslint y fixture de límites. Dominio y pruebas (`evaluarAptoFactura`, vigencia, campos mínimos).
4. **Respaldo.** `CircuitBreaker`, `ProveedorConRespaldo`, `ProveedorFalso`, `CuotaNula`. Pruebas unitarias con reloj falso: timeout a prioridad 2 (TR-CA-116), breaker abre y se recupera, `null` no prueba el siguiente.
5. **Caso de uso y persistencia.** `ConsultarDocumento`, adaptadores TypeORM, pruebas del caso de uso con dobles (TR-CA-115, 117, 118, 119 y los propuestos) y de integración contra base temporal (caché compartida entre tenants, bitácora aislada).
6. **Decolecta.** `ProveedorDecolecta` con pruebas de mapeo sobre respuestas grabadas (sin red) y una prueba manual con token real, documentada en el cierre.
7. **HTTP y composición.** Controlador, DTO, OpenAPI, `IdentidadModule`, registro en `apps/api`, entorno, manifiesto. Prueba e2e de los dos GET con el proveedor falso, incluidos 403 sin permiso, 422, 404 y 503.
8. **Cierre.** `nx affected -t lint test build` verde, `code-simplifier` sobre los archivos tocados, prueba en staging con `IDN_PROVEEDOR=falso` y una consulta RUC real con Decolecta.

## Criterios de aceptación

- [ ] TR-CA-112: `validarDocumento('RUC', '20100070970')` → `{ valido: true }`.
- [ ] TR-CA-113: `validarDocumento('RUC', '30601234567')` → `{ valido: false, motivo: 'PREFIJO' }`.
- [ ] TR-CA-114: `validarDocumento('DNI', '4578123A')` → `{ valido: false, motivo: 'CARACTERES' }`.
- [ ] TR-CA-115: DNI 45781236 en caché hace 10 días (TTL 30) consultado por otro tenant devuelve «Juana Quispe Mamani» con `fuente = CACHE`, sin llamar al proveedor ni a `CuotaPort.reservar`.
- [ ] TR-CA-116: proveedor de prioridad 1 que no responde en 3 s → respuesta del de prioridad 2, `fuente = PROVEEDOR`, bitácora con el código del de prioridad 2.
- [ ] TR-CA-117: el proveedor devuelve dirección para un DNI y la fila de caché solo tiene `nombres` y `apellidos`; insertar otra clave por SQL viola `ck_cache_campos`.
- [ ] TR-CA-118: RUC 20512345671 ACTIVO y HABIDO → razón social y `apto_factura = true`.
- [ ] TR-CA-119: RUC 20498765433 BAJA DE OFICIO → `apto_factura = false`, `motivo_no_apto = 'Estado BAJA DE OFICIO'`.
- [ ] Ambos proveedores fallan → 503 `PROVEEDOR_NO_DISPONIBLE`, `CuotaPort.liberar` llamado, bitácora `PROVEEDOR_NO_DISPONIBLE`.
- [ ] Caché vencida → nueva llamada al proveedor y caché actualizada.
- [ ] NO_ENCONTRADO → 404, bitácora `NO_ENCONTRADO`, sin fila en caché.
- [ ] Ninguna fila de `idn.consulta_log` contiene el número en claro: `numero_hash` cumple `^sha256:[0-9a-f]{64}$` y coincide con `hashDocumento(numero, OBS_SAL_DOCUMENTO)`.
- [ ] Un tenant no ve la bitácora de otro (prueba SQL con dos `app.tenant_id`).
- [ ] Breaker: tras 5 fallos seguidos el proveedor no se llama durante 30 s; después, una llamada exitosa lo cierra.
- [ ] CE y PAS: `/validez` responde; la consulta responde 422 `TIPO_NO_CONSULTABLE`.
- [ ] Sin `plat.identidad.consultar` → 403; endpoints en OpenAPI bajo `/v1`.
- [ ] `apps/api` no arranca con `APP_ENV=production` y `IDN_PROVEEDOR=falso` o sin token.
- [ ] `anon` y `authenticated` no tienen acceso al esquema `idn`.
- [ ] Migración `01j_idn` reversible y probada en CI contra PostgreSQL 16.
- [ ] `comp:idn` solo importa `kernel`, `seg` y `scope:shared` (prueba de límites).
- [ ] Cobertura de dominio de `identidad` ≥ 70 %.
- [ ] `validarRuc` mantiene su firma y las pruebas de ORG pasan sin cambios.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM sin SQL embebido.
- [ ] `nx affected -t lint test build` verde.

## Decisiones

- **Sí:** reducir el 28 sacando el adaptador de `PadronRucPort`, TR-CA-004 y TR-CA-006 al 28b. Decisión del usuario. Así ORG y `admin-cliente` no se tocan y el spec queda en una lib.
- **Sí:** Decolecta como proveedor real y un adaptador falso. Decisión del usuario. RENIEC por convenio queda como adaptador futuro detrás del mismo puerto (regla 10).
- **Sí:** circuit breaker propio y mínimo, en memoria por instancia. Decisión del usuario. Sin dependencia nueva; con varias instancias cada una abre su breaker, aceptable a este volumen.
- **No:** reintentar el mismo proveedor dentro de la consulta. El presupuesto de 3 s por proveedor y TR-RNF-001 no dejan margen; el respaldo hace de reintento (TR-RNF-007).
- **Sí:** validadores en `shared/util`, ampliando `ruc.ts`. Decisión del usuario. Los usan productos y frontend; `validarRuc` conserva la firma.
- **No:** dígito verificador de DNI (TR-RN-002 solo pide 8 dígitos). `DIGITO_VERIFICADOR` solo aplica a RUC.
- **Sí:** `CuotaPort` nulo, sin tabla `idn.cuota`. Decisión del usuario. El 29 crea la tabla y el adaptador real.
- **Sí:** los dos GET de `/v1/identidad` en este spec. Decisión del usuario.
- **No:** guardar NO_ENCONTRADO en caché. Decisión del usuario.
- **Sí:** caché global sin tenant como excepción a la doble barrera: dato público de nivel 1 (OP-04), sin grants a `anon`/`authenticated`; la bitácora sí va por tenant con RLS.
- **Sí:** hash con `hashDocumento` y `OBS_SAL_DOCUMENTO` del spec 21, inyectado desde `apps/api`. Una sola sal de plataforma por ambiente (TR-RNF-111) y el mismo formato que los logs. Por eso `numero_hash` es `varchar(71)` con prefijo `sha256:`, no `char(64)`.
- **No:** que `identidad` importe `observabilidad`. `comp:obs` no es predecesor de IDN en PL-10; el `HasherDocumento` se implementa en `apps/api`.
- **Sí:** lógica de OP-06 en el caso de uso con TypeORM, no como función SQL `idn.consultar` (regla 11). No hay SQL crudo en este spec.
- **Sí:** llamada al proveedor fuera de la transacción; caché y bitácora en una transacción corta posterior.
- **Sí:** consulta en línea de RUC por Decolecta; la carga diaria del padrón SUNAT queda fuera.
- **Sí:** CE y pasaporte solo se validan. Ningún proveedor elegido los consulta.
- **Sí:** `producto` como parámetro opcional de la consulta (y `productoCodigo` en el puerto); no hay contexto de producto en el kernel. Propuesta de redacción, revisar al aprobar.
- **Sí:** un solo proveedor sembrado (`DECOLECTA`, TTL 30 días). El respaldo se prueba con dos proveedores falsos.
- **Sí:** errores HTTP 422/404/503 con código; `/validez` siempre 200.
- **Sí:** sin eventos ni outbox: la consulta no cambia estado de negocio.
- **Sí:** sin auditoría en `aud`: la bitácora `idn.consulta_log` es el registro de la consulta.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Decolecta publica que la consulta de DNI (RENIEC) solo se ofrece «bajo acuerdos privados»; el token del plan gratuito puede no tener DNI | El RUC no tiene esa restricción. Se confirma con Decolecta al implementar el paso 6; si no hay DNI, se activa el falso para DNI en staging y el contrato con un proveedor de DNI queda como bloqueo de producción, no del spec. |
| La doc de Decolecta no documenta 401, 404 ni 429, y su plan gratuito es de 100 o 1 000 peticiones al mes (la doc se contradice) | Todo estado distinto de 200, 404 y 422 se trata como fallo y pasa al respaldo. Pruebas sobre respuestas grabadas; en CI y staging se usa el falso. |
| TTL de 30 días para RUC: estado o condición pueden cambiar y `apto_factura` quedar desactualizado | Se acepta en R2: el SRS fija el TTL por proveedor. Si FE (spec 51) necesita estado fresco, se agrega un TTL por tipo en `idn.proveedor` en ese spec. |
| Breaker en memoria por instancia: varias instancias golpean a un proveedor caído | Volumen bajo en R2; con 5 fallos por instancia el costo es acotado. |
| Un mapeo descuidado del adaptador filtra campos personales a la caché | Doble barrera: `campos-minimos` en el caso de uso y `ck_cache_campos` en la base (TR-CA-117). |
