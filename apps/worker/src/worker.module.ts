import { Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { opcionesAntivirusDe, registrarEsquemasArc } from '@vitrina/plataforma/archivos';
import { AuditoriaModule, registrarEsquemasAud } from '@vitrina/plataforma/auditoria';
import { registrarEsquemasCat } from '@vitrina/plataforma/catalogos';
import { registrarEsquemasFe } from '@vitrina/plataforma/comprobantes';
import { EventosModule } from '@vitrina/plataforma/eventos';
import { registrarEsquemasIdn } from '@vitrina/plataforma/identidad';
import { registrarEsquemasNot } from '@vitrina/plataforma/notificaciones';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { ObservabilidadModule, salDocumento } from '@vitrina/plataforma/observabilidad';
import { registrarEsquemasOrg } from '@vitrina/plataforma/org';
import { registrarEsquemasSeg } from '@vitrina/plataforma/seguridad';
import { clavesMaestrasDe, SecretosModule } from '@vitrina/plataforma/secretos';
import { ArchivosWorkerModule } from './archivos/archivos.module.js';
import { CertificadosFeModule } from './certificados-fe/certificados-fe.module.js';
import { VerificacionModule } from './auditoria/verificacion.module.js';
import type { Config } from './config/env.js';
import { CuotasModule } from './cuotas/cuotas.module.js';
import { ImportacionesModule } from './importaciones/importaciones.module.js';
import { NotificacionesWorkerModule } from './notificaciones/notificaciones.module.js';
import { PruebasFeModule } from './pruebas-fe/pruebas-fe.module.js';
import { SERVICIO } from './servicio.js';
import { SoporteModule } from './soporte/soporte.module.js';
import { VencimientosModule } from './vencimientos/vencimientos.module.js';

/** Cierra la base al final: después de que EventosModule esperó los trabajos en curso (beforeApplicationShutdown). */
class CierreBaseDeDatos implements OnApplicationShutdown {
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}

@Module({})
export class WorkerModule {
  /** El DataSource llega ya inicializado desde main.ts. */
  static register(dataSource: DataSource, config: Config): DynamicModule {
    // La tarea de vencimientos publica eventos de org; cada componente que publique registra los suyos aquí.
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasOrg(validator);
    registrarEsquemasSeg(validator);
    registrarEsquemasCat(validator);
    registrarEsquemasAud(validator);
    registrarEsquemasIdn(validator);
    registrarEsquemasArc(validator);
    registrarEsquemasNot(validator);
    registrarEsquemasFe(validator);
    // La misma referencia en WorkerModule y PruebasFeModule: una sola bóveda.
    const secretosModulo = SecretosModule.register({ claves: clavesMaestrasDe(config) });
    return {
      module: WorkerModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        ObservabilidadModule.register({ servicio: SERVICIO, nivel: config.LOG_LEVEL, salDocumento: salDocumento(config) }),
        EventosModule.registrarWorker({
          dataSource,
          redisUrl: config.REDIS_URL,
          relay: {
            intervaloMs: config.EVT_INTERVALO_MS,
            margenSeg: config.EVT_MARGEN_SEG,
            lote: config.EVT_LOTE,
            rebarridoSeg: config.EVT_REBARRIDO_SEG,
            ventanaSeg: config.EVT_VENTANA_SEG,
          },
          reintentos: { intentos: config.EVT_INTENTOS, esperaBaseMs: config.EVT_BACKOFF_MS, esperaMaximaMs: config.EVT_BACKOFF_MAX_MS },
          concurrencia: config.EVT_CONCURRENCIA,
        }),
        AuditoriaModule.registrarWorker(),
        // Spec 41: la bóveda audita sus escrituras; la lee la prueba del emisor electrónico (spec 50).
        AuditoriaModule.registrarPuerto(),
        secretosModulo,
        VencimientosModule.register({ dataSource, redisUrl: config.REDIS_URL, programar: true }),
        CuotasModule.register({ dataSource, redisUrl: config.REDIS_URL, programar: true }),
        SoporteModule.register({ dataSource, redisUrl: config.REDIS_URL, cadaMs: config.SOPORTE_VENCIMIENTO_CADA_MS, programar: true }),
        ImportacionesModule.register({ redisUrl: config.REDIS_URL }),
        VerificacionModule.register({ dataSource, redisUrl: config.REDIS_URL, patron: config.AUD_VERIFICACION_CRON }),
        // Spec 49: aviso diario de certificados digitales por vencer.
        CertificadosFeModule.register({ dataSource, redisUrl: config.REDIS_URL, programar: true }),
        ArchivosWorkerModule.register({
          dataSource,
          redisUrl: config.REDIS_URL,
          supabase: { url: config.SUPABASE_URL, secretKey: config.SUPABASE_SECRET_KEY },
          bucket: config.ARC_BUCKET,
          patronLimpieza: config.ARC_LIMPIEZA_CRON,
          antivirus: opcionesAntivirusDe(config),
          patronReencolado: config.ARC_REENCOLADO_CRON,
        }),
        // Spec 42: consumidor de not.mensaje.solicitado y cola not-envios hacia Resend.
        NotificacionesWorkerModule.register({ redisUrl: config.REDIS_URL, entorno: config }),
        // Spec 50: consumidor de fe.prueba.solicitada y cola fe-pruebas hacia el PSE.
        PruebasFeModule.register({ redisUrl: config.REDIS_URL, entorno: config, secretos: secretosModulo }),
      ],
      providers: [{ provide: CierreBaseDeDatos, useValue: new CierreBaseDeDatos(dataSource) }],
    };
  }
}
