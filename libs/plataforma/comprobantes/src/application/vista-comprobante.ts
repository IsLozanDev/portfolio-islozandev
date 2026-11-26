import type { Adquirente } from '../domain/comprobante/adquirente.js';
import type { Comprobante } from '../domain/comprobante/comprobante.js';
import type { Advertencia } from '../domain/comprobante/reglas-factura.js';
import type { EstadoComprobante, FormaPago, ModoEnvio, Moneda, TipoComprobante } from '../domain/comprobante/tipo-comprobante.js';
import type { Totales } from '../domain/comprobante/totales.js';
import type { RegimenIgv } from '../domain/regimen-igv.js';
import type { ComprobanteEmitido, TotalesEmitidos } from './ports/comprobante.port.js';

export interface LineaVista {
  orden: number;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: string;
  valorUnitario: string;
  afectacionIgv: string;
  valorVenta: string;
  igv: string;
  precioUnitario: string;
}

/** La respuesta de SUNAT (spec 52). Los ids de archivo son de TR-ARC; nulos si la subida falló o no hubo CDR. */
export interface RespuestaVista {
  codigo: string | null;
  descripcion: string | null;
  observaciones: string[];
  hash: string | null;
  xmlArchivoId: string | null;
  cdrArchivoId: string | null;
  respondidoEn: Date;
}

export interface CuotaVista {
  numero: number;
  monto: string;
  fechaVencimiento: string;
}

/** El comprobante para `GET /v1/fe/comprobantes/{id}`, con montos como texto decimal. */
export interface VistaComprobante {
  comprobanteId: string;
  empresaId: string;
  sucursalId: string;
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  numeroFormateado: string;
  fechaEmision: string;
  moneda: Moneda;
  formaPago: FormaPago;
  adquirente: Adquirente;
  regimenIgv: RegimenIgv;
  tasaIgv: string;
  totales: TotalesEmitidos;
  modoEnvio: ModoEnvio;
  estado: EstadoComprobante;
  advertencias: Advertencia[];
  origen: { producto: string; id: string } | null;
  lineas: LineaVista[];
  cuotas: CuotaVista[];
  creadoEn: Date;
  /** null mientras el envío no tenga respuesta final. */
  respuesta: RespuestaVista | null;
}

function totalesEmitidos(totales: Totales): TotalesEmitidos {
  return {
    gravado: totales.gravado.aTexto(),
    exonerado: totales.exonerado.aTexto(),
    inafecto: totales.inafecto.aTexto(),
    igv: totales.igv.aTexto(),
    total: totales.total.aTexto(),
  };
}

export function comprobanteEmitidoDe(comprobante: Comprobante, repetido: boolean): ComprobanteEmitido {
  const { id, serie, numero, estado, totales, advertencias } = comprobante.datos;
  return {
    comprobanteId: id,
    serie,
    numero,
    numeroFormateado: comprobante.numeroFormateado,
    estado,
    totales: totalesEmitidos(totales),
    advertencias: advertencias.map((advertencia) => ({ ...advertencia })),
    repetido,
  };
}

export function vistaComprobanteDe(comprobante: Comprobante): VistaComprobante {
  const datos = comprobante.datos;
  return {
    comprobanteId: datos.id,
    empresaId: datos.empresaId,
    sucursalId: datos.sucursalId,
    tipo: datos.tipo,
    serie: datos.serie,
    numero: datos.numero,
    numeroFormateado: comprobante.numeroFormateado,
    fechaEmision: datos.fechaEmision,
    moneda: datos.moneda,
    formaPago: datos.formaPago,
    adquirente: { ...datos.adquirente },
    regimenIgv: datos.regimenIgv,
    tasaIgv: datos.tasaIgv.aTexto(),
    totales: totalesEmitidos(datos.totales),
    modoEnvio: datos.modoEnvio,
    estado: datos.estado,
    advertencias: datos.advertencias.map((advertencia) => ({ ...advertencia })),
    origen: datos.origen && { ...datos.origen },
    lineas: datos.lineas.map((linea) => ({
      orden: linea.orden,
      codigo: linea.codigo,
      descripcion: linea.descripcion,
      unidad: linea.unidad,
      cantidad: linea.cantidad.aTexto(),
      valorUnitario: linea.valorUnitario.aTexto(),
      afectacionIgv: linea.afectacionIgv,
      valorVenta: linea.valorVenta.aTexto(),
      igv: linea.igv.aTexto(),
      precioUnitario: linea.precioUnitario.aTexto(),
    })),
    cuotas: datos.cuotas.map((cuota) => ({ numero: cuota.numero, monto: cuota.monto.aTexto(), fechaVencimiento: cuota.fechaVencimiento })),
    creadoEn: datos.creadoEn,
    respuesta: respuestaVistaDe(comprobante),
  };
}

function respuestaVistaDe(comprobante: Comprobante): RespuestaVista | null {
  const { respuesta } = comprobante.datos;
  if (respuesta === null) return null;
  const { codigo, descripcion, observaciones, hash, xmlArchivoId, cdrArchivoId, respondidoEn } = respuesta;
  return { codigo, descripcion, observaciones: [...observaciones], hash, xmlArchivoId, cdrArchivoId, respondidoEn };
}
