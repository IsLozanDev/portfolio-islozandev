# SPEC 51 — Facturación electrónica: emisión de boleta y factura con cálculo de IGV, validaciones normativas, numeración de SEQ e idempotencia

> **Status:** Implementado
> **Depends on:** SPEC 48, SPEC 49, SPEC 50, SPEC 10, SPEC 09, SPEC 19a, SPEC 28b, SPEC 20a
> **Date:** 2026-11-24
> **Objective:** Agregar a `libs/plataforma/comprobantes` el agregado `Comprobante` y `ComprobantePort.emitir` (en proceso y por `POST /v1/fe/comprobantes`), que valida adquirente, líneas y catálogos SUNAT, calcula el IGV con la tasa vigente, numera con SEQ en la misma transacción, guarda el comprobante en `PENDIENTE_ENVIO` y publica `cpe.emitido`, sin duplicar ante la misma clave de idempotencia.

## Por qué existe este spec

Fila 51 de `docs/roadmap-specs.md` (R2-05: TR-RF-053 y TR-RF-054). Contexto: `docs/spec-context/tr-fe/fe-boleta-factura-cdr.md`, parte A. Es el corazón de TR-FE: la caja de SazónPOS necesita el número al instante para imprimir. El envío al PSE, el CDR y los estados finales son la parte B (spec 52).

Lo que hay en el código hoy (revisado al redactar):

- `comprobantes` (49 y 50): `Emisor` por empresa con `estado` (`BORRADOR`, `CONFIGURADO`, `VERIFICADO`, `PRODUCCION`), `regimen_igv` (`GENERAL`, `REDUCIDO_RESTAURANTES`) y proveedor; `PseOsePort.enviarComprobante` y `DocumentoElectronico` mínimo (boleta de prueba); eventos y esquemas en `registrarEsquemasFe`.
- SEQ (10): `CORRELATIVO_PORT.siguiente({ empresaId, tipo, serie })` en la transacción activa; bloquea la serie hasta el commit y no consume número si la transacción se revierte (TR-CA-095). `ck_serie_sunat` exige `F###`/`B###` y 8 dígitos. `LecturaSeries` existe pero no se exporta en `index.ts`. El alta de tenant siembra `B001` y `F001` en la sucursal principal.
- CAT (19a, 48): `CATALOGO_PORT.validarItem(catalogo, codigo)` con `atributos` y vigencia por fecha. Cargadas: `TIPO_COMPROBANTE` (01), `TIPO_DOC_IDENTIDAD` (06), `AFECTACION_IGV` (07), `UNIDAD_MEDIDA` (03), `MONEDA`, y las del 48 (05, 09, 10, 16, 51, 52).
- CFG (09): `PARAMETRO_PORT.valor(codigo, { empresaId, sucursalId })`. Ningún parámetro de FE para montos.
- ORG (28b): `PADRON_RUC` (`PadronRucPort.consultar(ruc)` → `{ razonSocial, estado, condicion } | null`), con el adaptador por IDN en `apps/api`.
- Matriz de límites: `comp:fe` puede importar `kernel, org, sec, cat, cfg, aud, seg, evt`; **no** `seq`.
- Manifiesto PLAT en `1.28.0`. Última letra de migración: `01r`. Este spec usa `01u` (44 y 45, en paralelo, usan `01s` y `01t`).

## Alcance

**Entra:**

- Agregado `Comprobante` (tipos `01` factura y `03` boleta) con líneas, cuotas y VO `Adquirente` y `Dinero`.
- Cálculo con TR-RN-021: valor de venta, IGV y precio por línea redondeados a 2 decimales; totales gravado, exonerado, inafecto, IGV y total; tolerancia de S/ 0,01 si el llamador envía un total esperado.
- Tasa de IGV del catálogo GLOBAL nuevo `TASA_IGV` (ítems `GENERAL` y `REDUCIDO_RESTAURANTES`, atributo `tasa`, vigencia por fecha) según el `regimen_igv` del emisor y la fecha de emisión.
- Validaciones normativas:
  - Factura: serie `F###`, adquirente con RUC válido (TR-CA-137). Contado o crédito; crédito exige cuotas que sumen el total, con fechas posteriores a la emisión.
  - Boleta: serie `B###`; sin adquirente → «Clientes varios» con documento `0` (TR-CA-139); total > umbral sin documento y nombre → rechazo (TR-CA-140); igual al umbral → se emite (TR-CA-141). Umbral en el parámetro `plat.fe.boleta_monto_identificacion` (700).
  - Códigos de unidad, afectación, moneda (`PEN`, `USD`) y tipo de documento validados con CAT **antes** de numerar.
