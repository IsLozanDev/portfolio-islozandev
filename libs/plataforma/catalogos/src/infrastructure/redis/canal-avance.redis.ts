import type { Redis } from 'ioredis';
import type { AvisoImportacion, CanalAvance } from '../../application/ports/importacion.js';
import { AvisosEnEspera } from '../avisos-en-espera.js';

/** El último aviso sobrevive una hora: alcanza para que el front reconecte y lea el estado. */
const TTL_AVANCE_SEGUNDOS = 3_600;

export const canalDe = (importacionId: string): string => `cat:importacion:${importacionId}`;
export const claveAvanceDe = (importacionId: string): string => `cat:importacion:${importacionId}:avance`;

/**
 * Avance del worker a la API por pub/sub. `suscribir` abre una conexión propia por stream: una conexión
 * suscrita no admite otros comandos.
 */
export class CanalAvanceRedis implements CanalAvance {
  constructor(private readonly redis: Redis) {}

  async publicar(importacionId: string, aviso: AvisoImportacion): Promise<void> {
    await this.conectar();
    const mensaje = JSON.stringify(aviso);
    await this.redis.multi().set(claveAvanceDe(importacionId), mensaje, 'EX', TTL_AVANCE_SEGUNDOS).publish(canalDe(importacionId), mensaje).exec();
  }

  async ultimo(importacionId: string): Promise<AvisoImportacion | null> {
    await this.conectar();
    const guardado = await this.redis.get(claveAvanceDe(importacionId));
    return guardado === null ? null : (JSON.parse(guardado) as AvisoImportacion);
  }

  async *suscribir(importacionId: string, senal: AbortSignal): AsyncGenerator<AvisoImportacion> {
    const suscriptor = this.redis.duplicate();
    const espera = new AvisosEnEspera(senal);
    suscriptor.on('message', (_canal: string, mensaje: string) => espera.recibir(JSON.parse(mensaje) as AvisoImportacion));
    try {
      if (suscriptor.status === 'wait') await suscriptor.connect();
      await suscriptor.subscribe(canalDe(importacionId));
      yield* espera.avisos();
    } finally {
      suscriptor.disconnect();
    }
  }

  /** lazyConnect: la primera llamada abre la conexión; después ioredis reconecta solo. */
  private async conectar(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}
