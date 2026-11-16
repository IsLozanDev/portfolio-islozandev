const LOCALE_PERU = 'es-PE';

const FORMATEADOR_MES = new Intl.DateTimeFormat(LOCALE_PERU, { timeZone: 'UTC', month: 'long' });

/** `2026-11` → «noviembre 2026». El mes suelto sale en mayúscula de ICU (forma standalone). Copia de `consola-identidad`. */
export function etiquetaPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  const nombreMes = FORMATEADOR_MES.format(Date.UTC(anio, mes - 1, 1)).toLocaleLowerCase(LOCALE_PERU);
  return `${nombreMes} ${anio}`;
}
