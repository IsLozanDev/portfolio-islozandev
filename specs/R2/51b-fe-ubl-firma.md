# SPEC 51b — Facturación electrónica: documento electrónico completo, UBL 2.1 de factura y boleta y firma XMLDSig propia

> **Status:** Borrador
> **Depends on:** SPEC 51, SPEC 49, SPEC 41, SPEC 48
> **Date:** 2026-11-25
> **Objective:** Agregar a `libs/plataforma/comprobantes` el `DocumentoElectronico` completo de factura y boleta (armado desde el agregado `Comprobante`), su XML UBL 2.1 según SUNAT y la firma XMLDSig con el certificado del emisor, para que el adaptador SUNAT directo (spec 51c) solo tenga que comprimir y enviar.

## Por qué existe este spec

Fila 51b de `docs/roadmap-specs.md`. Contexto: `docs/spec-context/tr-fe/fe-boleta-factura-cdr.md`, parte C. El 2026-11-25 se decidió emitir por SEE-Del Contribuyente (SUNAT directo) y dejar Nubefact como proveedor alterno. La cotización reseller de Nubefact cobra S/ 40 al mes por empresa, y el presupuesto se reserva para infraestructura. La RS 000048-2026/SUNAT solo obliga a usar SEE-OSE para el documento de atribución (art. 41.2): facturas y boletas siguen pudiendo ir directo a SUNAT (ver la nota corregida del spec 50).

Con un PSE de API JSON, el PSE genera y firma el XML. Con SUNAT directo, lo hace la plataforma. Este spec cubre esa parte, sin red. El envío, el ZIP y el CDR son del 51c.

Lo que hay en el código hoy (revisado al redactar):

- `domain/documento-electronico.ts` (spec 50): `DocumentoElectronico` mínimo, solo para la boleta de prueba (tipo `03`, `CLIENTES VARIOS`, montos `number`). Lo usan `boletaDePrueba`, `mapeo-nubefact.ts` y el simulador.
- `domain/comprobante/` (spec 51): agregado `Comprobante` con líneas, cuotas, `Adquirente`, totales y `Decimal` (`dinero.ts`, escalas 2 y 4, `aTexto()`).
- `EmpresaEmisoraPort.obtener` devuelve solo `{ id, ruc, activa }`. ORG tiene `Empresa.razonSocial`, `nombreComercial`, `direccionFiscal` y `ubigeo` (los dos últimos opcionales) y `Sucursal.codigoEstablecimientoSunat` (anexo, `0000` para el domicilio fiscal).
- Bóveda (spec 41): el `.pfx` y su clave como `fe.certificado` y `fe.clave_certificado`. `LectorCertificado` (node-forge) abre el PKCS#12 y devuelve el certificado hoja.
- `node-forge 1.4.3` en `package.json`. No hay librerías de XML ni de firma.

## Alcance

**Entra:**

- `DocumentoElectronico` completo para factura (`01`) y boleta (`03`):
  - Emisor con RUC, razón social, nombre comercial, domicilio fiscal, ubigeo y código de establecimiento.
  - Adquirente.
  - Fecha y hora de emisión, moneda, forma de pago y cuotas.
  - Tipo de operación (`0101`, cat. 51).
  - Líneas con unidad, cantidad, valor unitario, precio unitario, afectación, valor de venta e IGV.
  - Totales por afectación, tasa de IGV y leyenda del monto en letras (código `1000`).
  - Montos como texto decimal, nunca `number`.
