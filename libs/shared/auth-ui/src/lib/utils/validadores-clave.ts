import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const LONGITUD_MINIMA_CLAVE = 8;
export const ERROR_CLAVES_DISTINTAS = 'clavesDistintas';

/** Validador de grupo: `clave` y `confirmacion` deben ser iguales. */
export const clavesCoinciden: ValidatorFn = (grupo: AbstractControl): ValidationErrors | null => {
  const clave = grupo.get('clave')?.value;
  const confirmacion = grupo.get('confirmacion')?.value;
  if (!confirmacion || clave === confirmacion) return null;
  return { [ERROR_CLAVES_DISTINTAS]: true };
};
