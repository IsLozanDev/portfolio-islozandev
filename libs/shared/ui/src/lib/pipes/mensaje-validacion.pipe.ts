import { Pipe, type PipeTransform } from '@angular/core';
import type { ValidationErrors } from '@angular/forms';
import { mensajeDeValidacion } from '../utils/mensaje-de-validacion';

/** `<mat-error>{{ control.errors | mensajeValidacion }}</mat-error>` */
@Pipe({ name: 'mensajeValidacion' })
export class MensajeValidacionPipe implements PipeTransform {
  transform(errores: ValidationErrors | null): string | null {
    return mensajeDeValidacion(errores);
  }
}