- `documentoDesdeComprobante(comprobante, datosEmisor, sucursal)`: mapeo puro desde el agregado del 51.
- `montoEnLetras(total, moneda)`: «CIENTO DIECIOCHO CON 00/100 SOLES».
- `EmpresaEmisoraPort` ampliado con razón social, nombre comercial, domicilio fiscal y ubigeo. Lectura del código de establecimiento de la sucursal. Ambas sobre ORG.
- Error `DatosEmisorIncompletosError` (422) si la empresa no tiene domicilio fiscal o ubigeo, o la sucursal no tiene código de establecimiento.
- Generador UBL 2.1 `Invoice` para `01` y `03` en `infrastructure/sunat/ubl/`. Sigue la «Guía de elaboración de documentos XML UBL 2.1» de factura y boleta de SUNAT, que se lee al implementar.
- Firma XMLDSig envuelta (enveloped) dentro de `ext:UBLExtensions` con el certificado y la llave del `.pfx`. Devuelve el XML firmado y el hash (`DigestValue`).
- `boletaDePrueba`, `mapeo-nubefact.ts` y el simulador adaptados al documento nuevo, sin cambiar su comportamiento.
- Dependencias `xml-crypto` y `@xmldom/xmldom`.

**No entra (specs futuros):**

- ZIP, sobre SOAP, `sendBill`, CDR, ítem `SUNAT` del catálogo y prueba en beta (spec 51c).
- Envío de comprobantes reales y guardado del XML y el CDR en ARC (spec 52).
- UBL de notas de crédito y débito (spec 54), y de resumen diario y comunicación de baja (spec 55).
- QR y representación impresa (spec 53). Este spec solo entrega el hash.
- Mapeo de Nubefact para el documento completo: lo hace el 52 si envía comprobantes reales por Nubefact.
- Validación contra los XSD de SUNAT en local: la valida la beta en el 51c.
- Otros tributos (ISC, ICBPER, percepciones), descuentos, anticipos, detracciones y exportación (fuera también en el 51).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `domain/comprobante/` (51: `Comprobante`, `Decimal`, totales, `Adquirente`) | Origen del mapeo; los montos salen con `aTexto()`. |
| `domain/documento-electronico.ts` (50) | Se amplía; `boletaDePrueba` arma el documento nuevo. |
| `infrastructure/org/empresa-emisora.org.ts`, `sucursales-emisoras.org.ts` | Se amplían con los datos del emisor y el código de establecimiento. |
| `infrastructure/forge/lector-certificado.forge.ts` | Se reutiliza para abrir el `.pfx` y obtener la llave privada y el certificado en PEM. |
| `pse/nubefact/mapeo-nubefact.ts`, `pse/simulador/` | Se adaptan al documento nuevo (montos texto → número en el JSON de Nubefact). |

## Modelo de datos

Sin migración: no hay tablas ni columnas nuevas.

### Dominio (`libs/plataforma/comprobantes/src/domain/`)

```ts
// documento-electronico.ts (reemplaza al mínimo del 50)
export type TipoDocumentoElectronico = '01' | '03';

export interface EmisorDocumento {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  domicilioFiscal: string;
  ubigeo: string;                 // 6 dígitos
  codigoEstablecimiento: string;  // anexo SUNAT de la sucursal, «0000» el domicilio fiscal
}

export interface LineaDocumento {
  orden: number;
  codigo: string | null;
  descripcion: string;
  unidad: string;            // cat. 03
  cantidad: string;          // escala 4
  valorUnitario: string;     // sin IGV, escala 4
  precioUnitario: string;    // con IGV, escala 4
  afectacionIgv: string;     // cat. 07
  valorVenta: string;        // escala 2
  igv: string;               // escala 2
}

export interface DocumentoElectronico {
  tipo: TipoDocumentoElectronico;
  serie: string;
  numero: number;
  fechaEmision: FechaCalendario;
  horaEmision: string;       // HH:mm:ss en America/Lima
  tipoOperacion: '0101';
  moneda: 'PEN' | 'USD';
  emisor: EmisorDocumento;
  adquirente: { tipoDocumento: string; numero: string; nombre: string };  // tipo SUNAT del cat. 06
  formaPago: 'CONTADO' | 'CREDITO';
  cuotas: { numero: number; monto: string; fechaVencimiento: FechaCalendario }[];
  tasaIgv: string;           // «0.18»
  lineas: LineaDocumento[];
  totales: { gravado: string; exonerado: string; inafecto: string; igv: string; total: string };
  montoEnLetras: string;
}
```

