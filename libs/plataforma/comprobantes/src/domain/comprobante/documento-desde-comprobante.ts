import { TIPO_OPERACION_VENTA_INTERNA, type DocumentoElectronico, type LineaDocumento } from '../documento-electronico.js';
import { exigirDatosEmisor, type DatosEmisor } from '../emisor-documento.js';
import { horaEnLima } from '../hora-lima.js';
import { montoEnLetras } from '../monto-en-letras.js';
import type { Comprobante } from './comprobante.js';
import type { LineaCalculada } from './linea-comprobante.js';
import { CODIGO_SUNAT_POR_TIPO } from './tipo-comprobante.js';

function lineaDocumento(linea: LineaCalculada): LineaDocumento {
  return {
    orden: linea.orden,
    codigo: linea.codigo,
    descripcion: linea.descripcion,
    unidad: linea.unidad,
    cantidad: linea.cantidad.aTexto(),
    valorUnitario: linea.valorUnitario.aTexto(),
    precioUnitario: linea.precioUnitario.aTexto(),
    afectacionIgv: linea.afectacionIgv,
    valorVenta: linea.valorVenta.aTexto(),
    igv: linea.igv.aTexto(),
  };
}

/**
 * Factura o boleta del 51 como documento electrónico. `tipoDocumentoAdquirente` es el código SUNAT del cat. 06
 * (atributo `codigo_externo` del catálogo), ya resuelto por quien llama: el comprobante guarda el código interno.
 */
export function documentoDesdeComprobante(
  comprobante: Comprobante,
  empresa: DatosEmisor,
  codigoEstablecimiento: string | null,
  tipoDocumentoAdquirente: string,
): DocumentoElectronico {
  const datos = comprobante.datos;
  const { totales } = datos;
  return {
    tipo: CODIGO_SUNAT_POR_TIPO[datos.tipo],
    serie: datos.serie,
    numero: datos.numero,
    fechaEmision: datos.fechaEmision,
    horaEmision: horaEnLima(datos.creadoEn),
    tipoOperacion: TIPO_OPERACION_VENTA_INTERNA,
    moneda: datos.moneda,
    emisor: exigirDatosEmisor(empresa, codigoEstablecimiento),
    adquirente: { tipoDocumento: tipoDocumentoAdquirente, numero: datos.adquirente.numero, nombre: datos.adquirente.nombre },
    formaPago: datos.formaPago,
    cuotas: datos.cuotas.map((cuota) => ({ numero: cuota.numero, monto: cuota.monto.aTexto(), fechaVencimiento: cuota.fechaVencimiento })),
    tasaIgv: datos.tasaIgv.aTexto(),
    lineas: datos.lineas.map(lineaDocumento),
    totales: {
      gravado: totales.gravado.aTexto(),
      exonerado: totales.exonerado.aTexto(),
      inafecto: totales.inafecto.aTexto(),
      igv: totales.igv.aTexto(),
      total: totales.total.aTexto(),
    },
    montoEnLetras: montoEnLetras(totales.total, datos.moneda),
  };
}
