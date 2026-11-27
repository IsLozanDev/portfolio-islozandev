# SPEC 53 — Facturación electrónica: representación impresa en PDF A4 y ticket de 80 mm con QR, guardada en ARC

> **Status:** Aprobado
> **Depends on:** SPEC 51, SPEC 52, SPEC 33, SPEC 49, SPEC 17d
> **Date:** 2026-11-26
> **Objective:** Agregar a `libs/plataforma/comprobantes` el endpoint `GET /v1/fe/comprobantes/{id}/representacion?formato=A4|TICKET80`, que arma la representación impresa (emisor con logo y contacto, adquirente, líneas, totales, monto en letras, leyendas y QR), la genera en PDF con pdfkit, la guarda en TR-ARC y la devuelve como URL firmada (A4) o como bytes (ticket).

## Por qué existe este spec

Fila 53 de `docs/roadmap-specs.md` (R2-06: TR-RF-061). Contexto: `docs/spec-context/tr-fe/fe-representacion-impresa.md`. Lo consumen la entrega por correo (59), el monitor (58) y la caja de SazónPOS (CC-09).

Lo que hay en el código hoy (revisado al redactar):

- `comprobantes` (51, 52): `fe.comprobante` con emisor, sucursal, adquirente (`adquirente_tipo_doc`, `adquirente_numero`, `adquirente_nombre`), totales, moneda, forma de pago, líneas (`fe.comprobante_linea`) y cuotas (`fe.comprobante_cuota`).
  - El 52 suma `hash`, `xml_archivo_id`, `cdr_archivo_id` y `respondido_en`. El hash existe solo después del envío: el adaptador SUNAT firma en el worker del 52.
  - El trigger `fe.proteger_comprobante` rechaza cambios desde un estado final.
- `ConsultarComprobante` y `GET /v1/fe/comprobantes/{id}` con `plat.fe.emitir` y `X-Sucursal-Id`.
- `domain/monto-en-letras.ts` (51) ya convierte importes en PEN y USD.
- `EmpresaEmisoraPort` (49) con `ruc`, `razonSocial`, `nombreComercial` y `domicilioFiscal`. El spec 17d suma a `org.empresa` `logo_archivo_id`, `telefono`, `correo` y `sitio_web`, y valida el logo al asignarlo.
- `CatalogosSunat.codigoSunatTipoDocumento` (cat. 06) para el tipo de documento del adquirente en el QR.
- `fe.emisor.leyenda_pie` (49). El logo no va en `fe.emisor`: es de la empresa (17d).
- ARC (33, 52):
  - `ARCHIVO_SISTEMA_PORT.guardar` (bytes del servidor, nacen `DISPONIBLE`);
  - `ArchivoPort.urlDescarga` (60 a 900 s) y `ArchivoPort.estado` (con `categoria`);
  - `AlmacenArchivos.leer`, interno de ARC.
  - Categorías: `IMAGEN` (jpeg, png, webp), `DOCUMENTO` (sensible), `CPE_XML`. No hay una para el PDF del comprobante.
- No hay ninguna librería de PDF ni de QR en `package.json`.
- Manifiesto PLAT en `1.30.0`; `plat.fe.*` en `PLAT_PROPIETARIO` y `PLAT_ENCARGADO_FACTURACION` (este sin `plat.fe.emitir`).
- Última letra de migración: `01x`. El 46, en paralelo, usa `01y`; este, `01z`.

## Alcance

**Entra:**

- **Modelo de la representación** (dominio puro): emisor, adquirente, líneas, totales, monto en letras, leyendas, cuotas si es a crédito, hash y cadena del QR.
- **Cadena del QR** con los 10 campos de TR-RF-061 separados por `|`: RUC, tipo, serie, número, IGV, total, fecha (`AAAA-MM-DD`), tipo de documento SUNAT del adquirente, número de documento del adquirente y hash.
  - Adquirente sin documento (clientes varios, como lo registra el 51): tipo y número vacíos.
  - Sin hash todavía: el último campo vacío.
- **Puerto `GeneradorRepresentacion.generar(modelo, formato) → Uint8Array`** con un adaptador pdfkit 0.21 y qrcode 1.5.4 (MIT):
  - **A4:** página A4 vertical.
  - **TICKET80:** 80 mm de ancho (72 mm útiles) y alto calculado según el contenido.