- `comprobante/documento-desde-comprobante.ts`: `documentoDesdeComprobante(comprobante, datosEmisor, codigoEstablecimiento)`. Es puro. Convierte el código interno de tipo de documento al código SUNAT del cat. 06 (atributo del catálogo, que se pasa ya resuelto). Usa la hora de `creado_en` en Lima.
- `monto-en-letras.ts`: enteros hasta 999 999 999 y céntimos «NN/100», moneda «SOLES» o «DÓLARES AMERICANOS». Constantes con nombre, sin tablas mágicas sueltas.
- `boletaDePrueba` arma un `DocumentoElectronico` completo (S/ 1.00, `CLIENTES VARIOS`, afectación `10`) con los datos del emisor que recibe.
- `errores.ts` suma `DatosEmisorIncompletosError` (422, `DATOS_EMISOR_INCOMPLETOS`, con el campo que falta).

### Puertos (`application/ports/`)

```ts
export interface EmpresaEmisora {
  id: string;
  ruc: string;
  activa: boolean;
  razonSocial: string;
  nombreComercial: string | null;
  domicilioFiscal: string | null;
  ubigeo: string | null;
}

// reglas-emision.ts: SucursalesEmisoras suma
codigoEstablecimiento(sucursalId: string): Promise<string | null>;
```

`exigirDatosEmisor(empresa, codigoEstablecimiento)` en el dominio arma `EmisorDocumento` o lanza `DatosEmisorIncompletosError`.

### Infraestructura (`infrastructure/sunat/`)

- `ubl/invoice-ubl.ts`: `generarInvoiceUbl(documento): string` con `@xmldom/xmldom` (DOM, no concatenación de texto). Nodos mínimos:
  - Cabecera: `UBLVersionID 2.1`, `CustomizationID 2.0`, `ID` serie-número, `IssueDate`, `IssueTime`, `InvoiceTypeCode` con `listID` = tipo de operación, `Note` con `languageLocaleID="1000"` (monto en letras), `DocumentCurrencyCode`, `LineCountNumeric`.
  - `cac:Signature` (referencia a la firma), `AccountingSupplierParty` con RUC `schemeID="6"`, razón social, nombre comercial y `RegistrationAddress` con ubigeo y `AddressTypeCode` = código de establecimiento, y `AccountingCustomerParty`.
  - `PaymentTerms`: `FormaPago` con `Contado` o `Credito` y una `Cuota001…` por cuota.
  - `TaxTotal` con un `TaxSubtotal` por tributo presente, y `LegalMonetaryTotal`.
  - `InvoiceLine` con `InvoicedQuantity unitCode`, `LineExtensionAmount`, `PricingReference` (precio con IGV, `PriceTypeCode 01`), `TaxTotal` de la línea con `TaxExemptionReasonCode` = afectación, `Item` y `Price` (valor unitario).
  - `currencyID` en cada importe.
  - Los nombres exactos se toman de la guía de SUNAT.
