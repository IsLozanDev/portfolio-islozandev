interface Guardable {
  readonly id: string;
  readonly principal: boolean;
}

export interface Diferencias<Elemento> {
  /** Ids que estaban guardados y ya no están en el agregado. */
  eliminados: string[];
  /** Primero los que dejan de ser principales: así el índice único parcial nunca ve dos principales. */
  cambiados: Elemento[];
  nuevos: Elemento[];
}

/**
 * Compara los contactos o direcciones del agregado con los que se leyeron. Los elementos son inmutables:
 * uno cambiado es otra instancia con el mismo id.
 */
export function compararConGuardados<Elemento extends Guardable>(
  actuales: readonly Elemento[],
  guardados: ReadonlyMap<string, Elemento>,
): Diferencias<Elemento> {
  const idsActuales = new Set(actuales.map((elemento) => elemento.id));
  const cambiados = actuales.filter((elemento) => guardados.has(elemento.id) && guardados.get(elemento.id) !== elemento);
  return {
    eliminados: [...guardados.keys()].filter((id) => !idsActuales.has(id)),
    cambiados: [...cambiados.filter((elemento) => !elemento.principal), ...cambiados.filter((elemento) => elemento.principal)],
    nuevos: actuales.filter((elemento) => !guardados.has(elemento.id)),
  };
}

export function porId<Elemento extends Guardable>(elementos: readonly Elemento[]): Map<string, Elemento> {
  return new Map(elementos.map((elemento) => [elemento.id, elemento]));
}
