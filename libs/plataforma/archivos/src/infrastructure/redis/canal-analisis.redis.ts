import { AvisosEnEspera } from '@vitrina/plataforma/kernel-infra';
import type { Redis } from 'ioredis';
import type { CanalAnalisis, ResultadoAnalisis } from '../../application/ports/canal-analisis.js';

/** El último resultado sobrevive una hora: alcanza para que el front lo lea al conectar o reconectar. */
const TTL_RESULTADO_SEGUNDOS = 3_600;

export const canalAnalisisDe = (archivoId: string, numero: number): string => `arc:analisis:${archivoId}-${numero}`;
export const claveResultadoDe = (archivoId: string, numero: number): string => `${canalAnalisisDe(archivoId, numero)}:resultado`;

/**
 * Resultado del análisis del worker a la API por pub/sub. `suscribir` abre una conexión propia por stream:
 * una conexión suscrita no admite otros comandos.
 */
export class CanalAnalisisRedis implements CanalAnalisis {
  constructor(private readonly redis: Redis) {}

  async publicar(resultado: ResultadoAnalisis): Promise<void> {
    await this.conectar();
    const { archivoId, numero } = resultado;
    const mensaje = JSON.stringify(resultado);
    await this.redis
      .multi()
      .set(claveResultadoDe(archivoId, numero), mensaje, 'EX', TTL_RESULTADO_SEGUNDOS)
      .publish(canalAnalisisDe(archivoId, numero), mensaje)
      .exec();
  }

  async ultimo(archivoId: string, numero: number): Promise<ResultadoAnalisis | null> {
    await this.conectar();
    const guardado = await this.redis.get(claveResultadoDe(archivoId, numero));
    return guardado === null ? null : (JSON.parse(guardado) as ResultadoAnalisis);
  }

  async *suscribir(archivoId: string, numero: number, senal: AbortSignal): AsyncGenerator<ResultadoAnalisis> {
    const suscriptor = this.redis.duplicate();
    const espera = new AvisosEnEspera<ResultadoAnalisis>(senal);
    suscriptor.on('message', (_canal: string, mensaje: string) => espera.recibir(JSON.parse(mensaje) as ResultadoAnalisis));
    try {
      if (suscriptor.status === 'wait') await suscriptor.connect();
      await suscriptor.subscribe(canalAnalisisDe(archivoId, numero));
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
