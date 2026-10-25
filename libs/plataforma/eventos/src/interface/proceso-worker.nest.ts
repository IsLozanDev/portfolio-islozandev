import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { CicloRelay } from '../application/ciclo-relay.js';
import type { Avisar } from '../application/dependencias-entrega.js';
import type { RegistroSuscripciones } from '../application/ports/suscripciones.js';
import type { ColaEventosBullMQ } from '../infrastructure/bullmq/cola-eventos.bullmq.js';
import type { TrabajadoresEventos } from '../infrastructure/bullmq/trabajadores-eventos.js';

export interface PiezasWorker {
  suscripciones: RegistroSuscripciones;
  trabajadores: TrabajadoresEventos;
  ciclo: CicloRelay;
  cola: ColaEventosBullMQ;
  conexiones: Redis[];
  informar: Avisar;
}

/**
 * Arranca los `Worker` y el ciclo cuando ya se descubrieron las suscripciones (`onModuleInit`).
 * Al cerrar: deja de leer el outbox, espera los trabajos en curso y suelta Redis. La app cierra la base después.
 */
export class ProcesoWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
  constructor(private readonly piezas: PiezasWorker) {}

  onApplicationBootstrap(): void {
    const { suscripciones, trabajadores, ciclo, informar } = this.piezas;
    trabajadores.iniciar();
    ciclo.iniciar();
    informar('Worker de eventos iniciado', { consumidores: suscripciones.consumidores() });
  }

  async beforeApplicationShutdown(): Promise<void> {
    const { trabajadores, ciclo, cola, conexiones, informar } = this.piezas;
    await ciclo.detener();
    await trabajadores.cerrar();
    await cola.cerrar();
    for (const conexion of conexiones) conexion.disconnect();
    informar('Worker de eventos detenido', {});
  }
}