- TR-RN-019: el RUC del adquirente se consulta en el padrón; si no está `ACTIVO` o está `NO HABIDO`, se emite igual y la respuesta trae `advertencias[]`. Padrón sin datos o caído: se emite sin advertencia.
- Emisor habilitado: `VERIFICADO` (beta) o `PRODUCCION`; otro estado → 409.
- Serie: el llamador envía `sucursalId` y, opcionalmente, `serie`; sin `serie`, FE toma la única serie activa de ese tipo en la sucursal (varias → 422 «Indique la serie»). Serie de otra sucursal → 422.
- Numeración con `CORRELATIVO_PORT` al final de la transacción.
- Idempotencia por `(tenant, clave_idempotencia)`: la misma clave devuelve el comprobante existente sin otro número (TR-CA-138); la misma clave con otro contenido → 409.
- Dos entradas al mismo caso de uso: `ComprobantePort.emitir` en proceso (productos del monorepo, en su transacción) y `POST /v1/fe/comprobantes` con cabecera `Idempotency-Key` (productos externos). `GET /v1/fe/comprobantes/{id}` para leer lo emitido.
- Inmutabilidad (TR-RN-022): trigger que impide cambiar montos, líneas, cuotas, número y adquirente de un comprobante; solo el estado y los datos de respuesta cambian (los usa el 52).
- Evento `cpe.emitido` por outbox con esquema registrado. Auditoría de la emisión por HTTP.
- Permiso `plat.fe.emitir` en el manifiesto `1.29.0`, en `PLAT_PROPIETARIO`; parámetro `plat.fe.boleta_monto_identificacion` en el manifiesto.
- `CORRELATIVO_PORT` y una lectura de series activas por sucursal accesibles desde FE: `comp('fe', ..., 'seq')` en la matriz y `SERIES_ACTIVAS_PORT` exportado por `correlativos`.
- Migración `db/01u_fe_comprobante.sql` con inverso y prueba SQL.

**No entra (specs futuros):**

- Envío al PSE, cola del worker, CDR en ARC, estados `ENVIADO`/`ACEPTADO`/`RECHAZADO`, `cpe.aceptado` y `cpe.rechazado` (spec 52). Aquí el comprobante queda `PENDIENTE_ENVIO`.
- Notas de crédito y débito (54), resumen diario y baja (55), reintentos y contingencia (56), PDF y QR (53), entrega por correo (59), monitor y su permiso `plat.fe.monitorear` (57, 58).
- UBL y firma propios (51b, condicional; Nubefact genera y firma).
- Adquirente como persona de TR-PER: solo se guarda `persona_id` opcional sin validarlo.
- Descuentos globales, anticipos, detracciones, percepciones, ICBPER, exportación y otros tributos (cat. 05 distintos de IGV).
- Modo `RESUMEN` para boletas: el campo se guarda (`INDIVIDUAL` por defecto) y el 55 lo usa.
- Moneda distinta de `PEN` con tipo de cambio: `USD` se acepta y se guarda sin conversión.
- Integración de SazónPOS (CC-09).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `comprobantes` (49, 50: `Emisor`, repositorio, `regimen-igv`, `DocumentoElectronico`, eventos y esquemas) | Se amplía con `Comprobante`; `DocumentoElectronico` se arma desde el comprobante en el 52. |
| `correlativos` (`CORRELATIVO_PORT`) | Número en la misma transacción; se exporta además `SERIES_ACTIVAS_PORT`. |
| `catalogos` (`CATALOGO_PORT.validarItem`, vigencia) | Códigos SUNAT y tasa de IGV vigente. |
| `parametros` (`PARAMETRO_PORT`) | Umbral de boleta. |
| `org` (`PADRON_RUC`) | Estado y condición del RUC del adquirente. |
| `seguridad` (`@Permiso`), `auditoria` (`@Auditable`) | Autorización y auditoría del `POST`. |
| `kernel` / `kernel-infra` (`UnitOfWork`, `OutboxPublisher`, `Clock`, `uuidV7`) | Transacción, evento, ids. |
| `catalogos` (19e, bloqueo optimista) y `notificaciones` (42, idempotencia por clave) | Patrones de `version` y de clave repetida. |

