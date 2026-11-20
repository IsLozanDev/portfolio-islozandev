import { Logger, Module, type DynamicModule } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  AnalizarArchivo,
  ArchivosModule,
  LimpiarCargasPendientes,
  ReencolarAnalisisAtascados,
  SALUD_ANTIVIRUS,
  type OpcionesAntivirus,
  type SaludAntivirus,
} from '@vitrina/plataforma/archivos';
import { REPORTADOR_ERRORES, type ReportadorErrores } from '@vitrina/plataforma/kernel-infra';
import { TareaAnalisisArchivos } from './tarea-analisis.js';
import { TareaLimpiezaArchivos } from './tarea-limpieza.js';
import { TareaReencoladoArchivos } from './tarea-reencolado.js';

export interface ArchivosWorkerOpciones {
  /** Para listar las cargas pendientes y los análisis atascados de todos los tenants, fuera de toda transacción. */
  dataSource: DataSource;
  redisUrl: string;
  /** El worker lee y borra objetos del bucket privado con la secret key (regla 9). */
  supabase: { url: string; secretKey: string };
  /** ARC_BUCKET. */
  bucket: string;
  /** ARC_LIMPIEZA_CRON. */
  patronLimpieza: string;
  /** ARC_ANTIVIRUS y CLAMAV_*. */
  antivirus: OpcionesAntivirus;
  /** ARC_REENCOLADO_CRON. */
  patronReencolado: string;
}

/** Specs 33 y 34. Necesita KernelInfraModule con registrarEsquemasArc. ENTIDADES_ARC van en el DataSource. */
@Module({})
export class ArchivosWorkerModule {
  static register({ dataSource, redisUrl, supabase, bucket, patronLimpieza, antivirus, patronReencolado }: ArchivosWorkerOpciones): DynamicModule {
    const logger = new Logger('Archivos');
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    return {
      module: ArchivosWorkerModule,
      imports: [ArchivosModule.registrarWorker({ dataSource, redisUrl, supabase, bucket, antivirus })],
      providers: [
        {
          provide: TareaAnalisisArchivos,
          useFactory: (analizar: AnalizarArchivo, salud: SaludAntivirus, reportador?: ReportadorErrores) =>
            new TareaAnalisisArchivos(redisUrl, analizar, { motor: antivirus.motor, salud }, informar, avisar, reportador),
          inject: [AnalizarArchivo, SALUD_ANTIVIRUS, { token: REPORTADOR_ERRORES, optional: true }],
        },
        {
          provide: TareaReencoladoArchivos,
          useFactory: (reencolar: ReencolarAnalisisAtascados, reportador?: ReportadorErrores) =>
            new TareaReencoladoArchivos(redisUrl, patronReencolado, reencolar, informar, avisar, reportador),
          inject: [ReencolarAnalisisAtascados, { token: REPORTADOR_ERRORES, optional: true }],
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
