import { SerieNoCorrespondeError } from '../errores.js';

/** Tipo del comando y su código SUNAT (cat. 01), que es el que guarda fe.comprobante.tipo. Notas: spec 54. */
export const CODIGO_SUNAT_POR_TIPO = { FACTURA: '01', BOLETA: '03' } as const;
export type TipoComprobante = keyof typeof CODIGO_SUNAT_POR_TIPO;
export type CodigoTipoComprobante = (typeof CODIGO_SUNAT_POR_TIPO)[TipoComprobante];
export const TIPOS_COMPROBANTE = ['FACTURA', 'BOLETA'] as const satisfies readonly TipoComprobante[];

/** TR-RN-017: la factura va en series F###; la boleta, en B###. */
const PREFIJO_SERIE: Record<TipoComprobante, string> = { FACTURA: 'F', BOLETA: 'B' };
const FORMATO_SERIE = /^[FB][A-Z0-9]{3}$/;

export const MONEDAS = ['PEN', 'USD'] as const;
export type Moneda = (typeof MONEDAS)[number];
export const FORMAS_PAGO = ['CONTADO', 'CREDITO'] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];
export const MODOS_ENVIO = ['INDIVIDUAL', 'RESUMEN'] as const;
export type ModoEnvio = (typeof MODOS_ENVIO)[number];
export const MODO_ENVIO_POR_DEFECTO: ModoEnvio = 'INDIVIDUAL';

/** Los mismos que el CHECK de fe.comprobante.estado; este spec solo crea PENDIENTE_ENVIO (el 52, los demás). */
export const ESTADOS_COMPROBANTE = ['PENDIENTE_ENVIO', 'ENVIADO', 'ACEPTADO', 'ACEPTADO_CON_OBSERVACIONES', 'RECHAZADO', 'ANULADO'] as const;
export type EstadoComprobante = (typeof ESTADOS_COMPROBANTE)[number];
export const ESTADO_INICIAL_COMPROBANTE: EstadoComprobante = 'PENDIENTE_ENVIO';

/** El correlativo de un comprobante SUNAT tiene 8 dígitos (ck_serie_sunat de seq). */
export const DIGITOS_NUMERO_COMPROBANTE = 8;

export function tipoDesdeCodigo(codigo: string): TipoComprobante {
  const tipo = TIPOS_COMPROBANTE.find((candidato) => CODIGO_SUNAT_POR_TIPO[candidato] === codigo);
  if (!tipo) throw new SerieNoCorrespondeError(`Tipo de comprobante desconocido: ${codigo}`);
  return tipo;
}

export function exigirSerieDelTipo(tipo: TipoComprobante, serie: string): void {
  if (FORMATO_SERIE.test(serie) && serie.startsWith(PREFIJO_SERIE[tipo])) return;
  throw new SerieNoCorrespondeError(`La serie ${serie} no corresponde a ${tipo === 'FACTURA' ? 'una factura (F###)' : 'una boleta (B###)'}`);
}

export function formatearNumero(serie: string, numero: number): string {
  return `${serie}-${String(numero).padStart(DIGITOS_NUMERO_COMPROBANTE, '0')}`;
}
