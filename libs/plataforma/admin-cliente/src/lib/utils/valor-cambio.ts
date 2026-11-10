const SIN_VALOR = '—';

/** Un lado de un cambio de auditoría como texto: «—» si falta, objetos y arreglos como JSON. */
export function textoDeValor(valor: unknown): string {
  if (valor === null || valor === undefined) return SIN_VALOR;
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}
