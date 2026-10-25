export const TIPOS_DOCUMENTO = [
  'BOLETA',
  'FACTURA',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
  'TICKET',
  'KARDEX',
  'EXPEDIENTE',
  'HC',
  'ESCRITURA',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const REINICIOS = ['NUNCA', 'ANUAL', 'DIARIO'] as const;
export type Reinicio = (typeof REINICIOS)[number];

/** Comprobantes electrónicos SUNAT (TR-RN-017). */
export const TIPOS_COMPROBANTE: readonly TipoDocumento[] = ['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'];
export const DIGITOS_COMPROBANTE = 8;
export const DIGITOS_POR_DEFECTO = 8;
export const DIGITOS_MINIMOS = 1;
export const DIGITOS_MAXIMOS = 10;

export const esComprobante = (tipo: TipoDocumento): boolean => TIPOS_COMPROBANTE.includes(tipo);
