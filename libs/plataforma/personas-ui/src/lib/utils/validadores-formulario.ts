import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import type { ValorUbigeo } from '../models/ubigeo';
import { validarCelular, validarCorreo } from './validar-contacto';

/** `{ celular: true }` si no tiene 9 dígitos empezando con 9. Vacío lo deja a `required`. */
export const celularValido: ValidatorFn = (control: AbstractControl<string>): ValidationErrors | null => {
  const valor = control.value?.trim() ?? '';
  return valor === '' || validarCelular(valor) ? null : { celular: true };
};

/** `{ correo: true }` si no tiene forma de correo. Vacío es válido: el correo es opcional. */
export const correoValido: ValidatorFn = (control: AbstractControl<string>): ValidationErrors | null => {
  const valor = control.value?.trim() ?? '';
  return valor === '' || validarCorreo(valor) ? null : { correo: true };
};

/** `{ ubigeo: true }` si lo escrito no es un distrito elegido de la lista. Vacío lo deja a `required`. */
export const ubigeoElegido: ValidatorFn = (control: AbstractControl<ValorUbigeo>): ValidationErrors | null => {
  const valor = control.value;
  if (valor === null || valor === '') return null;
  return typeof valor === 'string' ? { ubigeo: true } : null;
};