- **Logo y contacto de la empresa** (columnas del spec 17d):
  - `EmpresaEmisoraPort` suma `logoArchivoId`, `telefono`, `correo` y `sitioWeb`;
  - el logo se lee de ARC con `ArchivoSistemaPort.leer`; 17d ya garantiza `IMAGEN`, jpeg o png y hasta 1 MB;
  - sin logo, o si su lectura falla, se usa el nombre comercial, y si no lo hay, la razón social (TR-CA-156);
  - teléfono, correo y web se imprimen bajo el domicilio fiscal solo si existen; el teléfono viene en E.164 y se imprime con `formatoTelefono` de ORG («987 654 321», «(01) 555-0101»).
- **Caché en ARC.** Tabla `fe.representacion` con una fila por comprobante y formato, que guarda el archivo y su huella (estado impreso, hash y versión de la plantilla). Si la huella no cambió, se devuelve el archivo guardado. Si cambió (llegó el hash, quedó `ANULADO`, cambió la plantilla), se regenera y se guarda un archivo nuevo.
- **Categoría ARC `CPE_PDF`** (`application/pdf`, 5 MB, no sensible) y `ArchivoSistemaPort.leer(archivoId)` para leer bytes del tenant desde el servidor: el logo y el ticket guardado.
- **Endpoint `GET /v1/fe/comprobantes/{id}/representacion?formato=A4|TICKET80`** con `plat.fe.pdf` y `X-Sucursal-Id`:
  - **A4:** `200 { url, expiraEn }`, URL firmada de ARC de 900 s, `attachment` con nombre `F001-00000123.pdf` (TR-RN-027);
  - **TICKET80:** `200 application/pdf` en línea, para imprimir al instante (TR-RNF-001).
- **Estados que se imprimen:**
  - `PENDIENTE_ENVIO` y `ENVIADO`: sin hash;
  - `ACEPTADO` y `ACEPTADO_CON_OBSERVACIONES`: con hash;
  - `ANULADO`: con marca de agua «ANULADO»;
  - `RECHAZADO`: `409 COMPROBANTE_RECHAZADO`, porque un comprobante rechazado no vale ante SUNAT.
- Permiso `plat.fe.pdf` (no sensible) en el manifiesto `1.31.0`, en `PLAT_PROPIETARIO` y `PLAT_ENCARGADO_FACTURACION`.
- Migraciones `db/01z_arc_categoria_cpe_pdf.sql` y `db/01z_fe_representacion.sql`, con inversos y pruebas SQL.

**No entra (specs futuros):**

- ESC/POS, impresión directa en térmica y apertura de cajón: TR-EDGE (R4, spec 133). TR-CA-155 se reformula para R2.
- Firmar al emitir para tener el hash desde la caja: cambia 51 y 52; va en su propio spec si la caja lo exige.
- Generar el PDF al aceptar (T-S3) en el worker: aquí se genera al primer pedido.
- Envío por correo con el PDF adjunto (spec 59).
- Consulta pública del comprobante por QR o enlace (pendientes de FE).
- Asignar el logo y los datos de contacto, con su validación y su UI: spec 17d, en el formulario de la empresa.
- Notas de crédito y débito (spec 54): su representación se suma cuando existan.
- Representación de boletas del resumen diario con su hash (spec 55).
- Plantillas personalizables por tenant (colores, disposición).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `monto-en-letras.ts` (51) | Leyenda «SON: …» sin cambios. |
| `ConsultarComprobante` y `RepositorioComprobantes` (51) | Comprobante con líneas, cuotas y respuesta del 52. |
| `EmpresaEmisoraPort` (49, ampliado por 17d) | RUC, razón social, nombre comercial, domicilio fiscal, logo, teléfono, correo y web. |
| `CatalogosSunat.codigoSunatTipoDocumento` (51) | Tipo SUNAT del adquirente en el QR. |
| `ARCHIVO_SISTEMA_PORT.guardar` (52) | Guarda el PDF generado. |
| `ArchivoPort.urlDescarga` (33) | URL firmada del A4. |
| `escritor-auditoria.xlsx.ts` (20b) | Molde del adaptador que genera bytes en memoria. |
| `ComprobantesController` (51) | Se amplía con la ruta nueva. |

