import { Logger, Module, type DynamicModule, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { crearProcesarImportacion } from '@vitrina/plataforma/catalogos';
import type { Clock, EventPublisher, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { crearClienteRedis } from '@vitrina/plataforma/seguridad';
import { TareaImportaciones } from './tarea-importaciones.js';

const CLIENTE_REDIS_AVANCE = Symbol('CLIENTE_REDIS_AVANCE');

class CierreRedisAvance implements OnModuleDestroy {
  constructor(private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

/** Spec 19b. Necesita KernelInfraModule; ENTIDADES_CAT van en el DataSource y los esquemas de cat en el validador. */
@Module({})
export class ImportacionesModule {
  static register({ redisUrl }: { redisUrl: string }): DynamicModule {
    const logger = new Logger('Importaciones');
    const informar = (mensaje: string, datos: Record<string, unknown>) => logger.log({ mensaje, ...datos });
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    return {
      module: ImportacionesModule,
      providers: [
        {
          provide: CLIENTE_REDIS_AVANCE,
          useFactory: (): Redis => crearClienteRedis(redisUrl, (error) => avisar('Redis de avance no disponible', { error: error.name })),
        },
        { provide: CierreRedisAvance, useFactory: (redis: Redis) => new CierreRedisAvance(redis), inject: [CLIENTE_REDIS_AVANCE] },
        {
          provide: TareaImportaciones,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock, eventos: EventPublisher, redis: Redis) =>
            new TareaImportaciones(redisUrl, crearProcesarImportacion({ unidadDeTrabajo, contexto, reloj, eventos, redis, avisar }), informar, avisar),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, EVENT_PUBLISHER, CLIENTE_REDIS_AVANCE],
        },
      ],
    };
  }
}
