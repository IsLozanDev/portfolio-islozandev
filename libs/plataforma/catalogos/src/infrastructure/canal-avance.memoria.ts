import type { AvisoImportacion, CanalAvance } from '../application/ports/importacion.js';
import { AvisosEnEspera } from './avisos-en-espera.js';

/** El mismo contrato que CanalAvanceRedis, en un proceso: para pruebas sin Redis. */
export class CanalAvanceMemoria implements CanalAvance {
  readonly publicados = new Map<string, AvisoImportacion[]>();
  private readonly oyentes = new Map<string, Set<(aviso: AvisoImportacion) => void>>();

  async publicar(importacionId: string, aviso: AvisoImportacion): Promise<void> {
    this.publicados.set(importacionId, [...(this.publicados.get(importacionId) ?? []), aviso]);
    this.oyentes.get(importacionId)?.forEach((oyente) => oyente(aviso));
  }

  async ultimo(importacionId: string): Promise<AvisoImportacion | null> {
    return this.publicados.get(importacionId)?.at(-1) ?? null;
  }

  /** Cuántas suscripciones siguen abiertas: para comprobar que se sueltan. */
  suscritos(importacionId: string): number {
    return this.oyentes.get(importacionId)?.size ?? 0;
  }

  async *suscribir(importacionId: string, senal: AbortSignal): AsyncGenerator<AvisoImportacion> {
    const espera = new AvisosEnEspera(senal);
    const oyente = (aviso: AvisoImportacion) => espera.recibir(aviso);
    const oyentes = this.oyentes.get(importacionId) ?? new Set();
    this.oyentes.set(importacionId, oyentes.add(oyente));
    try {
      yield* espera.avisos();
    } finally {
      oyentes.delete(oyente);
    }
  }
}
