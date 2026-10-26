import type { ValidationErrors } from '@angular/forms';

interface DetalleValidacion {
  requiredLength?: number;
  min?: number;
  max?: number;
}

export const MENSAJE_VALIDACION_GENERICO = 'El valor no es válido.';

const MENSAJE_POR_VALIDADOR: Readonly<Record<string, (detalle: DetalleValidacion) => string>> = {
  required: () => 'Este campo es obligatorio.',
  email: () => 'Ingrese un correo válido.',
  minlength: (detalle) => `Ingrese al menos ${detalle.requiredLength} caracteres.`,
  maxlength: (detalle) => `Ingrese como máximo ${detalle.requiredLength} caracteres.`,
  min: (detalle) => `El valor mínimo es ${detalle.min}.`,
  max: (detalle) => `El valor máximo es ${detalle.max}.`,
  pattern: () => 'El formato no es válido.',
};

/** Mensaje en español del primer error de un control; `null` si no hay errores. */
export function mensajeDeValidacion(errores: ValidationErrors | null): string | null {
  const [validador] = Object.keys(errores ?? {});
  if (!errores || !validador) return null;
  const redactar = MENSAJE_POR_VALIDADOR[validador];
  return redactar ? redactar(errores[validador] as DetalleValidacion) : MENSAJE_VALIDACION_GENERICO;
}