- `ubl/tributos-sunat.ts`: grupo de afectación (cat. 07) → tributo (cat. 05). Gravado `10-17` → `1000 IGV VAT S`, exonerado `20-21` → `9997 EXO VAT E`, inafecto `30-37` → `9998 INA FRE O`. Afectación fuera de esos grupos → error de programación (el 51 ya la valida).
- `firma/firmador-xml.ts`: `firmarXml(xml, { llavePrivadaPem, certificadoPem }): { xmlFirmado: string; hash: string }` con `xml-crypto`.
  - Firma envuelta en el primer `ext:ExtensionContent`, transformación enveloped y canonicalización C14N inclusiva (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`).
  - `KeyInfo` con `X509Certificate`.
  - Algoritmo RSA-SHA256 y digest SHA-256 por defecto, como constantes con nombre. Si la beta del 51c lo rechaza, se cambia a RSA-SHA1 y se anota ahí.
- `firma/llave-desde-pfx.ts`: abre el `.pfx` con node-forge, reutilizando el lector del 49, y devuelve la llave y el certificado en PEM. La clave del `.pfx` y la llave nunca se registran.
- `generar-xml-firmado.ts`: `generarXmlFirmado(documento, certificado: { pfx: Uint8Array; clave: string })` → `{ xml: Uint8Array; hash: string; nombreArchivo: string }` (`RUC-TIPO-SERIE-NUMERO`). Es lo que usa el 51c.

### Composición

- `package.json`: `xml-crypto` y `@xmldom/xmldom` en la última versión estable al implementar (se consulta con ctx7 o npm). Solo se importan desde `infrastructure/sunat`.
- `src/index.ts` no exporta nada nuevo: el UBL es interno de la lib.

## Plan de implementación

1. **Documento y mapeo.** `DocumentoElectronico` nuevo, `monto-en-letras`, `exigirDatosEmisor`, `documentoDesdeComprobante`, `boletaDePrueba`. Se adaptan `mapeo-nubefact` y el simulador; sus pruebas siguen verdes. Pruebas: TR-CA-136 (F001-00000100, total 118.00, «CIENTO DIECIOCHO CON 00/100 SOLES»), boleta `CLIENTES VARIOS`, exonerado e inafecto, crédito con dos cuotas, empresa sin ubigeo → `DATOS_EMISOR_INCOMPLETOS`, y montos de borde para letras (0.05, 1 000 000.00, 999 999 999.99).
2. **Lectura de ORG.** `EmpresaEmisoraPort` y `SucursalesEmisoras` ampliados, con sus adaptadores y pruebas.
3. **UBL.** Se lee la guía de SUNAT de factura y boleta UBL 2.1 antes de escribir. Después, `tributos-sunat` y `generarInvoiceUbl`, con pruebas de nodos por XPath (no snapshot de texto completo): tipo, serie-número, `listID`, ubigeo, establecimiento, un `TaxSubtotal` por tributo, cuotas, `currencyID` y la boleta sin adquirente con documento `0`.
4. **Firma.** `llave-desde-pfx`, `firmarXml`, `generarXmlFirmado`. Pruebas con un `.pfx` autofirmado generado en la prueba con node-forge:
   - la firma verifica con `xml-crypto` y el certificado;
   - cambiar un importe después de firmar hace fallar la verificación;
   - el hash es el `DigestValue`;
   - una clave incorrecta lanza el error del 49 sin la clave en el mensaje.
5. **Cierre.** `code-simplifier` sobre los archivos tocados; `npx nx run-many -t lint test -p comprobantes boundaries-test`. Además, una muestra de factura y de boleta firmadas, generadas por una prueba, se adjunta en el cierre para compararla con los ejemplos de la guía.

## Criterios de aceptación

- [ ] La factura de TR-CA-136 genera un `Invoice` UBL 2.1 con `ID` `F001-00000100`, `InvoiceTypeCode` `01` con `listID` `0101`, IGV 18.00, total 118.00 y leyenda `1000` «CIENTO DIECIOCHO CON 00/100 SOLES».
- [ ] La boleta sin adquirente lleva al adquirente con documento `0` y nombre «CLIENTES VARIOS», y `InvoiceTypeCode` `03`.
- [ ] Gravado, exonerado e inafecto en un mismo comprobante → un `TaxSubtotal` por tributo (`1000`, `9997`, `9998`) con su base y, en cada línea, `TaxExemptionReasonCode` igual a su afectación.
- [ ] Crédito con dos cuotas → `PaymentTerms` `FormaPago`/`Credito` con el monto pendiente y `Cuota001`, `Cuota002` con monto y fecha.
- [ ] El emisor lleva RUC con `schemeID="6"`, razón social, ubigeo y `AddressTypeCode` igual al código de establecimiento de la sucursal.
- [ ] Empresa sin domicilio fiscal o sin ubigeo, o sucursal sin código de establecimiento → `DATOS_EMISOR_INCOMPLETOS` con el campo.
- [ ] El XML firmado verifica con `xml-crypto` y el certificado del `.pfx`. Alterar un importe después de firmar hace fallar la verificación.
- [ ] La firma está dentro de `ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent`, es enveloped, usa C14N inclusiva y lleva `X509Certificate`. El hash devuelto es su `DigestValue`.
- [ ] Ningún log, error ni valor devuelto contiene la clave del `.pfx` ni la llave privada (TR-RNF-113).
- [ ] `montoEnLetras` cubre céntimos, miles, millones y dólares.
- [ ] `boletaDePrueba`, el simulador y el mapeo de Nubefact siguen pasando sus pruebas con el documento nuevo.
- [ ] El dominio no importa `xml-crypto`, `@xmldom/xmldom` ni `node-forge` (lint de capas).
- [ ] Cobertura de dominio de `comprobantes` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`.
- [ ] `npx nx run-many -t lint test -p comprobantes boundaries-test` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** SUNAT directo con UBL y firma propios. Decisión del usuario (2026-11-25), por costo: Nubefact reseller cobra S/ 40 por empresa al mes. Nubefact queda como adaptador alterno.
- **Sí:** solo factura y boleta. Decisión del usuario. Las notas (54) y el resumen y la baja (55) agregan su UBL cuando el dominio los tenga.
- **Sí:** el 51b amplía `DocumentoElectronico` y escribe el mapeo desde `Comprobante`. Decisión del usuario. El 52 solo lo usa para enviar, sin rehacer nada.
- **Sí:** `xml-crypto` y `@xmldom/xmldom`. Decisión del usuario. C14N escrita a mano sobre node-forge es el error más común de rechazo de firma en SUNAT.
- **Sí:** montos como texto decimal en el documento. El UBL exige el importe exacto; `number` arrastraría errores de coma flotante.
- **Sí:** XML con DOM, no con plantillas de texto. Escapa caracteres de descripciones y nombres (`&`, `<`) sin depender de cada llamador.
- **Sí:** datos del emisor desde ORG al armar el documento. No se duplican en FE; un dato faltante se informa con `DATOS_EMISOR_INCOMPLETOS`.
- **Sí:** RSA-SHA256 por defecto, con SHA-1 como alternativa en una constante. La beta del 51c decide.
- **No:** validar contra los XSD de SUNAT en local. Exigiría una librería nativa (libxml). La beta valida estructura y reglas.
- **No:** migración ni permiso nuevo. El manifiesto no cambia y este spec no choca con otros del mismo frente.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un nodo o atributo del UBL distinto de lo que pide SUNAT | Paso 3 empieza leyendo la guía oficial; la beta del 51c es el juez. Pruebas por XPath, fáciles de ajustar. |
| Firma rechazada por canonicalización o algoritmo | `xml-crypto` con C14N estándar; algoritmo en constante para cambiar a SHA-1 sin tocar el resto. |
| Empresas de dev sin domicilio fiscal o ubigeo | `DATOS_EMISOR_INCOMPLETOS` lo dice; el humo del 51c completa la empresa de prueba. |
| Cambiar `DocumentoElectronico` rompe la prueba del emisor del 50 | `boletaDePrueba`, el simulador y el mapeo de Nubefact se adaptan en el paso 1 con sus pruebas. |
| Estimado de 9-10 h | Corte natural: `montoEnLetras` en dólares y las cuotas a crédito pasan al 52 si hace falta; la firma no se recorta. |

## Lo que **no** entra en este spec

- Envío a SUNAT, ZIP, SOAP y CDR (spec 51c).
- Envío de comprobantes reales y guardado en ARC (spec 52).
- UBL de notas (54), resumen y baja (55); QR (53).
- Validación XSD local.

Cada uno, si llega, va en su propio spec.
