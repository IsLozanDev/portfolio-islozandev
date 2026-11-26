import { Comprobante } from '../../domain/comprobante/comprobante.js';
import { Decimal, ESCALA_TASA, ESCALA_UNITARIO, monto } from '../../domain/comprobante/dinero.js';
import { esGrupoAfectacion, type GrupoAfectacion, type LineaCalculada } from '../../domain/comprobante/linea-comprobante.js';
import type { Cuota } from '../../domain/comprobante/reglas-factura.js';
import type { RespuestaComprobante } from '../../domain/comprobante/respuesta-comprobante.js';
import {
  CODIGO_SUNAT_POR_TIPO,
  tipoDesdeCodigo,
  esEstadoFinal,
  type EstadoComprobante,
  type FormaPago,
  type ModoEnvio,
  type Moneda,
} from '../../domain/comprobante/tipo-comprobante.js';
import type { RegimenIgv } from '../../domain/regimen-igv.js';
import type { CambiosRespuestaComprobante, FilaComprobante, FilaCuotaComprobante, FilaLineaComprobante } from './entidades-comprobante.js';

/** La fila guarda el código de afectación; el grupo sale de su primer dígito (cat. 07: 1 gravado, 2 exonerado, 3 inafecto). */
const GRUPO_POR_DIGITO: Record<string, GrupoAfectacion> = { '1': 'GRAVADO', '2': 'EXONERADO', '3': 'INAFECTO' };

function grupoDe(afectacionIgv: string): GrupoAfectacion {
  const grupo = GRUPO_POR_DIGITO[afectacionIgv.charAt(0)];
  if (!esGrupoAfectacion(grupo)) throw new Error(`Afectación guardada fuera de lo que FE emite: ${afectacionIgv}`);
  return grupo;
}

function unitario(texto: string, campo: string): Decimal {
  return Decimal.desdeTexto(texto, ESCALA_UNITARIO, campo);
}

function lineaDesdeFila(fila: FilaLineaComprobante): LineaCalculada {
  return {
    orden: fila.orden,
    codigo: fila.codigo,
    descripcion: fila.descripcion,
    unidad: fila.unidad,
    cantidad: unitario(fila.cantidad, 'cantidad'),
    valorUnitario: unitario(fila.valorUnitario, 'valor_unitario'),
    afectacionIgv: fila.afectacionIgv,
    grupo: grupoDe(fila.afectacionIgv),
    valorVenta: monto(fila.valorVenta, 'valor_venta'),
    igv: monto(fila.igv, 'igv'),
    precioUnitario: unitario(fila.precioUnitario, 'precio_unitario'),
  };
}

function cuotaDesdeFila(fila: FilaCuotaComprobante): Cuota {
  return { numero: fila.numero, monto: monto(fila.monto, 'monto'), fechaVencimiento: fila.fechaVencimiento };
}

/** Solo un comprobante en estado final tiene respuesta: respondido_en la marca. */
function respuestaDesdeFila(fila: FilaComprobante): RespuestaComprobante | null {
  if (fila.respondidoEn === null || !esEstadoFinal(fila.estado)) return null;
  return {
    resultado: fila.estado,
    codigo: fila.codigoRespuesta,
    descripcion: fila.descripcionRespuesta,
    observaciones: fila.observaciones,
    hash: fila.hash,
    xmlArchivoId: fila.xmlArchivoId,
    cdrArchivoId: fila.cdrArchivoId,
    respondidoEn: fila.respondidoEn,
  };
}

