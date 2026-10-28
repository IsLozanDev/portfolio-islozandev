import { Injectable, signal } from '@angular/core';
import type { ValorFormularioAlta } from '../utils/formulario-alta';

export interface BorradorAlta {
  valor: ValorFormularioAlta;
  paso: number;
}

/**
 * Datos del asistente de alta mientras el operador va a `/auth/mfa` y vuelve. Solo en memoria: el
 * correo del propietario es dato personal y no se guarda en el navegador. Un recargo lo pierde.
 */
@Injectable({ providedIn: 'root' })
export class BorradorAltaService {
  private readonly borrador = signal<BorradorAlta | null>(null);

  leer(): BorradorAlta | null {
    return this.borrador();
  }

  guardar(borrador: BorradorAlta): void {
    this.borrador.set(borrador);
  }

  limpiar(): void {
    this.borrador.set(null);
  }
}
