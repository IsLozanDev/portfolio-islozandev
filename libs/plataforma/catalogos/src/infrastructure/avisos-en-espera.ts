import type { AvisoImportacion } from '../application/ports/importacion.js';

/**
 * Cola de avisos que llegan por un callback y se consumen con `for await`. La espera se corta al abortar
 * la señal: un `return()` sobre un generador que espera no la cortaría.
 */
export class AvisosEnEspera {
  private readonly pendientes: AvisoImportacion[] = [];
  private despertar: (() => void) | null = null;

  constructor(private readonly senal: AbortSignal) {
    senal.addEventListener('abort', () => this.despertar?.(), { once: true });
  }

  recibir(aviso: AvisoImportacion): void {
    this.pendientes.push(aviso);
    this.despertar?.();
  }

  async *avisos(): AsyncGenerator<AvisoImportacion> {
    while (!this.senal.aborted) {
      const aviso = this.pendientes.shift();
      if (aviso) yield aviso;
      else await new Promise<void>((resolver) => (this.despertar = resolver));
    }
  }
}
