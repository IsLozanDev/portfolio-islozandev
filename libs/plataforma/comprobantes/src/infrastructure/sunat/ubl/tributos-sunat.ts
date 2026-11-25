/** Tributo del cat. 05 y categoría UN/ECE 5305 con que va una línea según su afectación (cat. 07). */
export interface TributoSunat {
  codigo: string;
  nombre: string;
  tipo: string;
  categoria: string;
}

export const TRIBUTO_IGV: TributoSunat = { codigo: '1000', nombre: 'IGV', tipo: 'VAT', categoria: 'S' };
export const TRIBUTO_EXONERADO: TributoSunat = { codigo: '9997', nombre: 'EXO', tipo: 'VAT', categoria: 'E' };
export const TRIBUTO_INAFECTO: TributoSunat = { codigo: '9998', nombre: 'INA', tipo: 'FRE', categoria: 'O' };

/** Orden en que van los TaxSubtotal del documento. */
export const TRIBUTOS_EMITIDOS: readonly TributoSunat[] = [TRIBUTO_IGV, TRIBUTO_EXONERADO, TRIBUTO_INAFECTO];

/** Gravado 10-17, exonerado 20-21, inafecto 30-37: las onerosas que admite el spec 51. */
const AFECTACIONES_POR_TRIBUTO: readonly [TributoSunat, readonly string[]][] = [
  [TRIBUTO_IGV, ['10', '11', '12', '13', '14', '15', '16', '17']],
  [TRIBUTO_EXONERADO, ['20', '21']],
  [TRIBUTO_INAFECTO, ['30', '31', '32', '33', '34', '35', '36', '37']],
];

/** Una afectación fuera de esos grupos es un error de programación: el 51 ya la valida contra el catálogo. */
export function tributoDeAfectacion(afectacionIgv: string): TributoSunat {
  const encontrado = AFECTACIONES_POR_TRIBUTO.find(([, afectaciones]) => afectaciones.includes(afectacionIgv));
  if (!encontrado) throw new Error(`Afectación de IGV sin tributo SUNAT: ${afectacionIgv}`);
  return encontrado[0];
}
