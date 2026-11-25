import type { EstadoComprobante, FormaPago, ModoEnvio, Moneda, TipoComprobante } from '../../domain/comprobante/tipo-comprobante.js';

export const COMPROBANTE_PORT = Symbol('ComprobantePort');

export interface CuotaComando {
  monto: string;
  /** `YYYY-MM-DD`. */
  fechaVencimiento: string;
}

export interface AdquirenteComando {
  /** Código interno de TIPO_DOC_IDENTIDAD: `RUC`, `DNI`, `DOC_0`… */
  tipoDocumento: string;
  numero: string;
  nombre: string;
  correo?: string;
  personaId?: string;
}

export interface LineaComando {
  codigo?: string;
  descripcion: string;
  /** Código de UNIDAD_MEDIDA (cat. 03): `NIU`, `ZZ`… */
  unidad: string;
  cantidad: string;
  /** Sin IGV. */
  valorUnitario: string;
  /** Código de AFECTACION_IGV (cat. 07): 10 gravado, 20 exonerado, 30 inafecto. */
  afectacionIgv: string;
}

export interface EmitirComprobanteComando {
  tipo: TipoComprobante;
  empresaId: string;
  sucursalId: string;
  /** Sin serie, FE toma la única activa del tipo en la sucursal. */
  serie?: string;
  moneda: Moneda;
  formaPago: FormaPago;
  cuotas?: CuotaComando[];
  /** Sin adquirente, la boleta va a «Clientes varios» (hasta el umbral). */
  adquirente?: AdquirenteComando;
  lineas: LineaComando[];
  /** Si difiere del calculado en más de S/ 0,01, 422. */
  totalEsperado?: string;
  modoEnvio?: ModoEnvio;
  origen?: { producto: string; id: string };
  /** uuid. La misma clave con el mismo contenido devuelve el comprobante existente. */
  claveIdempotencia: string;
}

export interface TotalesEmitidos {
  gravado: string;
  exonerado: string;
  inafecto: string;
  igv: string;
  total: string;
}

export interface AdvertenciaEmitida {
  codigo: string;
  mensaje: string;
}

export interface ComprobanteEmitido {
  comprobanteId: string;
  serie: string;
  numero: number;
  numeroFormateado: string;
  /** PENDIENTE_ENVIO al emitir; una repetición devuelve el estado actual (el 52 lo avanza). */
  estado: EstadoComprobante;
  totales: TotalesEmitidos;
  advertencias: AdvertenciaEmitida[];
  repetido: boolean;
}

/**
 * TR-RF-053 y 054. El tenant sale del TenantContext; se une a la transacción del llamador (o abre una) y numera
 * con SEQ al final de ella: si el llamador revierte, el número no se consume. Montos como texto decimal.
 */
export interface ComprobantePort {
  emitir(comando: EmitirComprobanteComando): Promise<ComprobanteEmitido>;
}
