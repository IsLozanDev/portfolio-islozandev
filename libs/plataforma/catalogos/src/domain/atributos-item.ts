import { ItemInvalidoError } from './errores.js';

/**
 * Atributos de un ítem (TR-CA-060: DNI con `longitud` 8 y `regex`). Las claves conocidas van tipadas; el
 * resto se conserva. El producto valida el valor contra `regex`: el patrón está limitado en tamaño y
 * compila, pero puede tener retroceso costoso.
 */
export interface AtributosItem {
  longitud?: number;
  regex?: string;
  valida_reniec?: boolean;
  mascara?: string;
  [clave: string]: unknown;
}

const LONGITUD_MINIMA = 1;
const LONGITUD_MAXIMA = 100;
const REGEX_MAXIMO = 200;
const MASCARA_MAXIMA = 50;
const BYTES_MAXIMOS = 4096;

/** Valida un objeto JSON de atributos y lo devuelve tipado. */
export function validarAtributos(atributos: unknown): AtributosItem {
  if (!esObjeto(atributos)) throw new ItemInvalidoError('Los atributos deben ser un objeto JSON');
  validarLongitud(atributos['longitud']);
  validarRegex(atributos['regex']);
  validarValidaReniec(atributos['valida_reniec']);
  validarMascara(atributos['mascara']);
  if (new TextEncoder().encode(JSON.stringify(atributos)).length > BYTES_MAXIMOS) {
    throw new ItemInvalidoError('Los atributos no pueden superar 4 KB');
  }
  return atributos as AtributosItem;
}

/** Igualdad sin importar el orden de las claves, como compara `jsonb`. */
export function mismosAtributos(uno: AtributosItem, otro: AtributosItem): boolean {
  return JSON.stringify(ordenarClaves(uno)) === JSON.stringify(ordenarClaves(otro));
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function validarLongitud(longitud: unknown): void {
  if (longitud === undefined) return;
  if (!Number.isInteger(longitud) || (longitud as number) < LONGITUD_MINIMA || (longitud as number) > LONGITUD_MAXIMA) {
    throw new ItemInvalidoError('El atributo longitud debe ser un entero de 1 a 100');
  }
}

function validarRegex(regex: unknown): void {
  if (regex === undefined) return;
  if (typeof regex !== 'string' || regex.length > REGEX_MAXIMO) {
    throw new ItemInvalidoError('El atributo regex debe ser un texto de hasta 200 caracteres');
  }
  try {
    new RegExp(regex);
  } catch {
    throw new ItemInvalidoError('El atributo regex no es una expresión regular válida');
  }
}

function validarValidaReniec(validaReniec: unknown): void {
  if (validaReniec !== undefined && typeof validaReniec !== 'boolean') {
    throw new ItemInvalidoError('El atributo valida_reniec debe ser verdadero o falso');
  }
}

function validarMascara(mascara: unknown): void {
  if (mascara === undefined) return;
  if (typeof mascara !== 'string' || mascara.length > MASCARA_MAXIMA) {
    throw new ItemInvalidoError('El atributo mascara debe ser un texto de hasta 50 caracteres');
  }
}

function ordenarClaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarClaves);
  if (!esObjeto(valor)) return valor;
  return Object.fromEntries(
    Object.keys(valor)
      .sort()
      .map((clave) => [clave, ordenarClaves(valor[clave])]),
  );
}