## Modelo de datos

### Migración `db/01z_arc_categoria_cpe_pdf.sql` (+ rollback y prueba)

```sql
INSERT INTO arc.categoria (codigo, mimes_permitidos, tamano_max_bytes, sensible)
VALUES ('CPE_PDF', ARRAY['application/pdf'], 5242880, false);
```

Inverso: borra la categoría. Se niega si hay archivos `CPE_PDF`.

### Migración `db/01z_fe_representacion.sql` (+ rollback y prueba)

```sql
CREATE TABLE fe.representacion (
  tenant_id       uuid        NOT NULL,
  comprobante_id  uuid        NOT NULL,
  formato         varchar(8)  NOT NULL CHECK (formato IN ('A4','TICKET80')),
  huella          char(64)    NOT NULL CHECK (huella ~ '^[0-9a-f]{64}$'),
  archivo_id      uuid        NOT NULL,
  generado_en     timestamptz NOT NULL DEFAULT now(),
  version         integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (tenant_id, comprobante_id, formato),
  CONSTRAINT fk_representacion_comprobante FOREIGN KEY (comprobante_id) REFERENCES fe.comprobante (id)
);
```

- RLS `ENABLE + FORCE` por `app.tenant_id`; `REVOKE` a `anon, authenticated` (regla 8).
- `huella` = SHA-256 de `estado impreso | hash | VERSION_PLANTILLA_REPRESENTACION`. El estado impreso agrupa `PENDIENTE_ENVIO` y `ENVIADO` como «sin respuesta», para no regenerar por un cambio que no se ve.
- Inverso: borra la tabla. Prueba SQL: PK por comprobante y formato; aislamiento con dos `app.tenant_id`.

### Dominio (`libs/plataforma/comprobantes/src/domain/representacion/`)

- `formato-representacion.ts`: `FORMATOS_REPRESENTACION = ['A4', 'TICKET80']`.
- `representacion-impresa.ts`: `RepresentacionImpresa` (datos listos para dibujar, sin dependencias):
  - `emisor { ruc; razonSocial; nombreComercial; domicilioFiscal; telefono; correo; sitioWeb; logo: Uint8Array | null }`;
  - `titulo` («FACTURA ELECTRÓNICA» o «BOLETA DE VENTA ELECTRÓNICA»), `serieNumero` (`F001-00000123`), `fechaEmision`, `moneda`, `formaPago`;
  - `adquirente`, `lineas`, `totales`, `cuotas`;
  - `leyendas` y `hash`;
  - `cadenaQr` y `marcaAgua: 'ANULADO' | null`.
- `armar-representacion.ts`: `armarRepresentacion(comprobante, empresa, emisor, tipoDocumentoSunat, logo)`. Leyendas, en orden:
  1. «SON: CIENTO DIECIOCHO CON 00/100 SOLES» (cat. 52, código 1000);
  2. «Representación impresa de la [factura/boleta de venta] electrónica»;
  3. «Consulte su comprobante en www.sunat.gob.pe»;
  4. `leyenda_pie` del emisor, si existe.
- `cadena-qr.ts`: `cadenaQr(datos)` (función pura).
- `huella-representacion.ts`: `huellaRepresentacion(estado, hash)` y `VERSION_PLANTILLA_REPRESENTACION = 1`.
- `errores.ts` suma:
  - `ComprobanteRechazadoError` (`COMPROBANTE_RECHAZADO`);
  - `FormatoRepresentacionInvalidoError`.
- `permisos-fe.ts`: `PERMISOS_FE.pdf = 'plat.fe.pdf'`.

### Puertos (`application/ports/`)

