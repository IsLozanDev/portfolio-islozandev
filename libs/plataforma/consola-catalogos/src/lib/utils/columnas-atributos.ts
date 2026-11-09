import type { AtributosItem } from '@vitrina/plataforma/catalogos-ui';

/** Prefijo de la clave de celda de un atributo en la fila de la tabla: `atributo.departamento`. */
export const PREFIJO_ATRIBUTO = 'atributo.';
export type ClaveAtributo = `${typeof PREFIJO_ATRIBUTO}${string}`;

const SIN_VALOR = '—';
const SI = 'Sí';
const NO = 'No';
const SEPARADOR_DE_PALABRAS = /_/g;

/** Las claves de atributos que trae la página, ordenadas: una columna por clave (UBIGEO: departamento y provincia). */
export function clavesDeAtributos(atributosDeLaPagina: readonly AtributosItem[]): string[] {
  const claves = new Set(atributosDeLaPagina.flatMap((atributos) => Object.keys(atributos)));
  return [...claves].sort((claveA, claveB) => claveA.localeCompare(claveB));
}

export function claveDeCelda(clave: string): ClaveAtributo {
  return `${PREFIJO_ATRIBUTO}${clave}`;
}

/** `departamento` → «Departamento»; `valida_reniec` → «Valida reniec». */
export function tituloDeAtributo(clave: string): string {
  const texto = clave.replace(SEPARADOR_DE_PALABRAS, ' ');
  return texto.charAt(0).toLocaleUpperCase('es-PE') + texto.slice(1);
}

/** Las celdas de atributos de una fila, como texto; la clave que el ítem no tiene queda en «—». */
export function celdasDeAtributos(claves: readonly string[], atributos: AtributosItem): Record<ClaveAtributo, string> {
  return Object.fromEntries(claves.map((clave) => [claveDeCelda(clave), textoDeAtributo(atributos[clave])]));
}

function textoDeAtributo(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return SIN_VALOR;
  if (typeof valor === 'boolean') return valor ? SI : NO;
  return typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
}
