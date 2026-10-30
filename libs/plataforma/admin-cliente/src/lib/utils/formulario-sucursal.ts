import { FormControl, FormGroup, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import type { DatosSucursal, Sucursal } from '../models/sucursal';
import { ERROR_ESTABLECIMIENTO_FORMATO, ERROR_ESTABLECIMIENTO_PRINCIPAL, textoONulo, validarUbigeo } from './validadores-organizacion';

/** El domicilio fiscal: solo la sucursal principal lo lleva (TR-RN-003). */
export const ESTABLECIMIENTO_PRINCIPAL = '0000';
export const ZONA_HORARIA_POR_DEFECTO = 'America/Lima';

// Los límites de TR-RF-003 que valida la API.
const LONGITUD_MAXIMA_CODIGO = 20;
const LONGITUD_MINIMA_NOMBRE = 3;
const LONGITUD_MAXIMA_NOMBRE = 150;
const LONGITUD_MAXIMA_DIRECCION = 250;
const LONGITUD_MAXIMA_TELEFONO = 30;
const LONGITUD_MAXIMA_ZONA_HORARIA = 40;
const FORMATO_ESTABLECIMIENTO = /^\d{4}$/;

export type GrupoSucursal = FormGroup<{
  codigo: FormControl<string>;
  nombre: FormControl<string>;
  codigoEstablecimientoSunat: FormControl<string>;
  direccion: FormControl<string>;
  ubigeo: FormControl<string>;
  telefono: FormControl<string>;
  zonaHoraria: FormControl<string>;
}>;

export function crearGrupoSucursal(): GrupoSucursal {
  return new FormGroup({
    codigo: texto('', Validators.required, Validators.maxLength(LONGITUD_MAXIMA_CODIGO)),
    nombre: texto('', Validators.required, Validators.minLength(LONGITUD_MINIMA_NOMBRE), Validators.maxLength(LONGITUD_MAXIMA_NOMBRE)),
    codigoEstablecimientoSunat: texto('', validarEstablecimiento),
    direccion: texto('', Validators.maxLength(LONGITUD_MAXIMA_DIRECCION)),
    ubigeo: texto('', validarUbigeo),
    telefono: texto('', Validators.maxLength(LONGITUD_MAXIMA_TELEFONO)),
    zonaHoraria: texto(ZONA_HORARIA_POR_DEFECTO, Validators.required, Validators.maxLength(LONGITUD_MAXIMA_ZONA_HORARIA)),
  });
}

/**
 * Edición. En la principal el establecimiento queda fijo en 0000 (el dominio no deja cambiarlo):
 * el control deshabilitado no se valida, pero `getRawValue` lo envía.
 */
export function cargarSucursal(grupo: GrupoSucursal, sucursal: Sucursal): void {
  grupo.reset({
    codigo: sucursal.codigo,
    nombre: sucursal.nombre,
    codigoEstablecimientoSunat: sucursal.esPrincipal ? ESTABLECIMIENTO_PRINCIPAL : (sucursal.codigoEstablecimientoSunat ?? ''),
    direccion: sucursal.direccion ?? '',
    ubigeo: sucursal.ubigeo ?? '',
    telefono: sucursal.telefono ?? '',
    zonaHoraria: sucursal.zonaHoraria,
  });
  if (sucursal.esPrincipal) grupo.controls.codigoEstablecimientoSunat.disable();
}

/** Brecha 5 del contexto: la que dejó de ser principal quedó sin establecimiento y conviene asignarle uno. */
export function faltaEstablecimiento(sucursal: Sucursal): boolean {
  return !sucursal.esPrincipal && sucursal.codigoEstablecimientoSunat === null;
}

export function aDatosSucursal(grupo: GrupoSucursal): DatosSucursal {
  const valor = grupo.getRawValue();
  return {
    codigo: valor.codigo.trim(),
    nombre: valor.nombre.trim(),
    codigoEstablecimientoSunat: textoONulo(valor.codigoEstablecimientoSunat),
    direccion: textoONulo(valor.direccion),
    ubigeo: textoONulo(valor.ubigeo),
    telefono: textoONulo(valor.telefono),
    zonaHoraria: valor.zonaHoraria.trim(),
  };
}

/** Opcional, de 4 dígitos, y nunca 0000 en una sucursal que no es la principal. */
function validarEstablecimiento(control: AbstractControl): ValidationErrors | null {
  const establecimiento = (control.value as string).trim();
  if (establecimiento === '') return null;
  if (!FORMATO_ESTABLECIMIENTO.test(establecimiento)) return { [ERROR_ESTABLECIMIENTO_FORMATO]: true };
  return establecimiento === ESTABLECIMIENTO_PRINCIPAL ? { [ERROR_ESTABLECIMIENTO_PRINCIPAL]: true } : null;
}

function texto(inicial: string, ...validadores: ((control: AbstractControl) => ValidationErrors | null)[]): FormControl<string> {
  return new FormControl(inicial, { nonNullable: true, validators: validadores });
}