## Modelo de datos

### Migración `db/01u_fe_comprobante.sql` (+ `db/rollback/01u_fe_comprobante.sql`, `db/tests/01u_fe_comprobante.test.sql`)

```sql
CREATE TABLE fe.comprobante (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid NOT NULL,
  empresa_id               uuid NOT NULL,
  sucursal_id              uuid NOT NULL,
  emisor_id                uuid NOT NULL REFERENCES fe.emisor(id),
  tipo                     char(2)     NOT NULL CHECK (tipo IN ('01','03')),          -- 07 y 08 en el spec 54
  serie                    char(4)     NOT NULL,
  numero                   bigint      NOT NULL CHECK (numero BETWEEN 1 AND 99999999),
  fecha_emision            date        NOT NULL,
  moneda                   char(3)     NOT NULL CHECK (moneda IN ('PEN','USD')),
  forma_pago               varchar(7)  NOT NULL CHECK (forma_pago IN ('CONTADO','CREDITO')),
  adquirente_tipo_doc      varchar(10) NOT NULL,                                       -- código interno de TIPO_DOC_IDENTIDAD
  adquirente_numero        varchar(15) NOT NULL,
  adquirente_nombre        varchar(200) NOT NULL,
  adquirente_correo        varchar(254),
  adquirente_persona_id    uuid,
  regimen_igv              varchar(24) NOT NULL,
  tasa_igv                 numeric(5,4) NOT NULL,
  total_gravado            numeric(14,2) NOT NULL,
  total_exonerado          numeric(14,2) NOT NULL,
  total_inafecto           numeric(14,2) NOT NULL,
  igv                      numeric(14,2) NOT NULL,
  total                    numeric(14,2) NOT NULL CHECK (total >= 0),
  modo_envio               varchar(10) NOT NULL DEFAULT 'INDIVIDUAL' CHECK (modo_envio IN ('INDIVIDUAL','RESUMEN')),
  estado                   varchar(26) NOT NULL CHECK (estado IN
                             ('PENDIENTE_ENVIO','ENVIADO','ACEPTADO','ACEPTADO_CON_OBSERVACIONES','RECHAZADO','ANULADO')),
  advertencias             jsonb NOT NULL DEFAULT '[]',
  origen_producto          varchar(10),
  origen_id                varchar(100),
  clave_idempotencia       uuid NOT NULL,
  huella_solicitud         varchar(64) NOT NULL,                                       -- SHA-256 de la solicitud normalizada
  version                  integer NOT NULL DEFAULT 1,
  creado_por               uuid,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  modificado_en            timestamptz,
  CONSTRAINT uq_comprobante_numero UNIQUE (tenant_id, empresa_id, tipo, serie, numero),
  CONSTRAINT uq_comprobante_idempotencia UNIQUE (tenant_id, clave_idempotencia),
  CONSTRAINT ck_comprobante_serie CHECK ((tipo = '01' AND serie ~ '^F[A-Z0-9]{3}$') OR (tipo = '03' AND serie ~ '^B[A-Z0-9]{3}$'))
);

CREATE TABLE fe.comprobante_linea (
  comprobante_id   uuid NOT NULL REFERENCES fe.comprobante(id),
  tenant_id        uuid NOT NULL,
  orden            smallint NOT NULL CHECK (orden >= 1),
  codigo           varchar(30),
  descripcion      varchar(500) NOT NULL,
  unidad           varchar(3)  NOT NULL,
  cantidad         numeric(14,4) NOT NULL CHECK (cantidad > 0),
  valor_unitario   numeric(14,4) NOT NULL CHECK (valor_unitario >= 0),
  afectacion_igv   char(2) NOT NULL,
  valor_venta      numeric(14,2) NOT NULL,
  igv              numeric(14,2) NOT NULL,
  precio_unitario  numeric(14,4) NOT NULL,
  PRIMARY KEY (comprobante_id, orden)
);

CREATE TABLE fe.comprobante_cuota (
  comprobante_id     uuid NOT NULL REFERENCES fe.comprobante(id),
  tenant_id          uuid NOT NULL,
  numero             smallint NOT NULL CHECK (numero >= 1),
  monto              numeric(14,2) NOT NULL CHECK (monto > 0),
  fecha_vencimiento  date NOT NULL,
  PRIMARY KEY (comprobante_id, numero)
);
```