```ts
export interface GeneradorRepresentacion {
  /** PDF en memoria. A4 en página A4; TICKET80 a 80 mm de ancho con alto según el contenido. */
  generar(representacion: RepresentacionImpresa, formato: FormatoRepresentacion): Promise<Uint8Array>;
}

export interface RepositorioRepresentaciones {
  obtener(comprobanteId: string, formato: FormatoRepresentacion): Promise<RepresentacionGuardada | null>;
  /** Inserta o reemplaza la fila del comprobante y formato. */
  guardar(representacion: RepresentacionGuardada): Promise<void>;
}

/** Puente a TR-ARC, como ArchivosCpe del 52. */
export interface ArchivosRepresentacion {
  guardarPdf(comprobanteId: string, nombre: string, pdf: Uint8Array): Promise<string>;
  leer(archivoId: string): Promise<Uint8Array>;
  urlDescarga(archivoId: string, nombre: string): Promise<{ url: string; expiraEn: Date }>;
}
```

ARC (`archivo-sistema.port.ts`, se amplía): `leer(archivoId): Promise<Uint8Array>` devuelve la versión vigente de un archivo `DISPONIBLE` del tenant del contexto, o `ArchivoNoEncontradoError`.

### Casos de uso (`application/representacion/`)

- `ObtenerRepresentacion(comprobanteId, formato)`:
  1. Lee el comprobante del tenant (`ComprobanteNoEncontradoError` → 404, también si es de otro tenant). `RECHAZADO` → `ComprobanteRechazadoError`.
  2. Calcula la huella y, si la fila guardada coincide, usa su archivo.
  3. Si no hay fila o la huella cambió, genera el PDF:
     - lee empresa, emisor, logo (si falla la lectura del logo, usa el nombre: no bloquea la impresión) y el tipo SUNAT del adquirente;
     - arma el modelo y genera el PDF;
     - lo guarda en ARC (`CPE_PDF`, entidad `CPE`, id del comprobante) y reemplaza la fila.
  4. A4: devuelve la URL firmada. TICKET80: devuelve los bytes (los recién generados o los leídos de ARC).
  - Sin transacción larga: la generación y la subida van fuera de la transacción; solo el reemplazo de la fila va en una.

### HTTP

| Método y ruta | Permiso | Respuesta | Errores |
| --- | --- | --- | --- |
| `GET /v1/fe/comprobantes/{id}/representacion?formato=A4` | `plat.fe.pdf` | `200 { url, expiraEn }` | `400 SOLICITUD_INVALIDA`, `404 COMPROBANTE_NO_ENCONTRADO`, `409 COMPROBANTE_RECHAZADO` |
| `GET /v1/fe/comprobantes/{id}/representacion?formato=TICKET80` | `plat.fe.pdf` | `200 application/pdf` (`inline; filename=B002-00000125.pdf`) | ídem |

OpenAPI completo en las dos.

### Adaptador (`infrastructure/pdf/`)

- `generador-representacion.pdfkit.ts`: dibuja con Helvetica estándar (cubre tildes y ñ). QR con `qrcode.toBuffer` en PNG, nivel de corrección M.
  - **A4:** logo arriba a la izquierda, con domicilio fiscal, teléfono, correo y web debajo; recuadro del RUC, título y serie-número arriba a la derecha; datos del adquirente; tabla de líneas; totales; cuotas; leyendas, hash y QR al pie.
  - **TICKET80:** una columna con lo mismo en orden vertical. El alto se mide primero con `heightOfString` y luego se crea la página con ese alto.
- La API exacta de pdfkit y qrcode se verifica con ctx7 al implementar.
- Dependencias nuevas fijadas en `package.json`: `pdfkit`, `qrcode`, `@types/pdfkit`, `@types/qrcode`.

## Plan de implementación

1. **Migraciones.** `01z_arc_categoria_cpe_pdf.sql` y `01z_fe_representacion.sql`, inversos y pruebas SQL.
2. **Dominio.** Modelo, `armarRepresentacion`, `cadenaQr`, huella y errores. Pruebas:
   - QR con los 10 campos en orden;
   - clientes varios con documento vacío;
   - sin hash, último campo vacío;
   - S/ 118,00 → «CIENTO DIECIOCHO CON 00/100 SOLES»;
   - crédito con cuotas;
   - sin logo → nombre comercial; sin éste → razón social;
   - `ANULADO` con marca; `RECHAZADO` → error.
