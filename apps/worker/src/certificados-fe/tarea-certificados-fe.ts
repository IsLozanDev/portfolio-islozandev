import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { AvisarCertificadosPorVencer, ResultadoAvisos } from '@vitrina/plataforma/comprobantes';
import type { Clock } from '@vitrina/plataforma/kernel';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { fechaCalendarioDe, ZONA_VENCIMIENTOS } from '@vitrina/plataforma/org';

export const COLA_CERTIFICADOS_FE = 'fe-certificados';
export const PROGRAMADOR_CERTIFICADOS_FE = 'fe-certificados';
/** Todos los días a las 07:00 de Lima, después de los vencimientos de suscripciones (06:00). */
export const PATRON_CERTIFICADOS_FE = '0 7 * * *';
const NOMBRE_TRABAJO = 'avisar';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

/** Lo que hace cada disparo: la fecha es la de Lima en el instante del reloj. */
export function avisarHoy(avisar: Pick<AvisarCertificadosPorVencer, 'ejecutar'>, reloj: Clock): Promise<ResultadoAvisos> {
  return avisar.ejecutar(fechaCalendarioDe(reloj.now()));
}

/**
 * Programa en BullMQ el aviso diario de certificados por vencer (spec 49) y lo procesa, como TareaVencimientos.
 * Sin reintentos: la tarea es idempotente por certificado y la corrida de mañana (o `fe:avisos:ejecutar`) retoma.
 */
export class TareaCertificadosFe implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private readonly cola: Queue;
  private trabajador: Worker | null = null;

  constructor(
    redisUrl: string,
    private readonly avisar: Pick<AvisarCertificadosPorVencer, 'ejecutar'>,
    private readonly reloj: Clock,
    private readonly informar: Informar,
    private readonly advertir: Informar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.advertir('Redis de los avisos de certificados no disponible', { error: error.name }));
    this.cola = new Queue(COLA_CERTIFICADOS_FE, { connection: this.conexion });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.cola.upsertJobScheduler(PROGRAMADOR_CERTIFICADOS_FE, { pattern: PATRON_CERTIFICADOS_FE, tz: ZONA_VENCIMIENTOS }, { name: NOMBRE_TRABAJO });
    this.trabajador = new Worker(COLA_CERTIFICADOS_FE, () => avisarHoy(this.avisar, this.reloj), { connection: this.conexion });
    this.trabajador.on('failed', (_trabajo, error) => {
      this.advertir('Tarea de avisos de certificados falló', { error: error.name });
      this.reportador.reportar(error, { cola: COLA_CERTIFICADOS_FE });
    });
    this.informar('Tarea de avisos de certificados programada', { patron: PATRON_CERTIFICADOS_FE, zona: ZONA_VENCIMIENTOS });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    await this.cola.close();
    this.conexion.disconnect();
  }
}
