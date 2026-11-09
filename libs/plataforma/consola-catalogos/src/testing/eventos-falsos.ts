import { Observable, type Subscriber } from 'rxjs';
import type { AvisoImportacion } from '../lib/models/importacion';

/** Doble de `EventosImportacionCliente`: cada `abrir` queda abierto hasta que la prueba emite, corta o termina. */
export class EventosFalsos {
  readonly aperturas: string[] = [];
  readonly abiertos = new Map<string, Subscriber<AvisoImportacion>>();
  readonly cerrados: string[] = [];

  abrir(importacionId: string): Observable<AvisoImportacion> {
    return new Observable<AvisoImportacion>((suscriptor) => {
      this.aperturas.push(importacionId);
      this.abiertos.set(importacionId, suscriptor);
      return () => {
        this.cerrados.push(importacionId);
        if (this.abiertos.get(importacionId) === suscriptor) this.abiertos.delete(importacionId);
      };
    });
  }

  emitir(importacionId: string, aviso: AvisoImportacion): void {
    this.suscriptorDe(importacionId).next(aviso);
  }

  cortar(importacionId: string, error: unknown): void {
    this.suscriptorDe(importacionId).error(error);
  }

  private suscriptorDe(importacionId: string): Subscriber<AvisoImportacion> {
    const suscriptor = this.abiertos.get(importacionId);
    if (!suscriptor) throw new Error(`no hay stream abierto para ${importacionId}`);
    return suscriptor;
  }
}