3. **Generador.** Adaptador pdfkit + qrcode. Pruebas: el PDF de los dos formatos abre (cabecera `%PDF`); el ticket mide 226,77 pt de ancho; el QR decodificado devuelve la cadena (decodificador solo en pruebas, p. ej. `jsqr`); generar un ticket de 20 líneas toma < 200 ms.
4. **ARC.** Categoría `CPE_PDF` y `ArchivoSistemaPort.leer`, con prueba de aislamiento.
5. **Caso de uso y caché.** `ObtenerRepresentacion` y repositorio TypeORM. Integración:
   - segundo pedido con la misma huella no regenera (el generador se llama una vez);
   - llega el hash y se regenera;
   - otro tenant → 404.
6. **HTTP.** Ruta nueva y permiso `plat.fe.pdf` en el manifiesto `1.31.0`. Pruebas HTTP: `TICKET80` con `Content-Type: application/pdf`, A4 con URL de 900 s.
7. **Cierre.**
   - `code-simplifier` sobre los archivos tocados.
   - `pnpm db:up:remoto` en dev y sincronización del manifiesto.
   - Humo: emitir una boleta con el simulador, pedir TICKET80 sin hash, dejar que el 52 la acepte, pedir de nuevo y ver el hash en el QR; A4 de una factura a crédito con logo; abrir los dos PDF y leer el QR con el celular.
   - `npx nx run-many -t lint test -p comprobantes archivos seguridad api worker migrar`.

## Criterios de aceptación

