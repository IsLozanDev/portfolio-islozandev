import type { TipoContacto } from '../models/persona';

const GRUPOS_CELULAR = /^(\d{3})(\d{3})(\d{3})$/;

/** Celular como «987 654 321»; los demás tipos, tal como se guardaron. */
export function formatoContacto(tipo: TipoContacto, valor: string): string {
  return tipo === 'CELULAR' ? formatoCelular(valor) : valor;
}

export function formatoCelular(valor: string): string {
  return valor.replace(GRUPOS_CELULAR, '$1 $2 $3');
}