/** Los CHECK de las tablas garantizan tipo, moneda, forma de pago, modo, estado y régimen. */
export function comprobanteDesdeFilas(fila: FilaComprobante, lineas: FilaLineaComprobante[], cuotas: FilaCuotaComprobante[]): Comprobante {
  return Comprobante.reconstituir({
    id: fila.id,
    tenantId: fila.tenantId,
    empresaId: fila.empresaId,
    sucursalId: fila.sucursalId,
    emisorId: fila.emisorId,
    tipo: tipoDesdeCodigo(fila.tipo),
    serie: fila.serie,
    numero: Number(fila.numero),
    fechaEmision: fila.fechaEmision,
    moneda: fila.moneda as Moneda,
    formaPago: fila.formaPago as FormaPago,
    adquirente: {
      tipoDocumento: fila.adquirenteTipoDoc,
      numero: fila.adquirenteNumero,
      nombre: fila.adquirenteNombre,
      correo: fila.adquirenteCorreo,
      personaId: fila.adquirentePersonaId,
    },
    regimenIgv: fila.regimenIgv as RegimenIgv,
    tasaIgv: Decimal.desdeTexto(fila.tasaIgv, ESCALA_TASA, 'tasa_igv'),
    totales: {
      gravado: monto(fila.totalGravado, 'total_gravado'),
      exonerado: monto(fila.totalExonerado, 'total_exonerado'),
      inafecto: monto(fila.totalInafecto, 'total_inafecto'),
      igv: monto(fila.igv, 'igv'),
      total: monto(fila.total, 'total'),
    },
    modoEnvio: fila.modoEnvio as ModoEnvio,
    estado: fila.estado as EstadoComprobante,
    advertencias: fila.advertencias,
    origen: fila.origenProducto !== null && fila.origenId !== null ? { producto: fila.origenProducto, id: fila.origenId } : null,
    claveIdempotencia: fila.claveIdempotencia,
    huellaSolicitud: fila.huellaSolicitud,
    lineas: [...lineas].sort((una, otra) => una.orden - otra.orden).map(lineaDesdeFila),
    cuotas: [...cuotas].sort((una, otra) => una.numero - otra.numero).map(cuotaDesdeFila),
    version: fila.version,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    modificadoEn: fila.modificadoEn,
    respuesta: respuestaDesdeFila(fila),
  });
}

export function filaDesdeComprobante(comprobante: Comprobante): FilaComprobante {
  const datos = comprobante.datos;
  return {
    id: datos.id,
    tenantId: datos.tenantId,
    empresaId: datos.empresaId,
    sucursalId: datos.sucursalId,
    emisorId: datos.emisorId,
    tipo: CODIGO_SUNAT_POR_TIPO[datos.tipo],
    serie: datos.serie,
    numero: String(datos.numero),
    fechaEmision: datos.fechaEmision,
    moneda: datos.moneda,
    formaPago: datos.formaPago,
    adquirenteTipoDoc: datos.adquirente.tipoDocumento,
    adquirenteNumero: datos.adquirente.numero,
    adquirenteNombre: datos.adquirente.nombre,
    adquirenteCorreo: datos.adquirente.correo,
    adquirentePersonaId: datos.adquirente.personaId,
    regimenIgv: datos.regimenIgv,
    tasaIgv: datos.tasaIgv.aTexto(),
    totalGravado: datos.totales.gravado.aTexto(),
    totalExonerado: datos.totales.exonerado.aTexto(),
    totalInafecto: datos.totales.inafecto.aTexto(),
    igv: datos.totales.igv.aTexto(),
    total: datos.totales.total.aTexto(),
    modoEnvio: datos.modoEnvio,
    advertencias: datos.advertencias,
    origenProducto: datos.origen?.producto ?? null,
    origenId: datos.origen?.id ?? null,
    claveIdempotencia: datos.claveIdempotencia,
    huellaSolicitud: datos.huellaSolicitud,
    creadoPor: datos.creadoPor,
    creadoEn: datos.creadoEn,
    ...cambiosDeRespuesta(comprobante),
  };
}

/** El estado, la versión y las columnas de la respuesta de SUNAT, vacías mientras no la haya. */
export function cambiosDeRespuesta(comprobante: Comprobante): CambiosRespuestaComprobante {
  const { estado, version, modificadoEn, respuesta } = comprobante.datos;
  return {
    estado,
    version,
    modificadoEn,
    hash: respuesta?.hash ?? null,
    xmlArchivoId: respuesta?.xmlArchivoId ?? null,
    cdrArchivoId: respuesta?.cdrArchivoId ?? null,
    codigoRespuesta: respuesta?.codigo ?? null,
    descripcionRespuesta: respuesta?.descripcion ?? null,
    observaciones: respuesta?.observaciones ?? [],
    respondidoEn: respuesta?.respondidoEn ?? null,
  };
}

export function filasDeLineas(comprobante: Comprobante): FilaLineaComprobante[] {
  const { id, tenantId, lineas } = comprobante.datos;
  return lineas.map((linea) => ({
    comprobanteId: id,
    tenantId,
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
  }));
}

export function filasDeCuotas(comprobante: Comprobante): FilaCuotaComprobante[] {
  const { id, tenantId, cuotas } = comprobante.datos;
  return cuotas.map((cuota) => ({
    comprobanteId: id,
    tenantId,
    numero: cuota.numero,
    monto: cuota.monto.aTexto(),
    fechaVencimiento: cuota.fechaVencimiento,
  }));
}
