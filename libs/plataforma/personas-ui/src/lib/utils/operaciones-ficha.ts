import { signal } from '@angular/core';
import type { CambioFicha } from '../models/ficha';
import type { PersonaDetalle } from '../models/persona';
import { resultadoDeOperacion } from './cambios-ficha';

/** Una operación a la vez de una sección de la ficha, con su error a la vista; el cambio va a `avisar`. */
export class OperacionesFicha {
  readonly ocupado = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private readonly avisar: (cambio: CambioFicha) => void) {}

  async correr(operacion: () => Promise<PersonaDetalle | null>): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set(null);
    const resultado = await resultadoDeOperacion(operacion);
    this.ocupado.set(false);
    if (resultado.tipo === 'error') this.error.set(resultado.mensaje);
    else this.avisar(resultado);
  }
}
