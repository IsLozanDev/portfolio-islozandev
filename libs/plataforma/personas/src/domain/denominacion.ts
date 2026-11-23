import { ValidationError } from '@vitrina/plataforma/kernel';
import type { DocumentoIdentidad } from './documento-identidad.js';
import { TipoPersonaIncoherenteError } from './errores.js';

const NOMBRES_MAXIMO = 100;
const APELLIDO_MAXIMO = 60;
const RAZON_SOCIAL_MAXIMA = 200;
const PREFIJOS_RUC_NATURAL = ['10', '15', '17'];
const PREFIJOS_RUC_JURIDICA = ['20'];

export type TextoOpcional = string | null | undefined;

/** Nombres de una natural o razón social de una jurídica; lo que no aplica queda nulo. */
export interface DenominacionPersona {
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  razonSocial: string | null;
}

/** Lo que se propone como denominación, tal como llega: se recorta y se valida contra el documento. */
export interface DenominacionPropuesta {
  documento: DocumentoIdentidad;
  nombres?: TextoOpcional;
  apellidoPaterno?: TextoOpcional;
  apellidoMaterno?: TextoOpcional;
  razonSocial?: TextoOpcional;
}

export function denominarNatural(datos: DenominacionPropuesta): DenominacionPersona {
  const admiteNatural = datos.documento.tipo !== 'RUC' || datos.documento.esRucConPrefijo(PREFIJOS_RUC_NATURAL);
  if (!admiteNatural || recortar(datos.razonSocial) !== null) throw new TipoPersonaIncoherenteError();
  return {
    nombres: exigirTexto(datos.nombres, NOMBRES_MAXIMO, 'nombres'),
    apellidoPaterno: exigirTexto(datos.apellidoPaterno, APELLIDO_MAXIMO, 'apellido paterno'),
    apellidoMaterno: limitarTexto(recortar(datos.apellidoMaterno), APELLIDO_MAXIMO, 'apellido materno'),
    razonSocial: null,
  };
}

export function denominarJuridica(datos: DenominacionPropuesta): DenominacionPersona {
  const traeNombres = [datos.nombres, datos.apellidoPaterno, datos.apellidoMaterno].some((texto) => recortar(texto) !== null);
  if (!datos.documento.esRucConPrefijo(PREFIJOS_RUC_JURIDICA) || traeNombres) throw new TipoPersonaIncoherenteError();
  return {
    nombres: null,
    apellidoPaterno: null,
    apellidoMaterno: null,
    razonSocial: exigirTexto(datos.razonSocial, RAZON_SOCIAL_MAXIMA, 'razón social'),
  };
}

export function esMismaDenominacion(una: DenominacionPersona, otra: DenominacionPersona): boolean {
  return (
    una.nombres === otra.nombres &&
    una.apellidoPaterno === otra.apellidoPaterno &&
    una.apellidoMaterno === otra.apellidoMaterno &&
    una.razonSocial === otra.razonSocial
  );
}

/** Natural: «Quispe Mamani, Juana»; jurídica: la razón social. Para listas y sugerencias. */
export function denominacionVisible(denominacion: DenominacionPersona): string {
  if (denominacion.razonSocial !== null) return denominacion.razonSocial;
  const apellidos = [denominacion.apellidoPaterno, denominacion.apellidoMaterno].filter((apellido) => apellido !== null).join(' ');
  return `${apellidos}, ${denominacion.nombres ?? ''}`;
}

/** Vacío tras recortar cuenta como ausente. */
function recortar(texto: TextoOpcional): string | null {
  const recortado = texto?.trim() ?? '';
  return recortado === '' ? null : recortado;
}

function exigirTexto(texto: TextoOpcional, maximo: number, campo: string): string {
  const recortado = recortar(texto);
  if (recortado === null) throw new ValidationError(`El campo ${campo} es obligatorio`);
  return limitarTexto(recortado, maximo, campo);
}

function limitarTexto<Texto extends string | null>(texto: Texto, maximo: number, campo: string): Texto {
  if (texto !== null && texto.length > maximo) {
    throw new ValidationError(`El campo ${campo} admite hasta ${maximo} caracteres`);
  }
  return texto;
}
