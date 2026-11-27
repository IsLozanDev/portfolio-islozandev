import { ValidationError } from '@vitrina/plataforma/kernel';
import { validarRuc } from '@vitrina/shared/util';
import { CorreoInvalidoError, SitioWebInvalidoError, TelefonoInvalidoError } from './errores.js';

/** TR-RN-002: 11 dígitos, prefijo 10/15/17/20 y dígito verificador módulo 11. */
export class Ruc {
  private constructor(readonly valor: string) {}

  static de(valor: string): Ruc {
    if (!validarRuc(valor)) throw new ValidationError('RUC inválido');
    return new Ruc(valor);
  }
}

/** Solo formato: el catálogo UBIGEO llega con el spec 19a. */
export class Ubigeo {
  private constructor(readonly valor: string) {}

  static de(valor: string): Ubigeo {
    if (!/^\d{6}$/.test(valor)) throw new ValidationError('El ubigeo debe tener 6 dígitos');
    return new Ubigeo(valor);
  }

  static opcional(valor: string | null | undefined): string | null {
    return valor ? Ubigeo.de(valor).valor : null;
  }
}

/** Establecimiento anexo SUNAT; 0000 es el domicilio fiscal (TR-RN-003). */
export class CodigoEstablecimiento {
  static readonly DOMICILIO_FISCAL = '0000';

  private constructor(readonly valor: string) {}

  static de(valor: string): CodigoEstablecimiento {
    if (!/^\d{4}$/.test(valor)) throw new ValidationError('El código de establecimiento SUNAT debe tener 4 dígitos');
    return new CodigoEstablecimiento(valor);
  }

  static opcional(valor: string | null | undefined): string | null {
    return valor ? CodigoEstablecimiento.de(valor).valor : null;
  }
}

const CODIGO_PAIS_PERU = '+51';
const CODIGO_PAIS_SIN_SIGNO = '51';
const PREFIJO_TRONCAL = '0';
const CELULAR = /^9\d{8}$/;
const FIJO = /^[1-8]\d{7}$/;
const TELEFONO_E164_PERU = /^\+51(9\d{8}|[1-8]\d{7})$/;
const AREA_LIMA = '1';
/** 51 + un celular (9 dígitos), un fijo (8) o un fijo con el 0 troncal (9). */
const LARGOS_CON_CODIGO_PAIS = [10, 11];

/**
 * Teléfono peruano en E.164. Acepta «987 654 321», «(01) 555-0101», «054 123456» y «+51 987654321».
 * El 0 troncal solo va antes de un fijo: «0987654321» se rechaza.
 */
export class Telefono {
  private constructor(readonly valor: string) {}

  static de(texto: string): Telefono {
    const digitos = texto.replace(/\D/g, '');
    return new Telefono(CODIGO_PAIS_PERU + numeroNacional(digitos));
  }

  static opcional(texto: string | null | undefined): string | null {
    return texto?.trim() ? Telefono.de(texto).valor : null;
  }
}

function numeroNacional(digitos: string): string {
  const nacional = quitarCodigoPais(digitos);
  if (nacional.startsWith(PREFIJO_TRONCAL)) return exigir(FIJO, nacional.slice(PREFIJO_TRONCAL.length));
  if (CELULAR.test(nacional)) return nacional;
  return exigir(FIJO, nacional);
}

/** El 51 solo es código de país si lo siguen un celular o un fijo, con o sin el 0 troncal. */
function quitarCodigoPais(digitos: string): string {
  const conCodigoPais = digitos.startsWith(CODIGO_PAIS_SIN_SIGNO) && LARGOS_CON_CODIGO_PAIS.includes(digitos.length);
  return conCodigoPais ? digitos.slice(CODIGO_PAIS_SIN_SIGNO.length) : digitos;
}

function exigir(formato: RegExp, nacional: string): string {
  if (!formato.test(nacional)) throw new TelefonoInvalidoError();
  return nacional;
}

/**
 * Celular «987 654 321», fijo de Lima «(01) 555-0101», fijo de provincia «(054) 123-456».
 * Un valor que no es E.164 peruano (teléfono viejo de sucursal) se devuelve tal cual.
 */
export function formatoTelefono(e164: string): string {
  if (!TELEFONO_E164_PERU.test(e164)) return e164;
  const nacional = e164.slice(CODIGO_PAIS_PERU.length);
  if (CELULAR.test(nacional)) return `${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}`;
  if (nacional.startsWith(AREA_LIMA)) return `(0${AREA_LIMA}) ${nacional.slice(1, 4)}-${nacional.slice(4)}`;
  return `(0${nacional.slice(0, 2)}) ${nacional.slice(2, 5)}-${nacional.slice(5)}`;
}

const LARGO_MAXIMO_CORREO = 254;
const FORMATO_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Correo de contacto de la empresa, en minúsculas. */
export class CorreoEmpresa {
  private constructor(readonly valor: string) {}

  static de(texto: string): CorreoEmpresa {
    const correo = texto.trim().toLowerCase();
    if (correo.length > LARGO_MAXIMO_CORREO || !FORMATO_CORREO.test(correo)) throw new CorreoInvalidoError();
    return new CorreoEmpresa(correo);
  }

  static opcional(texto: string | null | undefined): string | null {
    return texto?.trim() ? CorreoEmpresa.de(texto).valor : null;
  }
}

const LARGO_MAXIMO_SITIO_WEB = 200;
const FORMATO_SITIO_WEB = /^https:\/\/[^\s/$.?#][^\s]*$/;

/** Solo https://. El dominio no completa el esquema: eso lo hace el front al salir del campo. */
export class SitioWeb {
  private constructor(readonly valor: string) {}

  static de(texto: string): SitioWeb {
    const sitio = texto.trim();
    if (sitio.length > LARGO_MAXIMO_SITIO_WEB || !FORMATO_SITIO_WEB.test(sitio)) throw new SitioWebInvalidoError();
    return new SitioWeb(sitio);
  }

  static opcional(texto: string | null | undefined): string | null {
    return texto?.trim() ? SitioWeb.de(texto).valor : null;
  }
}
