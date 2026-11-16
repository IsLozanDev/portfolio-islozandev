/** Las cuotas se abren y cierran a medianoche de Lima, igual que en el back. */
const ZONA_CUOTA = 'America/Lima';
const LOCALE_PERU = 'es-PE';
const MESES_DEL_ANIO = 12;
/** El actual y los 11 anteriores. */
const CANTIDAD_PERIODOS_SELECCIONABLES = 12;

const FORMATEADOR_PERIODO = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_CUOTA, year: 'numeric', month: '2-digit' });
const FORMATEADOR_MES = new Intl.DateTimeFormat(LOCALE_PERU, { timeZone: 'UTC', month: 'long' });

/** Mes en formato AAAA-MM según la hora de Lima. */
export function periodoActual(ahora: Date): string {
  const partes = FORMATEADOR_PERIODO.formatToParts(ahora);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((candidata) => candidata.type === tipo)?.value;
  return `${parte('year')}-${parte('month')}`;
}

/** El mes actual y los 11 anteriores, de más nuevo a más viejo. */
export function periodosSeleccionables(ahora: Date): string[] {
  const indiceActual = indiceDePeriodo(periodoActual(ahora));
  return Array.from({ length: CANTIDAD_PERIODOS_SELECCIONABLES }, (_, mesesAtras) => periodoDeIndice(indiceActual - mesesAtras));
}

/** `2026-11` → «noviembre 2026». El mes suelto sale en mayúscula de ICU (forma standalone). */
export function etiquetaPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  const nombreMes = FORMATEADOR_MES.format(Date.UTC(anio, mes - 1, 1)).toLocaleLowerCase(LOCALE_PERU);
  return `${nombreMes} ${anio}`;
}

export function esPeriodoActual(periodo: string, ahora: Date): boolean {
  return periodo === periodoActual(ahora);
}

/** Meses desde el año 0: restar meses es restar enteros. */
function indiceDePeriodo(periodo: string): number {
  const [anio, mes] = periodo.split('-').map(Number);
  return anio * MESES_DEL_ANIO + (mes - 1);
}

function periodoDeIndice(indice: number): string {
  const anio = Math.floor(indice / MESES_DEL_ANIO);
  const mes = (indice % MESES_DEL_ANIO) + 1;
  return `${anio}-${String(mes).padStart(2, '0')}`;
}
