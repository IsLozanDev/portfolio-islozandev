import type { AbstractControl, ValidationErrors } from '@angular/forms';

// Mismas reglas que `Telefono` de ORG (libs/plataforma/org/src/domain/valores.ts): el front no importa libs de back.
const CODIGO_PAIS = '51';
const PREFIJO_INTERNACIONAL = '+';
const PREFIJO_TRONCAL = '0';
const AREA_LIMA = '1';
const PRIMER_DIGITO_CELULAR = '9';
const MAXIMO_DIGITOS = 9;
/** 51 + un celular (9 dígitos), un fijo (8) o un fijo con el 0 troncal (9). */
const MINIMO_DIGITOS_CON_CODIGO_PAIS = 10;
const CELULAR = /^9\d{8}$/;
const FIJO = /^[1-8]\d{7}$/;
const TELEFONO_E164_PERU = /^\+51(9\d{8}|[1-8]\d{7})$/;
const NO_DIGITO = /\D/g;

/** Cuántos dígitos van en el código de área (con el 0) y cómo se agrupan los del número. */
interface FormaTelefono {
  area: number;
  grupos: readonly number[];
  separador: string;
}

const CELULAR_FORMA: FormaTelefono = { area: 0, grupos: [3, 3, 3], separador: ' ' };
const FIJO_LIMA: FormaTelefono = { area: 2, grupos: [3, 4], separador: '-' };
const FIJO_PROVINCIA: FormaTelefono = { area: 3, grupos: [3, 3], separador: '-' };

export function esTelefonoPeru(valor: string): boolean {
  return TELEFONO_E164_PERU.test(valor);
}

export interface TelefonoNormalizado {
  /** Sin el +51 y, en un fijo, con el 0 troncal. Como mucho 9 dígitos. */
  nacional: string;
  /** Dígitos que se sumaron (el 0) o quitaron (el 51) al inicio: corrige la posición del cursor. */
  desplazamiento: number;
}

/** Lo que se escribió o pegó, como dígitos nacionales: «+51 987-654-321» → «987654321», «15550101» → «015550101». */
export function normalizarTelefono(texto: string): TelefonoNormalizado {
  const digitos = texto.replace(NO_DIGITO, '');
  const sinCodigoPais = tieneCodigoPais(texto, digitos) ? digitos.slice(CODIGO_PAIS.length) : digitos;
  const agregarTroncal = /^[1-8]/.test(sinCodigoPais);
  const nacional = (agregarTroncal ? PREFIJO_TRONCAL + sinCodigoPais : sinCodigoPais).slice(0, MAXIMO_DIGITOS);
  const quitados = digitos.length - sinCodigoPais.length;
  const agregados = agregarTroncal ? PREFIJO_TRONCAL.length : 0;
  return { nacional, desplazamiento: agregados - quitados };
}

export function digitosNacionales(texto: string): string {
  return normalizarTelefono(texto).nacional;
}

function tieneCodigoPais(texto: string, digitos: string): boolean {
  if (!digitos.startsWith(CODIGO_PAIS)) return false;
  return texto.trim().startsWith(PREFIJO_INTERNACIONAL) || digitos.length >= MINIMO_DIGITOS_CON_CODIGO_PAIS;
}

/** Índice de `visto` justo después de su dígito número `cantidad`: ahí queda el cursor tras dar formato. */
export function posicionTrasDigitos(visto: string, cantidad: number): number {
  if (cantidad <= 0) return 0;
  let contados = 0;
  for (let indice = 0; indice < visto.length; indice++) {
    if (/\d/.test(visto.charAt(indice))) contados++;
    if (contados === cantidad) return indice + 1;
  }
  return visto.length;
}

export function contarDigitos(texto: string): number {
  return texto.replace(NO_DIGITO, '').length;
}

/** E.164 si lo escrito es un celular o un fijo completo; si no, null. */
export function aE164(texto: string): string | null {
  const nacional = digitosNacionales(texto);
  if (CELULAR.test(nacional)) return `+${CODIGO_PAIS}${nacional}`;
  const fijo = nacional.slice(PREFIJO_TRONCAL.length);
  return nacional.startsWith(PREFIJO_TRONCAL) && FIJO.test(fijo) ? `+${CODIGO_PAIS}${fijo}` : null;
}

/**
 * Formato mientras se escribe: «987 654 321», «(01) 555-0101», «(054) 123-456». Los separadores solo van antes
 * de un dígito, para que borrar no se trabe en un espacio o un guion.
 */
export function formatoMientrasEscribe(texto: string): string {
  const nacional = digitosNacionales(texto);
  const forma = formaDe(nacional);
  if (!forma) return nacional;
  const area = nacional.slice(0, forma.area);
  const numero = agrupar(nacional.slice(forma.area), forma);
  if (!forma.area) return numero;
  return numero ? `(${area}) ${numero}` : area;
}

function formaDe(nacional: string): FormaTelefono | null {
  if (nacional.startsWith(PRIMER_DIGITO_CELULAR)) return CELULAR_FORMA;
  if (!nacional.startsWith(PREFIJO_TRONCAL)) return null;
  const primeroDelArea = nacional.charAt(PREFIJO_TRONCAL.length);
  if (primeroDelArea === AREA_LIMA) return FIJO_LIMA;
  return /[2-8]/.test(primeroDelArea) ? FIJO_PROVINCIA : null;
}

function agrupar(digitos: string, forma: FormaTelefono): string {
  const partes: string[] = [];
  let inicio = 0;
  for (const largo of forma.grupos) {
    const parte = digitos.slice(inicio, inicio + largo);
    if (parte) partes.push(parte);
    inicio += largo;
  }
  return partes.join(forma.separador);
}

/** Un E.164 peruano con formato; un valor que no lo es (teléfono viejo de sucursal) se devuelve tal cual. */
export function formatoTelefono(e164: string): string {
  return esTelefonoPeru(e164) ? formatoMientrasEscribe(e164) : e164;
}

/** Vacío es válido (el campo es opcional); lo demás debe ser un E.164 peruano. Error `telefonoPeru`. */
export function telefonoPeru(control: AbstractControl<string | null>): ValidationErrors | null {
  const valor = control.value;
  return !valor || esTelefonoPeru(valor) ? null : { telefonoPeru: true };
}
