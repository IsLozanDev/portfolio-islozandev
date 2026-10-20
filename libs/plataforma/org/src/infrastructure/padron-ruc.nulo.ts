import type { DatosPadron, PadronRucPort } from '../application/ports/padron-ruc.port.js';

/** Hasta que exista TR-IDN (R2) no hay padrón: la razón social se ingresa a mano. */
export class PadronRucNulo implements PadronRucPort {
  async consultar(): Promise<DatosPadron | null> {
    return null;
  }
}
