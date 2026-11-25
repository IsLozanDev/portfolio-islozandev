import type { DomainEvent } from '@vitrina/plataforma/kernel';
import { DatosComprobanteInvalidosError } from '../errores.js';
import { comprobanteEmitido } from '../eventos-fe.js';
import type { RegimenIgv } from '../regimen-igv.js';
import type { Adquirente } from './adquirente.js';
import type { Decimal } from './dinero.js';
import { calcularLinea, type EntradaLinea, type LineaCalculada } from './linea-comprobante.js';
import { adquirenteDeBoleta } from './reglas-boleta.js';
import { exigirAdquirenteDeFactura, exigirCuotas, type Advertencia, type Cuota } from './reglas-factura.js';
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

/** TR-RF-053 y 054. Inmutable desde que nace (TR-RN-022): solo el spec 52 le cambia el estado. */
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
    const { id, tipo, serie, numero, totales, moneda, estado, origen, version, creadoEn } = this.props;
    return comprobanteEmitido(
      version,
      {
        comprobante_id: id,
        tipo: CODIGO_SUNAT_POR_TIPO[tipo],
        serie,
        numero,
        total: totales.total.aTexto(),
        moneda,
        estado,
        origen_producto: origen?.producto ?? null,
        origen_id: origen?.id ?? null,
      },
      creadoEn,
    );
  }
}
