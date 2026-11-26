import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  ErrorTecnicoPseError,
  NOMBRE_COLA_PRUEBAS_FE,
  type EjecutarPruebaEmisor,
  type IntentoPrueba,
  type TrabajoPruebaFe,
} from '@vitrina/plataforma/comprobantes';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';

type Registrar = (mensaje: string, datos: Record<string, unknown>) => void;
/** Pocas pruebas y cada una espera al PSE hasta 15 s. */
const CONCURRENCIA = 2;
const INTENTOS_SIN_CONFIGURAR = 1;

/**
 * Procesa la cola `fe-pruebas` (spec 50). Los reintentos son de BullMQ (3 con espera exponencial al encolar):
 * EjecutarPruebaEmisor relanza un ERROR_TECNICO y en el último intento deja la prueba en ERROR.
 */
export class TareaPruebasFe implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private trabajador: Worker<TrabajoPruebaFe> | null = null;

  constructor(
    redisUrl: string,
    private readonly ejecutarPrueba: Pick<EjecutarPruebaEmisor, 'ejecutar'>,
    private readonly informar: Registrar,
    private readonly avisar: Registrar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis de las pruebas de FE no disponible', { error: error.name }));
  }

  async onApplicationBootstrap(): Promise<void> {
    this.trabajador = new Worker<TrabajoPruebaFe>(NOMBRE_COLA_PRUEBAS_FE, (trabajo) => this.ejecutarPrueba.ejecutar(trabajo.data, intentoDe(trabajo)), {
      connection: this.conexion,
      concurrency: CONCURRENCIA,
    });
    this.trabajador.on('failed', (trabajo, error) => {
      // Solo el emisor, el número y el nombre del error: nunca el token ni la URL (TR-RNF-026).
      this.avisar('Prueba de FE falló', { emisor_id: trabajo?.data.emisorId, numero_prueba: trabajo?.data.numeroPrueba, error: error.name });
      if (esFalloDefinitivo(trabajo) && !(error instanceof ErrorTecnicoPseError)) this.reportador.reportar(error, { cola: NOMBRE_COLA_PRUEBAS_FE });
    });
    this.informar('Cola de pruebas de FE lista', { cola: NOMBRE_COLA_PRUEBAS_FE });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    this.conexion.disconnect();
  }
}

type TrabajoBullmq = Pick<Job, 'attemptsMade' | 'opts'>;

/** `attemptsMade` cuenta los intentos ya fallidos: el que corre es el siguiente. Lo usan las colas de FE. */
export function intentoDe(trabajo: TrabajoBullmq): IntentoPrueba {
  const numero = trabajo.attemptsMade + 1;
  return { numero, esUltimo: numero >= intentosPermitidos(trabajo) };
}

/** BullMQ avisa `failed` en cada intento; solo el último es definitivo. */
export function esFalloDefinitivo(trabajo: TrabajoBullmq | undefined): boolean {
  return trabajo === undefined || trabajo.attemptsMade >= intentosPermitidos(trabajo);
}

function intentosPermitidos(trabajo: TrabajoBullmq): number {
  return trabajo.opts.attempts ?? INTENTOS_SIN_CONFIGURAR;
}
