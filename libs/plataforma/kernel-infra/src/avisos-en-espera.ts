/**
 * Cola de avisos que llegan por un callback y se consumen con `for await`. La espera se corta al abortar
 * la señal: un `return()` sobre un generador que espera no la cortaría.
 */
export class AvisosEnEspera<T> {
  private readonly pendientes: T[] = [];
  private despertar: (() => void) | null = null;

  constructor(private readonly senal: AbortSignal) {
    senal.addEventListener('abort', () => this.despertar?.(), { once: true });
  }

  recibir(aviso: T): void {
    this.pendientes.push(aviso);
    this.despertar?.();
  }

  async *avisos(): AsyncGenerator<T> {
    while (!this.senal.aborted) {
      if (this.pendientes.length > 0) yield this.pendientes.shift() as T;
      else await new Promise<void>((resolver) => (this.despertar = resolver));
    }
  }
}
