import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { LimpiarCargasPendientes } from '@vitrina/plataforma/archivos';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';

export const COLA_LIMPIEZA = 'arc-limpieza';
export const PROGRAMADOR_LIMPIEZA = 'arc-limpieza';
/** Todos los días a las 03:45 de Lima: después de la verificación de auditoría (03:30) y antes de los vencimientos (06:00). */
export const PATRON_LIMPIEZA_DEFECTO = '45 3 * * *';
export const ZONA_LIMPIEZA = 'America/Lima';
const NOMBRE_TRABAJO = 'limpiar';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

/**
 * Programa en BullMQ la limpieza diaria de cargas que nunca se confirmaron y la procesa, como
 * TareaVerificacionIntegridad. Sin reintentos: lo que no se borró hoy sale en la corrida de mañana.
 */
export class TareaLimpiezaArchivos implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private readonly cola: Queue;
  private trabajador: Worker | null = null;

  constructor(
    redisUrl: string,
    private readonly patron: string,
    private readonly limpiar: Pick<LimpiarCargasPendientes, 'ejecutar'>,
    private readonly informar: Informar,
    private readonly avisar: Informar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis de la limpieza de archivos no disponible', { error: error.name }));
    this.cola = new Queue(COLA_LIMPIEZA, { connection: this.conexion });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.cola.upsertJobScheduler(PROGRAMADOR_LIMPIEZA, { pattern: this.patron, tz: ZONA_LIMPIEZA }, { name: NOMBRE_TRABAJO });
    this.trabajador = new Worker(COLA_LIMPIEZA, () => this.limpiarYAvisar(), { connection: this.conexion });
    this.trabajador.on('failed', (_trabajo, error) => {
      this.avisar('Limpieza de cargas pendientes falló', { error: error.name });
      this.reportador.reportar(error, { cola: COLA_LIMPIEZA });
    });
    this.informar('Limpieza de cargas pendientes programada', { patron: this.patron, zona: ZONA_LIMPIEZA });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    await this.cola.close();
    this.conexion.disconnect();
  }

  private async limpiarYAvisar(): Promise<void> {
    const resultado = await this.limpiar.ejecutar();
    const registrar = resultado.fallidas > 0 ? this.avisar : this.informar;
    registrar('Limpieza de cargas pendientes terminada', { ...resultado });
  }
}
