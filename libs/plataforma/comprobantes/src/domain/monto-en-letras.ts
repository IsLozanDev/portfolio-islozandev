import { redondear2, type Decimal } from './comprobante/dinero.js';
import type { Moneda } from './comprobante/tipo-comprobante.js';
import { DatosComprobanteInvalidosError } from './errores.js';

const MAXIMO_ENTERO_EN_LETRAS = 999_999_999;
const CENTIMOS_POR_UNIDAD = 100n;
const DIGITOS_CENTIMOS = 2;
const MILLON = 1_000_000;
const MIL = 1_000;
const CENTENA = 100;
const DECENA = 10;
const LIMITE_NOMBRE_PROPIO = 30;

const NOMBRE_MONEDA: Readonly<Record<Moneda, string>> = { PEN: 'SOLES', USD: 'DÓLARES AMERICANOS' };

/** Del 0 al 29 cada número tiene nombre propio. */
const MENORES_DE_TREINTA = [
  'CERO', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
] as const;
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'] as const;
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'] as const;
const CIEN_EXACTO = 'CIEN';
const PALABRA_MIL = 'MIL';
const UN_MILLON = 'UN MILLÓN';
const PALABRA_MILLONES = 'MILLONES';
/** Delante de «mil» y «millones», «uno» pierde la última sílaba: «veintiún mil», «treinta y un millones». */
const APOCOPE: Readonly<Record<string, string>> = { UNO: 'UN', VEINTIUNO: 'VEINTIÚN' };

function apocopar(palabras: string): string {
  const separadas = palabras.split(' ');
  const ultima = separadas.pop() ?? '';
  return [...separadas, APOCOPE[ultima] ?? ultima].join(' ');
}

function decenasEnLetras(numero: number): string {
  if (numero < LIMITE_NOMBRE_PROPIO) return MENORES_DE_TREINTA[numero];
  const unidad = numero % DECENA;
  const decena = DECENAS[Math.floor(numero / DECENA)];
  return unidad === 0 ? decena : `${decena} Y ${MENORES_DE_TREINTA[unidad]}`;
}

/** 1 a 999. */
function centenasEnLetras(numero: number): string {
  if (numero === CENTENA) return CIEN_EXACTO;
  const centena = CENTENAS[Math.floor(numero / CENTENA)];
  const resto = numero % CENTENA;
  if (resto === 0) return centena;
  return centena === '' ? decenasEnLetras(resto) : `${centena} ${decenasEnLetras(resto)}`;
}

function millonesEnLetras(millones: number): string {
  if (millones === 0) return '';
  if (millones === 1) return UN_MILLON;
  return `${apocopar(centenasEnLetras(millones))} ${PALABRA_MILLONES}`;
}

function milesEnLetras(miles: number): string {
  if (miles === 0) return '';
  if (miles === 1) return PALABRA_MIL;
  return `${apocopar(centenasEnLetras(miles))} ${PALABRA_MIL}`;
}

function enteroEnLetras(entero: number): string {
  if (entero === 0) return MENORES_DE_TREINTA[0];
  const unidades = entero % MIL;
  const partes = [
    millonesEnLetras(Math.floor(entero / MILLON)),
    milesEnLetras(Math.floor(entero / MIL) % MIL),
    unidades === 0 ? '' : centenasEnLetras(unidades),
  ];
  return partes.filter((parte) => parte !== '').join(' ');
}

/** Leyenda 1000 del comprobante: «CIENTO DIECIOCHO CON 00/100 SOLES». */
export function montoEnLetras(total: Decimal, moneda: Moneda): string {
  const centimosTotales = redondear2(total).unidades;
  const entero = Number(centimosTotales / CENTIMOS_POR_UNIDAD);
  if (centimosTotales < 0n || entero > MAXIMO_ENTERO_EN_LETRAS) {
    throw new DatosComprobanteInvalidosError(`total: «${total.aTexto()}» está fuera del rango que se expresa en letras`);
  }
  const centimos = String(centimosTotales % CENTIMOS_POR_UNIDAD).padStart(DIGITOS_CENTIMOS, '0');
  return `${enteroEnLetras(entero)} CON ${centimos}/100 ${NOMBRE_MONEDA[moneda]}`;
}
