import type { DomainEvent } from '@vitrina/plataforma/kernel';
import { DatosComprobanteInvalidosError, TransicionComprobanteInvalidaError } from '../errores.js';
import { comprobanteAceptado, comprobanteEmitido, comprobanteRechazado, type ComprobanteEmitidoEvento } from '../eventos-fe.js';
import type { RegimenIgv } from '../regimen-igv.js';
import type { Adquirente } from './adquirente.js';
import type { Decimal } from './dinero.js';
import { calcularLinea, type EntradaLinea, type LineaCalculada } from './linea-comprobante.js';
import { adquirenteDeBoleta } from './reglas-boleta.js';
import { exigirAdquirenteDeFactura, exigirCuotas, type Advertencia, type Cuota } from './reglas-factura.js';
import type { ArchivosRespuesta, RespuestaComprobante, RespuestaFinal } from './respuesta-comprobante.js';
import {
  CODIGO_SUNAT_POR_TIPO,
  ESTADO_INICIAL_COMPROBANTE,
  exigirSerieDelTipo,
  formatearNumero,
  type EstadoComprobante,
  type FormaPago,
  type ModoEnvio,
  type Moneda,
  type TipoComprobante,
} from './tipo-comprobante.js';
import { calcularTotales, verificarTotalEsperado, type Totales } from './totales.js';

export const VERSION_INICIAL_COMPROBANTE = 1;

export interface Origen {
  producto: string;
  id: string;
}

/** Lo que el caso de uso ya resolvió (serie, tasa, umbral, grupos de afectación) antes de pedir el número. */
export interface DatosEmision {
  id: string;
  tenantId: string;
  empresaId: string;
  sucursalId: string;
  emisorId: string;
  tipo: TipoComprobante;
  serie: string;
  /** `YYYY-MM-DD` en Lima. */
  fechaEmision: string;
  moneda: Moneda;
  formaPago: FormaPago;
  cuotas: Cuota[];
  adquirente: Adquirente | null;
  lineas: EntradaLinea[];
  totalEsperado: Decimal | null;
  modoEnvio: ModoEnvio;
  origen: Origen | null;
  claveIdempotencia: string;
  huellaSolicitud: string;
  advertencias: Advertencia[];
  regimenIgv: RegimenIgv;
  tasaIgv: Decimal;
  umbralBoleta: Decimal;
  creadoPor: string | null;
  creadoEn: Date;
}

export interface ComprobanteProps {
  id: string;
  tenantId: string;
  empresaId: string;
  sucursalId: string;
  emisorId: string;
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  fechaEmision: string;
  moneda: Moneda;
  formaPago: FormaPago;
  adquirente: Adquirente;
  regimenIgv: RegimenIgv;
  tasaIgv: Decimal;
  totales: Totales;
  modoEnvio: ModoEnvio;
  estado: EstadoComprobante;
  advertencias: Advertencia[];
  origen: Origen | null;
  claveIdempotencia: string;
  huellaSolicitud: string;
  lineas: LineaCalculada[];
  cuotas: Cuota[];
  version: number;
  creadoPor: string | null;
  creadoEn: Date;
  modificadoEn: Date | null;
  /** La respuesta de SUNAT, desde que el envío terminó (spec 52). */
  respuesta: RespuestaComprobante | null;
}

/** Validado y calculado, sin número: el número se pide al final de la transacción (TR-CA-095). */
export interface EmisionPreparada {
  datos: DatosEmision;
  adquirente: Adquirente;
  lineas: LineaCalculada[];
  totales: Totales;
}

function adquirenteSegunTipo(datos: DatosEmision, totales: Totales): Adquirente {
  if (datos.tipo === 'FACTURA') return exigirAdquirenteDeFactura(datos.adquirente);
  return adquirenteDeBoleta(datos.adquirente, totales.total, datos.umbralBoleta);
}

/** TR-RN-017, 018 y 021 y las cuotas: todo lo que puede rechazar la emisión, antes de consumir un número. */
export function prepararEmision(datos: DatosEmision): EmisionPreparada {
  if (datos.lineas.length === 0) throw new DatosComprobanteInvalidosError('lineas: el comprobante exige al menos una línea');
  exigirSerieDelTipo(datos.tipo, datos.serie);
  const lineas = datos.lineas.map((linea, indice) => calcularLinea(linea, indice + 1, datos.tasaIgv));
  const totales = calcularTotales(lineas);
  verificarTotalEsperado(totales.total, datos.totalEsperado);
  const adquirente = adquirenteSegunTipo(datos, totales);
  exigirCuotas(datos.formaPago, datos.cuotas, totales.total, datos.fechaEmision);
  return { datos, adquirente, lineas, totales };
}

