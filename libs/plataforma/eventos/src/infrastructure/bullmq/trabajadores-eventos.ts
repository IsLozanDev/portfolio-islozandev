import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { EntregarEvento } from '../../application/entregar-evento.js';
import type { RegistroSuscripciones } from '../../application/ports/suscripciones.js';
import type { EventoEntregado } from '../../domain/evento-entregado.js';
import { NombreConsumidor } from '../../domain/nombre-consumidor.js';
import { BACKOFF_EXPONENCIAL_CON_TOPE, esperaAntesDelReintento, type PoliticaReintentos } from './politica-reintentos.js';

/** Un trabajo sin `attempts` se intenta una vez. */
const INTENTOS_SIN_CONFIGURAR = 1;
/** BullMQ: devolver -1 desde el backoff manda el trabajo a fallidos sin reintentar. */
const SIN_REINTENTO = -1;

export interface OpcionesTrabajadores {
  conexion: Redis;
  concurrencia: number;
  politica: PoliticaReintentos;
}

/** Un `Worker` de BullMQ por consumidor, sobre su cola `evt-<consumidor>`. */
export class TrabajadoresEventos {
  private trabajadores: Worker<EventoEntregado>[] = [];

  constructor(
    private readonly opciones: OpcionesTrabajadores,
    private readonly suscripciones: RegistroSuscripciones,
    private readonly entregar: EntregarEvento,
  ) {}

  iniciar(): void {
    this.trabajadores = this.suscripciones.consumidores().map((consumidor) => this.crearTrabajador(consumidor));
  }

  /** `forzar` no espera los trabajos en curso: simula una caída. Los trabajos quedan atascados y BullMQ los reentrega. */
  async cerrar(forzar = false): Promise<void> {
    await Promise.all(this.trabajadores.map((trabajador) => trabajador.close(forzar)));
    this.trabajadores = [];
  }

  private crearTrabajador(consumidor: string): Worker<EventoEntregado> {
    const { conexion, concurrencia, politica } = this.opciones;
    return new Worker<EventoEntregado>(NombreConsumidor.de(consumidor).cola, (trabajo) => this.procesar(consumidor, trabajo), {
      connection: conexion,
      concurrency: concurrencia,
      settings: { backoffStrategy: (intentosHechos, tipo) => esperaSegunTipo(politica, intentosHechos, tipo) },
    });
  }

  /** `attemptsMade` cuenta los intentos fallidos anteriores a este. */
  private procesar(consumidor: string, trabajo: Job<EventoEntregado>): Promise<void> {
    return this.entregar.ejecutar({
      consumidor,
      evento: trabajo.data,
      intento: trabajo.attemptsMade + 1,
      intentosMaximos: trabajo.opts.attempts ?? INTENTOS_SIN_CONFIGURAR,
    });
  }
}

function esperaSegunTipo(politica: PoliticaReintentos, intentosHechos: number, tipo?: string): number {
  if (tipo !== BACKOFF_EXPONENCIAL_CON_TOPE) return SIN_REINTENTO;
  return esperaAntesDelReintento(politica, intentosHechos);
}
