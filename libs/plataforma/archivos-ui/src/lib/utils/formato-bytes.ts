const BYTES_POR_KB = 1024;
const UNIDADES = ['B', 'KB', 'MB', 'GB'] as const;
const DECIMALES_MAXIMOS = 1;
const FORMATO = new Intl.NumberFormat('es-PE', { maximumFractionDigits: DECIMALES_MAXIMOS });

/** `1258291` → «1.2 MB». Base 1024, como los límites de las categorías (25 MB = 26214400 B). */
export function formatoBytes(bytes: number): string {
  let valor = bytes;
  let unidad = 0;
  while (valor >= BYTES_POR_KB && unidad < UNIDADES.length - 1) {
    valor /= BYTES_POR_KB;
    unidad++;
  }
  return `${FORMATO.format(valor)} ${UNIDADES[unidad]}`;
}
