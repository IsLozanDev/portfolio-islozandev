import { FormControl, type AbstractControl, type ValidationErrors, type ValidatorFn } from '@angular/forms';
import type { ValorUbigeo } from '@vitrina/plataforma/personas-ui';
import { mensajeDeValidacion } from '@vitrina/shared/ui';
import { MENSAJES_VALIDACION_ORGANIZACION } from '../models/mensajes-organizacion';

export const ERROR_RUC_INVALIDO = 'rucInvalido';
export const ERROR_ESTABLECIMIENTO_FORMATO = 'establecimientoFormato';
export const ERROR_ESTABLECIMIENTO_PRINCIPAL = 'establecimientoPrincipal';
export const ERROR_CAPACIDAD_ENTERA = 'capacidadEntera';
export const ERROR_SUCURSAL_REQUERIDA = 'sucursalRequerida';
/** El que pone `telefonoPeru` de shared/ui. */
export const ERROR_TELEFONO_PERU = 'telefonoPeru';
export const ERROR_SITIO_WEB = 'sitioWeb';

/** El mismo patrón que `SitioWeb` de ORG y el CHECK de org.empresa.sitio_web. */
const FORMATO_SITIO_WEB = /^https:\/\/[^\s/$.?#][^\s]*$/;
const ESQUEMA_WEB = 'https://';
const CON_ESQUEMA = /^[a-z][a-z0-9+.-]*:\/\//i;

const MENSAJE_POR_ERROR: Readonly<Record<string, string>> = {
  [ERROR_RUC_INVALIDO]: MENSAJES_VALIDACION_ORGANIZACION.rucInvalido,
  [ERROR_ESTABLECIMIENTO_FORMATO]: MENSAJES_VALIDACION_ORGANIZACION.establecimientoFormato,
  [ERROR_ESTABLECIMIENTO_PRINCIPAL]: MENSAJES_VALIDACION_ORGANIZACION.establecimientoPrincipal,
  [ERROR_CAPACIDAD_ENTERA]: MENSAJES_VALIDACION_ORGANIZACION.capacidadEntera,
  [ERROR_SUCURSAL_REQUERIDA]: MENSAJES_VALIDACION_ORGANIZACION.sucursalRequerida,
  [ERROR_TELEFONO_PERU]: MENSAJES_VALIDACION_ORGANIZACION.telefonoPeru,
  [ERROR_SITIO_WEB]: MENSAJES_VALIDACION_ORGANIZACION.sitioWeb,
};

/** Sitio web opcional: vacío vale; si hay valor, solo https://. */
export function validarSitioWeb(control: AbstractControl): ValidationErrors | null {
  const sitio = (control.value as string).trim();
  return sitio === '' || FORMATO_SITIO_WEB.test(sitio) ? null : { [ERROR_SITIO_WEB]: true };
}

/**
 * Al salir del campo: «www.empresa.pe» → «https://www.empresa.pe». Un texto con otro esquema (http://) no se
 * toca, para que el validador lo marque.
 */
export function completarEsquemaWeb(texto: string): string {
  const sitio = texto.trim();
  return sitio === '' || CON_ESQUEMA.test(sitio) ? sitio : ESQUEMA_WEB + sitio;
}

/** Mensaje del primer error del campo: los de organización y luego los genéricos de `shared/ui`. */
export function mensajeDeErrorOrganizacion(errores: ValidationErrors | null): string | null {
  const propio = Object.keys(errores ?? {}).find((codigo) => MENSAJE_POR_ERROR[codigo]);
  return propio ? MENSAJE_POR_ERROR[propio] : mensajeDeValidacion(errores);
}

/** El elegido viaja por su código; un texto solo llega aquí con el campo deshabilitado (el código guardado). */
export function codigoDeUbigeo(valor: ValorUbigeo): string | null {
  if (valor === null) return null;
  return typeof valor === 'string' ? textoONulo(valor) : valor.codigo;
}

/** Recorta como el dominio; un texto opcional vacío viaja como null. */
export function textoONulo(valor: string): string | null {
  const recortado = valor.trim();
  return recortado === '' ? null : recortado;
}

/** Control de texto que vuelve a `inicial` (no a null) con `reset`. */
export function campoDeTexto(inicial: string, ...validadores: ValidatorFn[]): FormControl<string> {
  return new FormControl(inicial, { nonNullable: true, validators: validadores });
}