/**
 * TR-RF-053 y 054. Inmutable desde que nace (TR-RN-022): solo cambia una vez, de PENDIENTE_ENVIO a un estado
 * final, con la respuesta de SUNAT (TR-RF-059).
 */
export class Comprobante {
  private eventos: DomainEvent[] = [];

  private constructor(private readonly props: ComprobanteProps) {}

  static reconstituir(props: ComprobanteProps): Comprobante {
    return new Comprobante(props);
  }

  /** Nace en PENDIENTE_ENVIO y levanta `cpe.emitido`. */
  static emitir({ datos, adquirente, lineas, totales }: EmisionPreparada, numero: number): Comprobante {
    const comprobante = new Comprobante({
      id: datos.id,
      tenantId: datos.tenantId,
      empresaId: datos.empresaId,
      sucursalId: datos.sucursalId,
      emisorId: datos.emisorId,
      tipo: datos.tipo,
      serie: datos.serie,
      numero,
      fechaEmision: datos.fechaEmision,
      moneda: datos.moneda,
      formaPago: datos.formaPago,
      adquirente,
      regimenIgv: datos.regimenIgv,
      tasaIgv: datos.tasaIgv,
      totales,
      modoEnvio: datos.modoEnvio,
      estado: ESTADO_INICIAL_COMPROBANTE,
      advertencias: datos.advertencias,
      origen: datos.origen,
      claveIdempotencia: datos.claveIdempotencia,
      huellaSolicitud: datos.huellaSolicitud,
      lineas,
      cuotas: datos.cuotas,
      version: VERSION_INICIAL_COMPROBANTE,
      creadoPor: datos.creadoPor,
      creadoEn: datos.creadoEn,
      modificadoEn: null,
      respuesta: null,
    });
    comprobante.eventos.push(comprobante.eventoEmitido());
    return comprobante;
  }

  get datos(): Readonly<ComprobanteProps> {
    return this.props;
  }

  get id(): string {
    return this.props.id;
  }

  get numeroFormateado(): string {
    return formatearNumero(this.props.serie, this.props.numero);
  }

  /**
   * TR-RF-059: la respuesta final de SUNAT, una sola vez y solo desde PENDIENTE_ENVIO. Sube la versión y levanta
   * `cpe.aceptado` (también con observaciones) o `cpe.rechazado`.
   */
  registrarRespuesta(respuesta: RespuestaFinal, archivos: ArchivosRespuesta, ahora: Date): void {
    if (this.props.estado !== ESTADO_INICIAL_COMPROBANTE) throw new TransicionComprobanteInvalidaError(this.props.estado);
    const registrada: RespuestaComprobante = { ...respuesta, ...archivos, respondidoEn: ahora };
    this.props.estado = respuesta.resultado;
    this.props.respuesta = registrada;
    this.props.version += 1;
    this.props.modificadoEn = ahora;
    this.eventos.push(this.eventoRespuesta(registrada));
  }

  /** ¿La solicitud repetida trae el mismo contenido que la original? */
  tieneLaHuella(huella: string): boolean {
    return this.props.huellaSolicitud === huella;
  }

  extraerEventos(): DomainEvent[] {
    const pendientes = this.eventos;
    this.eventos = [];
    return pendientes;
  }

  private eventoEmitido(): DomainEvent {
    return comprobanteEmitido(this.props.version, this.cargaComun(), this.props.creadoEn);
  }

  private eventoRespuesta(respuesta: RespuestaComprobante): DomainEvent {
    const { version } = this.props;
    if (respuesta.resultado === 'RECHAZADO') {
      const carga = {
        ...this.cargaComun(),
        codigo_respuesta: respuesta.codigo,
        descripcion_respuesta: respuesta.descripcion,
        xml_archivo_id: respuesta.xmlArchivoId,
      };
      return comprobanteRechazado(version, carga, respuesta.respondidoEn);
    }
    const carga = {
      ...this.cargaComun(),
      codigo_respuesta: respuesta.codigo,
      observaciones: respuesta.observaciones,
      xml_archivo_id: respuesta.xmlArchivoId,
      cdr_archivo_id: respuesta.cdrArchivoId,
    };
    return comprobanteAceptado(version, carga, respuesta.respondidoEn);
  }

  /** Sin datos del adquirente (TR-RNF-026). */
  private cargaComun(): ComprobanteEmitidoEvento {
    const { id, tipo, serie, numero, totales, moneda, estado, origen } = this.props;
    return {
      comprobante_id: id,
      tipo: CODIGO_SUNAT_POR_TIPO[tipo],
      serie,
      numero,
      total: totales.total.aTexto(),
      moneda,
      estado,
      origen_producto: origen?.producto ?? null,
      origen_id: origen?.id ?? null,
    };
  }
}
