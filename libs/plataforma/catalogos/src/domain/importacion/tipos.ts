/** Las 7 tablas oficiales que se importan desde archivo (TR-RF-028). */
export const TABLAS_IMPORTABLES = [
  'UBIGEO',
  'CIE10',
  'TIPO_COMPROBANTE',
  'UNIDAD_MEDIDA',
  'TIPO_DOC_IDENTIDAD',
  'AFECTACION_IGV',
  'MONEDA',
] as const;
export type TablaImportable = (typeof TABLAS_IMPORTABLES)[number];

export const ESTADOS_IMPORTACION = ['PREVISUALIZADA', 'RECHAZADA', 'EN_COLA', 'APLICADA', 'FALLIDA', 'OBSOLETA', 'VENCIDA'] as const;
export type EstadoImportacion = (typeof ESTADOS_IMPORTACION)[number];
/** EN_PROCESO solo vive en Redis: la base sigue en EN_COLA hasta el commit del worker. */
export type EstadoSeguimiento = EstadoImportacion | 'EN_PROCESO';

export const HORAS_VIGENCIA_PREVISUALIZACION = 24;
export const HORAS_MAXIMAS_EN_COLA = 1;
export const TAMANO_LOTE = 1_000;
export const ERRORES_EN_RESPUESTA = 100;
/** Se sigue contando el total de errores más allá del tope. */
export const ERRORES_MAXIMOS_GUARDADOS = 10_000;
export const TAMANO_MAXIMO_ARCHIVO = 20 * 1024 * 1024;
export const FILAS_MAXIMAS = 50_000;

export function esTablaImportable(codigo: string): codigo is TablaImportable {
  return (TABLAS_IMPORTABLES as readonly string[]).includes(codigo);
}

/** Error de una fila del archivo; `fila` es el número de fila del archivo, con la cabecera en la 1. */
export interface ErrorFila {
  fila: number;
  columna: string;
  valor: string;
  mensaje: string;
}
