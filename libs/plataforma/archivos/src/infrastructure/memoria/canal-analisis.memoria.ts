import { AvisosEnEspera } from '@vitrina/plataforma/kernel-infra';
import type { CanalAnalisis, ResultadoAnalisis } from '../../application/ports/canal-analisis.js';

const claveDe = (archivoId: string, numero: number): string => `${archivoId}-${numero}`;

/** El mismo contrato que CanalAnalisisRedis, en un proceso: para pruebas sin Redis. `caido` simula Redis caído. */
export class CanalAnalisisMemoria implements CanalAnalisis {
  readonly publicados: ResultadoAnalisis[] = [];
  caido = false;
  private readonly oyentes = new Map<string, Set<(resultado: ResultadoAnalisis) => void>>();

  async publicar(resultado: ResultadoAnalisis): Promise<void> {
    this.exigirDisponible();
    this.publicados.push(resultado);
    this.oyentes.get(claveDe(resultado.archivoId, resultado.numero))?.forEach((oyente) => oyente(resultado));
  }

  async ultimo(archivoId: string, numero: number): Promise<ResultadoAnalisis | null> {
    this.exigirDisponible();
    return this.publicados.findLast((resultado) => resultado.archivoId === archivoId && resultado.numero === numero) ?? null;
  }

  /** Cuántas suscripciones siguen abiertas: para comprobar que se sueltan. */
  suscritos(archivoId: string, numero: number): number {
    return this.oyentes.get(claveDe(archivoId, numero))?.size ?? 0;
  }

  async *suscribir(archivoId: string, numero: number, senal: AbortSignal): AsyncGenerator<ResultadoAnalisis> {
    this.exigirDisponible();
    const clave = claveDe(archivoId, numero);
    const espera = new AvisosEnEspera<ResultadoAnalisis>(senal);
    const oyente = (resultado: ResultadoAnalisis) => espera.recibir(resultado);
    const oyentes = this.oyentes.get(clave) ?? new Set();
    this.oyentes.set(clave, oyentes.add(oyente));
    try {
      yield* espera.avisos();
    } finally {
      oyentes.delete(oyente);
    }
  }

  private exigirDisponible(): void {
    if (this.caido) throw new Error('Redis no disponible');
  }
}
