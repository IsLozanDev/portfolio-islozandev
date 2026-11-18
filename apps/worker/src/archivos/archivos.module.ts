import { Logger, Module, type DynamicModule } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AnalizarArchivo, ArchivosModule, LimpiarCargasPendientes } from '@vitrina/plataforma/archivos';
import { REPORTADOR_ERRORES, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { TareaAnalisisArchivos } from './tarea-analisis.js';
import { TareaLimpiezaArchivos } from './tarea-limpieza.js';

export interface ArchivosWorkerOpciones {
  /** Para listar las cargas pendientes de todos los tenants, fuera de toda transacción. */
  dataSource: DataSource;
  redisUrl: string;
  /** El worker lee y borra objetos del bucket privado con la secret key (regla 9). */
  supabase: { url: string; secretKey: string };
  /** ARC_BUCKET. */
  bucket: string;
  /** ARC_LIMPIEZA_CRON. */
  patronLimpieza: string;
}

/** Spec 33. Necesita KernelInfraModule con registrarEsquemasArc. ENTIDADES_ARC van en el DataSource. */
@Module({})
export class ArchivosWorkerModule {
  static register({ dataSource, redisUrl, supabase, bucket, patronLimpieza }: ArchivosWorkerOpciones): DynamicModule {
    const logger = new Logger('Archivos');
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    return {
      module: ArchivosWorkerModule,
      imports: [ArchivosModule.registrarWorker({ dataSource, supabase, bucket })],
      providers: [
        {
          provide: TareaAnalisisArchivos,
          useFactory: (analizar: AnalizarArchivo, reportador?: ReportadorErrores) =>
            new TareaAnalisisArchivos(redisUrl, analizar, informar, avisar, reportador),
          inject: [AnalizarArchivo, { token: REPORTADOR_ERRORES, optional: true }],
        },
        {
          provide: TareaLimpiezaArchivos,
          useFactory: (limpiar: LimpiarCargasPendientes, reportador?: ReportadorErrores) =>
            new TareaLimpiezaArchivos(redisUrl, patronLimpieza, limpiar, informar, avisar, reportador),
          inject: [LimpiarCargasPendientes, { token: REPORTADOR_ERRORES, optional: true }],
        },
      ],
    };
  }
}
