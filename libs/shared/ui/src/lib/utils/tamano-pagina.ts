/** Opciones del combo «Filas por página»: 20 es el tamaño por defecto de la API y 100 su máximo (spec 17a). */
export const TAMANOS_PAGINA = [20, 50, 100] as const;
export const TAMANO_PAGINA_POR_DEFECTO = TAMANOS_PAGINA[0];

/** Tamaño de página leído de la URL; un valor que no está entre las opciones vuelve al de por defecto. */
export function tamanoPaginaDesdeTexto(valor: string | null): number {
  const tamano = Number(valor);
  return (TAMANOS_PAGINA as readonly number[]).includes(tamano) ? tamano : TAMANO_PAGINA_POR_DEFECTO;
}

/** El tamaño por defecto queda fuera de la URL. */
export function tamanoPaginaParaUrl(tamano: number): number | null {
  return tamano === TAMANO_PAGINA_POR_DEFECTO ? null : tamano;
}
