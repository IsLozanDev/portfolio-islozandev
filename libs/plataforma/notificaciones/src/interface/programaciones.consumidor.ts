import { SuscribirEvento, type EventoEntregado } from '@vitrina/plataforma/eventos';
import type { EncolarProgramacion } from '../application/programaciones/encolar-programacion.js';
import { EVENTOS_NOT, type ProgramacionRegistrada } from '../domain/eventos-not.js';

export const CONSUMIDOR_PROGRAMACIONES = 'not-programaciones';

/** Pasa cada programación registrada a la cola `not-programaciones`. EventosModule.registrarWorker lo descubre. */
export class ProgramacionesConsumidor {
  constructor(private readonly encolarProgramacion: EncolarProgramacion) {}

  @SuscribirEvento(EVENTOS_NOT.programacionRegistrada, { consumidor: CONSUMIDOR_PROGRAMACIONES })
  programacionRegistrada(evento: EventoEntregado): Promise<void> {
    return this.encolarProgramacion.ejecutar(evento.tenantId, evento.payload as ProgramacionRegistrada);
  }
}