- Trigger `fe.proteger_comprobante` (TR-RN-022): `BEFORE UPDATE` en `fe.comprobante` rechaza cambios en cualquier columna salvo `estado`, `version` y `modificado_en` (el 52 agrega sus columnas de respuesta a la lista); `BEFORE UPDATE OR DELETE` en líneas y cuotas, y `BEFORE DELETE` en el comprobante, siempre rechazan.
- RLS `ENABLE + FORCE` por `app.tenant_id` en las tres tablas; `REVOKE` a `anon, authenticated`.
- Semilla: catálogo GLOBAL `TASA_IGV` con `GENERAL` (`tasa = 0.18`, vigente desde 2011-03-01) y `REDUCIDO_RESTAURANTES` (`tasa = 0.10` vigente en 2026 por la Ley 31556 y sus prórrogas; el valor y su vigencia se verifican contra la norma al implementar y antes de producción).
- Inverso: borra trigger, tablas e ítems. Se niega si hay comprobantes.
- Prueba SQL: número duplicado y clave repetida fallan; serie `B001` con tipo `01` falla; cambiar `total` o borrar una línea falla; cambiar `estado` pasa; aislamiento con dos `app.tenant_id`.

### Dominio (`libs/plataforma/comprobantes/src/domain/comprobante/`)

- `dinero.ts`: aritmética decimal sin `number` de coma flotante (enteros en céntimos o diezmilésimos, o `decimal.js` si el cálculo lo pide; se decide en el paso 2 y se anota). `redondear2` mitad hacia arriba.
- `adquirente.ts`: `Adquirente { tipoDocumento; numero; nombre; correo?; personaId? }`; `CLIENTES_VARIOS` (`DOC_0`, `0`, «CLIENTES VARIOS»).
- `linea-comprobante.ts`: `calcularLinea(entrada, tasa)` → `valorVenta = redondear2(cantidad × valorUnitario)`; IGV solo si la afectación es gravada (atributo del catálogo 07); `precioUnitario` con IGV.
- `totales.ts`: suma por tipo de afectación, IGV total, total; `verificarTotalEsperado(total, esperado)` con `TOLERANCIA_SOLES = 0.01`.
- `reglas-factura.ts` y `reglas-boleta.ts`: TR-RN-017 (serie por tipo), TR-RN-018 (umbral), factura con RUC, cuotas que suman el total.
- `comprobante.ts`: agregado `Comprobante.emitir(datos, tasa, umbral, numero)` con estado `PENDIENTE_ENVIO`; levanta `cpe.emitido`.
- `huella-solicitud.ts`: SHA-256 de la solicitud normalizada para distinguir «misma clave, mismo contenido» de «misma clave, otro contenido».
- `errores.ts` suma (código HTTP entre paréntesis): `FacturaRequiereRucError` (422, «La factura requiere RUC del adquirente»), `BoletaRequiereAdquirenteError` (422, «Boletas mayores a S/ 700,00 requieren documento y nombre del adquirente», con el umbral vigente en el texto), `SerieNoCorrespondeError` (422), `SerieAmbiguaError` (422 «Indique la serie»), `CodigoSunatInvalidoError` (422, con campo y código), `CuotasInvalidasError` (422), `TotalNoCoincideError` (422), `EmisorNoHabilitadoError` (409), `IdempotenciaConflictoError` (409), `ComprobanteNoEncontradoError` (404).
- `eventos-fe.ts` suma `cpe.emitido`: `{ comprobante_id, tipo, serie, numero, total, moneda, estado, origen_producto, origen_id }`, sin datos del adquirente.

### Puertos