- [ ] TR-CA-155 (reformulado para R2): boleta B002-00000125 registrada, formato TICKET80 → `200 application/pdf` de 80 mm de ancho con logo, totales y QR.
- [ ] TR-CA-156: empresa sin logo, formato A4 → el PDF muestra el nombre comercial en lugar del logo; sin nombre comercial, la razón social.
- [ ] El QR decodificado tiene los 10 campos en el orden de TR-RF-061, separados por `|`; clientes varios con tipo y número de documento vacíos.
- [ ] Antes de la respuesta de SUNAT el QR lleva el hash vacío; tras `ACEPTADO` el siguiente pedido regenera y el QR lleva el hash del 52.
- [ ] Total S/ 118,00 → leyenda «SON: CIENTO DIECIOCHO CON 00/100 SOLES».
- [ ] Factura a crédito en A4 → muestra las cuotas con monto y fecha.
- [ ] `leyenda_pie` del emisor aparece al pie si existe.
- [ ] Segundo pedido del mismo formato sin cambio de estado ni de hash → devuelve el archivo guardado sin regenerar.
- [ ] `ANULADO` → PDF regenerado con marca de agua «ANULADO»; `RECHAZADO` → `409 COMPROBANTE_RECHAZADO`.
- [ ] Comprobante de otro tenant → `404 COMPROBANTE_NO_ENCONTRADO` (TR-RNF-010).
- [ ] A4 → URL firmada de ARC que vence a los 900 s o antes (TR-RN-027).
- [ ] Empresa con teléfono, correo y web → aparecen bajo el domicilio fiscal en A4 y en el ticket; sin ellos no queda línea vacía.
- [ ] Logo asignado pero ilegible en ARC → el PDF se genera con el nombre comercial, sin error.
- [ ] Generación de un ticket de 20 líneas < 200 ms en la prueba del adaptador (base de TR-RNF-001).
- [ ] Permiso `plat.fe.pdf` en el manifiesto `1.31.0`, en `PLAT_PROPIETARIO` y `PLAT_ENCARGADO_FACTURACION`; sin él → `403 SIN_PERMISO`.
- [ ] Endpoints con OpenAPI bajo `/v1`.
- [ ] Logs sin datos del adquirente (TR-RNF-026).
- [ ] Migraciones `01z_arc_categoria_cpe_pdf` y `01z_fe_representacion` reversibles y probadas en CI contra PostgreSQL 16.
- [ ] Cobertura de dominio de `comprobantes` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, sin SQL embebido nuevo.
- [ ] `npx nx run-many -t lint test -p comprobantes archivos seguridad api worker migrar` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** TICKET80 como PDF de 80 mm. Decisión del usuario. ESC/POS no tiene consumidor hasta TR-EDGE (R4); SazónPOS imprime el PDF con su mecanismo.
- **Sí:** representación sin hash antes de la respuesta, regenerada cuando llega. Decisión del usuario. La caja imprime al instante; la limitación queda documentada.
- **No:** firmar al emitir. Cambia 51 y 52; va en su propio spec.
- **Sí (cambio del 2026-11-27):** logo, teléfono, correo y web en `org.empresa` (spec 17d), no en `fe.emisor`. Decisión del usuario. Son identidad de la empresa y los usan también los correos y SazónPOS; una empresa sin emisor también los tiene.
- **No:** `logo_archivo_id` en `fe.emisor` con `PUT`/`DELETE .../logo`. Era la versión anterior de este spec.
- **Sí:** URL firmada para A4 y bytes en línea para TICKET80; los dos guardados en ARC. Decisión del usuario.
- **Sí:** pdfkit 0.21 + qrcode 1.5.4 (MIT). Decisión del usuario. Sin navegador y rápido para la caja; más código de dibujo que pdfmake.
- **No:** HTML + Chromium. Pesado y lento para TR-RNF-001.
- **Sí:** solo jpeg y png en el logo, exigido por el 17d al asignarlo. pdfkit no lee webp; convertirlo sumaría una dependencia de imágenes.
- **Sí:** generar al primer pedido y guardar, con una huella de estado, hash y versión de la plantilla. Un cambio posterior del logo o de la leyenda no regenera lo ya impreso: la representación refleja el comprobante tal como se emitió.
- **Sí:** `RECHAZADO` no se imprime; `ANULADO` sí, con marca de agua. Un rechazado no vale ante SUNAT; un anulado puede necesitar su copia.
- **Sí:** tabla `fe.representacion` en vez de columnas en `fe.comprobante`. El trigger del 52 congela el comprobante en estado final, y la representación cambia después.
- **Sí:** categoría `CPE_PDF` aparte de `DOCUMENTO`. `DOCUMENTO` es sensible y audita cada descarga; un comprobante no lo es más que su XML (`CPE_XML`).
- **Sí:** el código de unidad (`NIU`, `ZZ`) se imprime tal cual, sin descripción del catálogo. Evita otro puerto; es lo habitual en las representaciones.
- **Sí:** la dirección impresa es el domicilio fiscal de la empresa, no la del establecimiento.
- **Sí:** migraciones `01z`. El 46, en paralelo, usa `01y`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La primera impresión del ticket suma la subida a Storage y pasa de 800 ms | Generación < 200 ms probada; se mide en staging. Si no alcanza, la subida se hace después de responder, en un spec de ajuste. |
| Alto del ticket mal medido corta el contenido o deja papel en blanco | Medición en dos pasadas con `heightOfString`; prueba con 1 y con 50 líneas. |
| Contenido mínimo de SUNAT incompleto (TR-RNF-017) | Leyendas del cat. 52 y QR del SRS; se revisa contra la representación de la beta de SUNAT en la homologación (R2-14). |
| Pedidos simultáneos generan dos veces | La fila se reemplaza y queda la última; el archivo sobrante en ARC no se referencia. Aceptable por lo raro. |
| Boletas del resumen diario nunca reciben hash individual | Se imprimen sin hash hasta el 55, que define su hash. |
| Logo grande o pesado ralentiza el ticket | Tope de 1 MB (17d) y escalado a 30 mm de ancho en el ticket. |
| El 17d no está en `main` al implementar este | El 53 espera al 17d; los pasos 1 a 5 pueden avanzar con un doble de `EmpresaEmisoraPort`. |

## Ejecución en paralelo (worktree)

- Se implementa en un worktree propio (`spec-53-fe-representacion-impresa`), en paralelo con el 46.
- Archivos compartidos con el 46:
  - `apps/api` y `apps/worker` (registro de módulos): líneas distintas;
  - letras de migración: `01z` aquí, `01y` en el 46.
- Solo este spec toca el manifiesto PLAT (`1.31.0`) y `package.json` (pdfkit, qrcode).
- El segundo PR se rebasa sobre el primero.

## Lo que **no** entra en este spec

- ESC/POS e impresión directa (TR-EDGE, spec 133).
- Firma al emitir.
- PDF adjunto en el correo (spec 59).
- Consulta pública del comprobante.
- Asignar el logo y los datos de contacto (spec 17d).
- Representación de notas (spec 54).

Cada uno, si llega, va en su propio spec.
