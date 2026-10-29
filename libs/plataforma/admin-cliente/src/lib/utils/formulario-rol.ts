import { FormControl, FormGroup, Validators } from '@angular/forms';
import type { FormularioRol } from '../models/rol';

// Los mismos límites que valida el dominio (TR-RF-011): código 3-50, nombre 3-100.
const LONGITUD_MINIMA = 3;
const LONGITUD_MAXIMA_CODIGO = 50;
const LONGITUD_MAXIMA_NOMBRE = 100;

export type GrupoRol = FormGroup<{
  codigo: FormControl<string>;
  nombre: FormControl<string>;
}>;

export function crearGrupoRol(): GrupoRol {
  return new FormGroup({
    codigo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(LONGITUD_MINIMA), Validators.maxLength(LONGITUD_MAXIMA_CODIGO)],
    }),
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(LONGITUD_MINIMA), Validators.maxLength(LONGITUD_MAXIMA_NOMBRE)],
    }),
  });
}

/** Sin espacios a los lados, como los recorta el dominio. */
export function aFormularioRol(grupo: GrupoRol): FormularioRol {
  const { codigo, nombre } = grupo.getRawValue();
  return { codigo: codigo.trim(), nombre: nombre.trim() };
}
