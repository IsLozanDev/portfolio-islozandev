import type { TipoDocumento } from '../models/persona';
import { normalizarTexto } from './normalizar-texto';
import { LONGITUD_DNI, LONGITUD_RUC, validarDocumento, type MotivoInvalidez } from './validar-documento';

/** «Auto» o un tipo de documento elegido en el selector del buscador. */
export type TipoElegido = 'AUTO' | TipoDocumento;

export const LONGITUD_MINIMA_TEXTO = 3;
export const LONGITUD_MINIMA_NUMERO = 4;

export type EntradaClasificada =
  | { clase: 'VACIA' }
  | { clase: 'CORTA'; mensaje: string }
  | { clase: 'INVALIDA'; tipo: TipoDocumento; motivo: MotivoInvalidez; mensaje: string }
  /** Búsqueda exacta por documento, con prellenado de TR-IDN si no existe. */
  | { clase: 'DOCUMENTO'; tipo: TipoDocumento; numero: string }
  /** Búsqueda en el listado: prefijo de documento o teléfono, correo, o nombre. */
  | { clase: 'NUMERO' | 'CORREO' | 'TEXTO'; valor: string };

const SEPARADORES_DE_NUMERO = /[\s-]/g;
const SOLO_DIGITOS = /^\d+$/;

const MENSAJES_MOTIVO: Record<MotivoInvalidez, (tipo: TipoDocumento) => string> = {
  LONGITUD: (tipo) => `El ${tipo === 'PASAPORTE' ? 'pasaporte' : tipo} no tiene la longitud correcta`,
  PREFIJO: () => 'El RUC debe empezar con 10, 15, 17 o 20',
  DIGITO_VERIFICADOR: () => 'El RUC no es válido: revisa el dígito verificador',
  CARACTERES: (tipo) => (tipo === 'DNI' || tipo === 'RUC' ? `El ${tipo} solo lleva dígitos` : 'Solo letras y dígitos, sin espacios'),
};

const LONGITUDES: Partial<Record<TipoDocumento, number>> = { DNI: LONGITUD_DNI, RUC: LONGITUD_RUC };

function documento(tipo: TipoDocumento, numero: string): EntradaClasificada {
  const validez = validarDocumento(tipo, numero);
  if (validez.valido) return { clase: 'DOCUMENTO', tipo, numero };
  return { clase: 'INVALIDA', tipo, motivo: validez.motivo, mensaje: MENSAJES_MOTIVO[validez.motivo](tipo) };
}

/** Con DNI o RUC elegido: mientras faltan dígitos, la entrada es corta; con los que corresponden, se valida. */
function documentoNumerico(tipo: 'DNI' | 'RUC', numero: string): EntradaClasificada {
  const longitud = LONGITUDES[tipo] as number;
  if (SOLO_DIGITOS.test(numero) && numero.length < longitud) return { clase: 'CORTA', mensaje: `El ${tipo} tiene ${longitud} dígitos` };
  return documento(tipo, numero);
}

/**
 * Qué escribió el usuario. Con un tipo elegido manda el tipo. En «Auto»: 8 dígitos son DNI, 11 son RUC, otros
 * dígitos (4 o más) son número; con `@`, correo; el resto, texto de 3 letras o más.
 */
export function clasificarEntrada(texto: string, tipoElegido: TipoElegido = 'AUTO'): EntradaClasificada {
  const recortado = texto.trim();
  if (recortado === '') return { clase: 'VACIA' };
  const sinSeparadores = recortado.replace(SEPARADORES_DE_NUMERO, '');

  if (tipoElegido === 'DNI' || tipoElegido === 'RUC') return documentoNumerico(tipoElegido, sinSeparadores);
  if (tipoElegido !== 'AUTO') return documento(tipoElegido, sinSeparadores.toUpperCase());

  if (SOLO_DIGITOS.test(sinSeparadores)) {
    if (sinSeparadores.length === LONGITUD_DNI) return documento('DNI', sinSeparadores);
    if (sinSeparadores.length === LONGITUD_RUC) return documento('RUC', sinSeparadores);
    if (sinSeparadores.length < LONGITUD_MINIMA_NUMERO) return { clase: 'CORTA', mensaje: 'Escribe al menos 4 dígitos' };
    return { clase: 'NUMERO', valor: sinSeparadores };
  }

  if (recortado.includes('@')) {
    if (recortado.length < LONGITUD_MINIMA_TEXTO) return { clase: 'CORTA', mensaje: 'Escribe al menos 3 caracteres' };
    return { clase: 'CORREO', valor: recortado.toLowerCase() };
  }

  if (normalizarTexto(recortado).replace(/\s/g, '').length < LONGITUD_MINIMA_TEXTO) return { clase: 'CORTA', mensaje: 'Escribe al menos 3 letras' };
  return { clase: 'TEXTO', valor: recortado };
}
