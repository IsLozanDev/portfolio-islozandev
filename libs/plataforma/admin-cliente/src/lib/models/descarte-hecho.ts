/** Clave del `history.state` con el par que la comparación acaba de descartar: la lista lo muestra con «Deshacer». */
export const ESTADO_DESCARTE = 'descarteDuplicado';

export interface DescarteHecho {
  idA: string;
  idB: string;
  texto: string;
}

export function esDescarteHecho(valor: unknown): valor is DescarteHecho {
  if (typeof valor !== 'object' || valor === null) return false;
  const { idA, idB, texto } = valor as Record<string, unknown>;
  return typeof idA === 'string' && typeof idB === 'string' && typeof texto === 'string';
}
