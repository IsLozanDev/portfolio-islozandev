import type { AvisoImportacion, CanalAvance } from '../application/ports/importacion.js';

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

  async *suscribir(importacionId: string): AsyncGenerator<AvisoImportacion> {
    const pendientes: AvisoImportacion[] = [];
    let despertar: (() => void) | null = null;
    const oyente = (aviso: AvisoImportacion) => {
      pendientes.push(aviso);
      despertar?.();
    };
    const oyentes = this.oyentes.get(importacionId) ?? new Set();
    this.oyentes.set(importacionId, oyentes.add(oyente));
    try {
      for (;;) {
        const aviso = pendientes.shift();
        if (aviso) yield aviso;
        else await new Promise<void>((resolver) => (despertar = resolver));
      }
    } finally {
      oyentes.delete(oyente);
    }
  }
}
