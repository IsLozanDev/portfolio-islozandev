import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ErrorTecnicoPseError, NOMBRE_COLA_ENVIOS_FE, type EnviarComprobante, type TrabajoEnvioFe } from '@vitrina/plataforma/comprobantes';
import { REPORTADOR_SIN_ENVIO, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { esFalloDefinitivo, intentoDe } from '../pruebas-fe/tarea-pruebas-fe.js';

type Registrar = (mensaje: string, datos: Record<string, unknown>) => void;
/** Cada envío espera a SUNAT hasta 15 s; el circuito del adaptador corta antes si SUNAT cae. */
const CONCURRENCIA = 4;

/**
 * Procesa la cola `fe-envios` (spec 52). Los reintentos son de BullMQ (3 con espera exponencial al encolar):
 * EnviarComprobante relanza un ERROR_TECNICO y en el último intento deja el comprobante PENDIENTE_ENVIO.
 */
export class TareaEnviosFe implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly conexion: Redis;
  private trabajador: Worker<TrabajoEnvioFe> | null = null;

  constructor(
    redisUrl: string,
    private readonly enviarComprobante: Pick<EnviarComprobante, 'ejecutar'>,
    private readonly informar: Registrar,
    private readonly avisar: Registrar,
    private readonly reportador: ReportadorErrores = REPORTADOR_SIN_ENVIO,
  ) {
    // maxRetriesPerRequest: null lo exige BullMQ en los Worker.
    this.conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
    // Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026).
    this.conexion.on('error', (error) => this.avisar('Redis de los envíos de FE no disponible', { error: error.name }));
  }

  async onApplicationBootstrap(): Promise<void> {
    this.trabajador = new Worker<TrabajoEnvioFe>(NOMBRE_COLA_ENVIOS_FE, (trabajo) => this.enviarComprobante.ejecutar(trabajo.data, intentoDe(trabajo)), {
      connection: this.conexion,
      concurrency: CONCURRENCIA,
    });
    this.trabajador.on('failed', (trabajo, error) => {
      // Solo el comprobante y el nombre del error: nunca el documento, el token ni datos del adquirente (TR-RNF-026).
      this.avisar('Envío de FE falló', { comprobante_id: trabajo?.data.comprobanteId, error: error.name });
      if (esFalloDefinitivo(trabajo) && !(error instanceof ErrorTecnicoPseError)) this.reportador.reportar(error, { cola: NOMBRE_COLA_ENVIOS_FE });
    });
    this.informar('Cola de envíos de FE lista', { cola: NOMBRE_COLA_ENVIOS_FE });
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.trabajador?.close();
    this.conexion.disconnect();
  }
}