```ts
// application/ports/comprobante.port.ts — exportado en index.ts, como CORRELATIVO_PORT
export const COMPROBANTE_PORT = Symbol('ComprobantePort');
export interface EmitirComprobanteComando {
  tipo: 'FACTURA' | 'BOLETA';
  empresaId: string;
  sucursalId: string;
  serie?: string;
  moneda: 'PEN' | 'USD';
  formaPago: 'CONTADO' | 'CREDITO';
  cuotas?: { monto: string; fechaVencimiento: string }[];
  adquirente?: { tipoDocumento: string; numero: string; nombre: string; correo?: string; personaId?: string };
  lineas: { codigo?: string; descripcion: string; unidad: string; cantidad: string; valorUnitario: string; afectacionIgv: string }[];
  totalEsperado?: string;
  modoEnvio?: 'INDIVIDUAL' | 'RESUMEN';
  origen?: { producto: string; id: string };
  claveIdempotencia: string;
}
export interface ComprobanteEmitido {
  comprobanteId: string; serie: string; numero: number; numeroFormateado: string;
  estado: 'PENDIENTE_ENVIO'; totales: { gravado: string; exonerado: string; inafecto: string; igv: string; total: string };
  advertencias: { codigo: string; mensaje: string }[];
  repetido: boolean;
}
/** TR-RF-053 y 054. Tenant del TenantContext; se une a la transacción del llamador. Montos como texto decimal. */
export interface ComprobantePort { emitir(comando: EmitirComprobanteComando): Promise<ComprobanteEmitido>; }

// libs/plataforma/correlativos/src/application/ports/series-activas.port.ts
export const SERIES_ACTIVAS_PORT = Symbol('SeriesActivasPort');
export interface SeriesActivasPort { deSucursal(sucursalId: string, tipo: TipoDocumento): Promise<string[]>; }
```

`TasaIgv.vigente(regimen, fecha)` (adaptador sobre `CATALOGO_PORT`), `UmbralBoleta.valor(empresaId, sucursalId)` (sobre `PARAMETRO_PORT`) y `RepositorioComprobantes` (`porClave`, `porId`, `guardar`) en `application/ports`.

### Caso de uso `EmitirComprobante` (`application/emitir-comprobante.ts`)

Orden dentro de la transacción (la del llamador o la del `UnitOfWork` en HTTP):

1. `porClave(claveIdempotencia)`: existe y la huella coincide → devuelve con `repetido: true`; huella distinta → `IdempotenciaConflictoError`.
2. Emisor de la empresa en `VERIFICADO` o `PRODUCCION`.
3. Serie: la enviada (debe estar entre las activas de la sucursal) o la única activa del tipo.
4. Validar códigos con CAT (unidad, afectación, moneda, tipo de documento) y reglas del tipo; consultar padrón si es factura (advertencias).
5. Tasa vigente por régimen y fecha de emisión (Lima); umbral de boleta; calcular.
6. **Al final**, `CORRELATIVO_PORT.siguiente`; armar el agregado, guardar y publicar `cpe.emitido`.

Una carrera con la misma clave en paralelo la resuelve `uq_comprobante_idempotencia`: el perdedor revierte (sin consumir número) y relee el existente.

### HTTP (`interface/comprobantes.controller.ts`, bajo `/v1/fe`)

| Método y ruta | Permiso | Respuestas |
| --- | --- | --- |
| `POST /comprobantes` (cabecera `Idempotency-Key` uuid obligatoria) | `plat.fe.emitir` | 201 `ComprobanteEmitido`; 200 si `repetido`; 400 validación del DTO; 409 `EMISOR_NO_HABILITADO`, `IDEMPOTENCIA_CONFLICTO`; 422 los errores normativos; 404 empresa o sucursal de otro tenant. |
| `GET /comprobantes/{id}` | `plat.fe.emitir` | 200 detalle con líneas, cuotas y advertencias; 404. |

- `plat.fe.emitir`: no sensible (la caja emite sin aal2), `TENANT`, en `PLAT_PROPIETARIO`.
- OpenAPI con los códigos de error y un ejemplo por tipo.

### Composición

- `ComprobantesModule.register()` suma `EmitirComprobante`, `COMPROBANTE_PORT`, el controlador y los adaptadores de tasa y umbral.
- `CorrelativosModule` provee `SERIES_ACTIVAS_PORT` (TypeORM sobre `seq.serie`).
- `eslint.config.mjs`: `comp('fe', ..., 'seq')` con su comentario; `tools/boundaries-test` lo comprueba.
- `plat.manifiesto.json` `1.28.0` → `1.29.0`: permiso `plat.fe.emitir` («Emitir comprobantes electrónicos», cita TR-RF-053/054) y parámetro `plat.fe.boleta_monto_identificacion` (decimal, por defecto `700.00`, alcance empresa). Se aplica con el CLI del manifiesto.
- `src/index.ts`: `COMPROBANTE_PORT`, tipos del comando y la respuesta y errores, por ruta explícita.

