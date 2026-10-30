import { FormControl, type AbstractControl, type ValidationErrors, type ValidatorFn } from '@angular/forms';
import { mensajeDeValidacion } from '@vitrina/shared/ui';
import { MENSAJES_VALIDACION_ORGANIZACION } from '../models/mensajes-organizacion';

export const ERROR_UBIGEO_FORMATO = 'ubigeoFormato';
export const ERROR_RUC_INVALIDO = 'rucInvalido';
export const ERROR_ESTABLECIMIENTO_FORMATO = 'establecimientoFormato';
export const ERROR_ESTABLECIMIENTO_PRINCIPAL = 'establecimientoPrincipal';
export const ERROR_CAPACIDAD_ENTERA = 'capacidadEntera';
export const ERROR_SUCURSAL_REQUERIDA = 'sucursalRequerida';

/** Sin catálogo UBIGEO hasta el 19a: solo el formato de 6 dígitos. */
const FORMATO_UBIGEO = /^\d{6}$/;

const MENSAJE_POR_ERROR: Readonly<Record<string, string>> = {
  [ERROR_UBIGEO_FORMATO]: MENSAJES_VALIDACION_ORGANIZACION.ubigeoFormato,
  [ERROR_RUC_INVALIDO]: MENSAJES_VALIDACION_ORGANIZACION.rucInvalido,
  [ERROR_ESTABLECIMIENTO_FORMATO]: MENSAJES_VALIDACION_ORGANIZACION.establecimientoFormato,
  [ERROR_ESTABLECIMIENTO_PRINCIPAL]: MENSAJES_VALIDACION_ORGANIZACION.establecimientoPrincipal,
  [ERROR_CAPACIDAD_ENTERA]: MENSAJES_VALIDACION_ORGANIZACION.capacidadEntera,
  [ERROR_SUCURSAL_REQUERIDA]: MENSAJES_VALIDACION_ORGANIZACION.sucursalRequerida,
};

/** Ubigeo opcional: vacío vale; si hay valor, 6 dígitos. */
export function validarUbigeo(control: AbstractControl): ValidationErrors | null {
  const ubigeo = (control.value as string).trim();
  return ubigeo === '' || FORMATO_UBIGEO.test(ubigeo) ? null : { [ERROR_UBIGEO_FORMATO]: true };
}

/** Mensaje del primer error del campo: los de organización y luego los genéricos de `shared/ui`. */
export function mensajeDeErrorOrganizacion(errores: ValidationErrors | null): string | null {
  const propio = Object.keys(errores ?? {}).find((codigo) => MENSAJE_POR_ERROR[codigo]);
  return propio ? MENSAJE_POR_ERROR[propio] : mensajeDeValidacion(errores);
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
