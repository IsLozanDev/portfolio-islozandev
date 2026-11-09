import { FormControl, FormGroup, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { isoDesdeFecha } from '@vitrina/plataforma/catalogos-ui';
import { mensajeDeValidacion } from '@vitrina/shared/ui';
import { MENSAJES_IMPORTACION } from '../models/mensajes-catalogos';
import type { ArchivoAPrevisualizar } from '../services/importaciones.cliente';

const BYTES_POR_KILOBYTE = 1024;
const KILOBYTES_POR_MEGABYTE = 1024;
const LOCALE_PERU = 'es-PE';
/** El mismo tope que el back (19b). */
export const TAMANO_MAXIMO_ARCHIVO = 20 * KILOBYTES_POR_MEGABYTE * BYTES_POR_KILOBYTE;
export const EXTENSIONES_ACEPTADAS = ['.csv', '.xlsx'] as const;
const VERSION_OFICIAL_MAXIMA = 40;

export const ERROR_ARCHIVO_GRANDE = 'archivoGrande';
export const ERROR_ARCHIVO_TIPO = 'archivoTipo';
export const ERROR_FECHA_INVALIDA = 'matDatepickerParse';

export type GrupoImportacion = FormGroup<{
  archivo: FormControl<File | null>;
  versionOficial: FormControl<string>;
  fechaVigencia: FormControl<Date | null>;
}>;

const MENSAJE_POR_ERROR: Readonly<Record<string, string>> = {
  [ERROR_ARCHIVO_GRANDE]: MENSAJES_IMPORTACION.archivoGrande,
  [ERROR_ARCHIVO_TIPO]: MENSAJES_IMPORTACION.archivoTipo,
  [ERROR_FECHA_INVALIDA]: MENSAJES_IMPORTACION.fechaInvalida,
};

export function crearGrupoImportacion(): GrupoImportacion {
  return new FormGroup({
    archivo: new FormControl<File | null>(null, { validators: [Validators.required, validarArchivo] }),
    versionOficial: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(VERSION_OFICIAL_MAXIMA)] }),
    fechaVigencia: new FormControl<Date | null>(null, { validators: [Validators.required] }),
  });
}

/** Solo con el grupo válido. */
export function aArchivoAPrevisualizar(grupo: GrupoImportacion): ArchivoAPrevisualizar {
  const valor = grupo.getRawValue();
  return { archivo: valor.archivo as File, versionOficial: valor.versionOficial.trim(), fechaVigencia: isoDesdeFecha(valor.fechaVigencia as Date) };
}

export function mensajeDeErrorImportacion(errores: ValidationErrors | null): string | null {
  const propio = Object.keys(errores ?? {}).find((codigo) => MENSAJE_POR_ERROR[codigo]);
  return propio ? MENSAJE_POR_ERROR[propio] : mensajeDeValidacion(errores);
}

/** El archivo no es un campo de texto: «Elija un archivo» en vez de «Este campo es obligatorio». */
export function mensajeDeErrorArchivo(errores: ValidationErrors | null): string | null {
  return errores?.['required'] ? MENSAJES_IMPORTACION.archivoRequerido : mensajeDeErrorImportacion(errores);
}

/** «412 KB» o «1,5 MB»: el tamaño del archivo elegido. */
export function tamanoLegible(bytes: number): string {
  const kilobytes = bytes / BYTES_POR_KILOBYTE;
  if (kilobytes < KILOBYTES_POR_MEGABYTE) return `${Math.max(1, Math.round(kilobytes))} KB`;
  return `${(kilobytes / KILOBYTES_POR_MEGABYTE).toLocaleString(LOCALE_PERU, { maximumFractionDigits: 1 })} MB`;
}

/** Validado en el cliente para no subir 20 MB que el back va a rechazar. */
function validarArchivo(control: AbstractControl<File | null>): ValidationErrors | null {
  const archivo = control.value;
  if (!archivo) return null;
  const nombre = archivo.name.toLowerCase();
  if (!EXTENSIONES_ACEPTADAS.some((extension) => nombre.endsWith(extension))) return { [ERROR_ARCHIVO_TIPO]: true };
  return archivo.size > TAMANO_MAXIMO_ARCHIVO ? { [ERROR_ARCHIVO_GRANDE]: true } : null;
}