## Plan de implementación

1. **Migración.** `01u_fe_comprobante.sql` con trigger, RLS, semilla de `TASA_IGV`, inverso y prueba SQL.
2. **Dominio de cálculo.** `dinero`, `linea-comprobante`, `totales`, con pruebas: TR-CA-136 (S/ 100,00 → IGV 18,00, total 118,00), redondeo por línea, exonerado e inafecto sin IGV, tasa reducida, tolerancia de S/ 0,01.
3. **Reglas y agregado.** Reglas de factura y boleta, `Comprobante`, huella y errores, con pruebas: TR-CA-137, 139, 140, 141, cuotas que no suman, serie de tipo equivocado.
4. **SEQ y matriz.** `SERIES_ACTIVAS_PORT` en `correlativos`, `comp:fe` con `seq`, `boundaries-test`.
5. **Persistencia y caso de uso.** Repositorio TypeORM, adaptadores de tasa, umbral y padrón, `EmitirComprobante`. Integración: TR-CA-136 de punta a punta con F001 en 99 → F001-00000100; TR-CA-138 misma clave sin otro número; misma clave con otro contenido → 409; código de afectación inexistente → 422 sin consumir número; rollback del llamador sin consumir número; aislamiento.
6. **HTTP y manifiesto.** Controlador, DTO, OpenAPI, `@Permiso`, `@Auditable`, manifiesto `1.29.0`.
7. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` y el CLI del manifiesto en dev; humo con la API local en una empresa de dev con emisor `SIMULADO` `VERIFICADO`: factura a un RUC, boleta sin adquirente, boleta de S/ 850 sin adquirente (422) y repetición de una clave; `npx nx run-many -t lint test -p comprobantes correlativos api migrar boundaries-test`.

## Criterios de aceptación

- [ ] TR-CA-136: serie F001 con último 99; factura a RUC 20512345678 con 2 líneas y valor de venta S/ 100,00 → F001-00000100, IGV 18,00, total 118,00, `PENDIENTE_ENVIO`.
- [ ] TR-CA-137: factura con adquirente DNI → 422 «La factura requiere RUC del adquirente».
- [ ] TR-CA-138: la misma `Idempotency-Key` devuelve la misma factura (200, `repetido: true`) y el correlativo no avanza; misma clave con otro contenido → 409 `IDEMPOTENCIA_CONFLICTO`.
- [ ] TR-CA-139: boleta de S/ 45,50 sin adquirente → «CLIENTES VARIOS» con documento `0`.
- [ ] TR-CA-140: boleta de S/ 850,00 sin adquirente → 422 con el texto del umbral.
- [ ] TR-CA-141: boleta de exactamente S/ 700,00 sin adquirente → se emite.
- [ ] TR-RN-019: RUC con estado distinto de `ACTIVO` o condición `NO HABIDO` → se emite y `advertencias` lo indica; padrón sin datos → se emite sin advertencia.
- [ ] Unidad, afectación, moneda o tipo de documento inexistentes en CAT → 422 con el campo, sin consumir número.
- [ ] Crédito sin cuotas, con cuotas que no suman el total o con vencimiento no posterior a la emisión → 422 `CUOTAS_INVALIDAS`.
- [ ] `totalEsperado` que difiere en más de S/ 0,01 del calculado → 422; en S/ 0,01 o menos → se emite con el calculado.
- [ ] La tasa de IGV es la vigente a la fecha de emisión según el régimen del emisor (prueba con dos vigencias de `REDUCIDO_RESTAURANTES`).
- [ ] Emisor en `BORRADOR` o `CONFIGURADO` → 409 `EMISOR_NO_HABILITADO`.
- [ ] Serie de otra sucursal → 422; sucursal con dos series activas del tipo y sin `serie` → 422 «Indique la serie».
- [ ] Rollback de la transacción del llamador no consume número (TR-CA-095 desde FE).
- [ ] TR-RN-022: cambiar montos, líneas, cuotas o adquirente de un comprobante, o borrarlo, falla en la base (prueba SQL); cambiar el estado pasa.
- [ ] `cpe.emitido` se publica una vez por comprobante, con esquema registrado y sin datos del adquirente.
- [ ] Sin `plat.fe.emitir` → 403. `POST` deja fila en `aud` (TR-RNF-013).
- [ ] TR-RNF-001: `POST` p95 < 800 ms en dev con el padrón respondiendo desde caché (medido en el humo; el envío al PSE no está en la petición).
- [ ] Aislamiento (TR-RNF-010): otro tenant no lee ni numera sobre la empresa (404); prueba SQL con dos `app.tenant_id`.
- [ ] Manifiesto `1.29.0` aplicado en dev: `PLAT_PROPIETARIO` tiene `plat.fe.emitir` y el parámetro existe con 700.00.
- [ ] OpenAPI documenta las dos rutas con sus códigos de error.
- [ ] Migración `01u_fe_comprobante` reversible y probada en CI contra PostgreSQL 16.
- [ ] Cobertura de dominio de `comprobantes` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, sin SQL crudo nuevo (solo el trigger, en la migración).
- [ ] `npx nx run-many -t lint test -p comprobantes correlativos api migrar boundaries-test` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** registro síncrono (número, cálculo, `PENDIENTE_ENVIO`) y envío asíncrono en el 52. Decisión del usuario. La caja necesita el número al instante; el PSE no entra en la petición (TR-RNF-001).
- **Sí:** dos entradas al mismo caso de uso, puerto en proceso y `POST` con `Idempotency-Key`. Decisión del usuario. SazónPOS vive en otro repo (ADR-31) y no comparte transacción.
- **No:** número pedido en el worker desde el outbox (T-S3). La caja no tendría el número para imprimir; T-S3 se considera desactualizado.
- **Sí:** tasa de IGV en el catálogo `TASA_IGV` con vigencia y umbral de boleta como parámetro. Decisión del usuario. La tasa reducida cambia por año y CAT ya resuelve vigencias.
- **Sí:** adquirente como valor embebido con `persona_id` opcional. Decisión del usuario. FE no espera a TR-PER.
- **Sí:** TR-RN-019 advierte, no bloquea; padrón caído no impide emitir. Decisión del usuario (la RN dice «advertir»; TR-RNF-007).
- **Sí:** eventos con el nombre del SRS (`cpe.*`).
- **Sí:** FE resuelve la serie de la sucursal si el llamador no la envía. Respeta TR-CA-136 y evita que el producto conozca las series.
- **Sí:** `GET` del comprobante con `plat.fe.emitir`. Quien emite puede leer lo que emitió; el monitor con su permiso llega en el 57.
- **Sí:** `plat.fe.emitir` no sensible. La caja emite sin step-up.
- **Sí:** huella de la solicitud junto a la clave. Distingue un reintento legítimo de un error del llamador.
- **Sí:** solo tributo IGV. Otros tributos del cat. 05 no tienen consumidor en R2.
- **Sí:** `comp:fe` depende de `seq`. PL-10 pone SEQ antes de FE; faltaba en la matriz.
- **Sí:** migración `01u` (el 44 usa `01s` y el 45 `01t`, en paralelo).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Estimado de 9-10 h al límite | Corte natural: el `GET` y el umbral parametrizado pasan a un 51c; el `POST` y el puerto no se recortan. |
| Tasa reducida de restaurantes mal cargada | Se verifica contra la norma vigente al implementar; vive en el catálogo y se corrige sin código. |
| Aritmética de punto flotante en montos | `Dinero` con enteros o `decimal.js`; pruebas con casos de redondeo en el borde (,005). |
| Nubefact exige campos que este modelo no guarda | El 52 arma `DocumentoElectronico` desde el comprobante; se revisa contra el mapeo de `mapeo-nubefact.ts` en el paso 3 y lo que falte se agrega aquí. |
| Bloqueo de la serie por padrón lento | El padrón se consulta antes de pedir el número; el número va al final de la transacción. |
| Ramas paralelas 44 y 45 | No comparten archivos con este spec salvo `package.json` si hiciera falta `decimal.js`; manifiesto solo aquí. |

## Lo que **no** entra en este spec

- Envío al PSE y CDR (spec 52).
- Notas, resumen y baja (54, 55); reintentos y contingencia (56); PDF (53); entrega (59); monitor (57, 58).
- UBL y firma propios (51b).
- Otros tributos, descuentos, anticipos y tipo de cambio.
- Integración de SazónPOS (CC-09).

Cada uno, si llega, va en su propio spec.
