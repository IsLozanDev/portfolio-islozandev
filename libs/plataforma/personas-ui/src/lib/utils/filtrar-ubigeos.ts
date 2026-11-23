import type { Ubigeo } from '../models/ubigeo';
import { normalizarTexto } from './normalizar-texto';

export const MAXIMO_OPCIONES_UBIGEO = 20;

function textoBuscable(ubigeo: Ubigeo): string {
  return normalizarTexto(`${ubigeo.departamento} ${ubigeo.provincia} ${ubigeo.distrito}`);
}

/**
 * Distritos cuyo departamento, provincia o distrito contienen cada palabra escrita, sin tildes. Primero los que
 * empiezan como el distrito escrito. Vacío → ninguno.
 */
export function filtrarUbigeos(ubigeos: readonly Ubigeo[], texto: string, maximo = MAXIMO_OPCIONES_UBIGEO): Ubigeo[] {
  const palabras = normalizarTexto(texto).split(' ').filter(Boolean);
  if (palabras.length === 0) return [];
  const ultima = palabras[palabras.length - 1];
  const coinciden = ubigeos.filter((ubigeo) => {
    const buscable = textoBuscable(ubigeo);
    return palabras.every((palabra) => buscable.includes(palabra));
  });
  const empiezaComoElDistrito = (ubigeo: Ubigeo) => normalizarTexto(ubigeo.distrito).startsWith(ultima);
  return [...coinciden.filter(empiezaComoElDistrito), ...coinciden.filter((ubigeo) => !empiezaComoElDistrito(ubigeo))].slice(0, maximo);
}
