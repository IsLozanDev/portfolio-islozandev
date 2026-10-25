import { Logger, Module, type DynamicModule, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Clock, EventPublisher, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ALCANCE_ACTOR, crearClienteRedis, PRODUCTOS_CONTRATADOS, type AlcanceActor, type ProductosContratados } from '@vitrina/plataforma/seguridad';
import { ConsultarNiveles } from './application/consultar-niveles.js';
import type { DependenciasValores } from './application/dependencias-valores.js';
import { FijarValor } from './application/fijar-valor.js';
import { ListarParametros } from './application/listar-parametros.js';
import { PARAMETRO_PORT, type ParametroPort } from './application/ports/parametro.port.js';
import { EVENTO_ERROR_CACHE, ResolverParametro } from './application/resolver-parametro.js';
import { RestablecerValor } from './application/restablecer-valor.js';
import { ValidadorEsquemaAjv } from './infrastructure/ajv/validador-esquema.ajv.js';
import { CacheParametrosRedis } from './infrastructure/redis/cache-parametros.redis.js';
import { BusquedaDefinicionesTypeOrm } from './infrastructure/typeorm/busqueda-definiciones.typeorm.js';
import { LecturaDefinicionesTypeOrm } from './infrastructure/typeorm/lectura-definiciones.typeorm.js';
import { LecturaNivelesTypeOrm } from './infrastructure/typeorm/lectura-niveles.typeorm.js';
import { ResolucionSqlTypeOrm } from './infrastructure/typeorm/resolucion-sql.typeorm.js';
import { ValoresRepositorioTypeOrm } from './infrastructure/typeorm/valores.repositorio.js';
import { ParametrosController } from './interface/parametros.controller.js';

const CLIENTE_REDIS_CFG = Symbol('CLIENTE_REDIS_CFG');
const DEPENDENCIAS_VALORES = Symbol('DEPENDENCIAS_VALORES');

export interface ParametrosOpciones {
  /** Caché de parámetros (TR-RNF-101). Conecta con el primer uso. */
  redisUrl: string;
}

/** Cierra la conexión a Redis con la app (app.close() en pruebas y apagado). */
class CierreRedisCfg implements OnModuleDestroy {
  constructor(private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

// Usa los tokens de KernelInfraModule y SeguridadModule (ambos globales), que la app debe importar.
@Module({})
export class ParametrosModule {
  static register(opciones: ParametrosOpciones): DynamicModule {
    const logger = new Logger('Parametros');
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    return {
      module: ParametrosModule,
      controllers: [ParametrosController],
      providers: [
        {
          provide: CLIENTE_REDIS_CFG,
          // Solo el nombre del error: el mensaje puede traer la URL con la clave (RNF-026).
          useFactory: (): Redis => crearClienteRedis(opciones.redisUrl, (error) => logger.warn({ evento: EVENTO_ERROR_CACHE, error: error.name })),
        },
        { provide: CierreRedisCfg, useFactory: (redis: Redis) => new CierreRedisCfg(redis), inject: [CLIENTE_REDIS_CFG] },
        {
          provide: DEPENDENCIAS_VALORES,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            ids: IdGenerator,
            reloj: Clock,
            eventos: EventPublisher,
            alcanceActor: AlcanceActor,
          ): DependenciasValores => ({
            unidadDeTrabajo,
            contexto,
            ids,
            reloj,
            eventos,
            definiciones: new LecturaDefinicionesTypeOrm(unidadDeTrabajo),
            valores: new ValoresRepositorioTypeOrm(unidadDeTrabajo, contexto),
            resolucion: new ResolucionSqlTypeOrm(unidadDeTrabajo),
            alcanceActor,
            esquemas: new ValidadorEsquemaAjv(),
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, ID_GENERATOR, CLOCK, EVENT_PUBLISHER, ALCANCE_ACTOR],
        },
        { provide: FijarValor, useFactory: (dependencias: DependenciasValores) => new FijarValor(dependencias), inject: [DEPENDENCIAS_VALORES] },
        { provide: RestablecerValor, useFactory: (dependencias: DependenciasValores) => new RestablecerValor(dependencias), inject: [DEPENDENCIAS_VALORES] },
        {
          provide: ListarParametros,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, productos: ProductosContratados) =>
            new ListarParametros({
              unidadDeTrabajo,
              contexto,
              definiciones: new BusquedaDefinicionesTypeOrm(unidadDeTrabajo),
              resolucion: new ResolucionSqlTypeOrm(unidadDeTrabajo),
              productos,
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, PRODUCTOS_CONTRATADOS],
        },
        {
          provide: ConsultarNiveles,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext) =>
            new ConsultarNiveles({
              unidadDeTrabajo,
              definiciones: new LecturaDefinicionesTypeOrm(unidadDeTrabajo),
              niveles: new LecturaNivelesTypeOrm(unidadDeTrabajo, contexto),
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        {
          provide: PARAMETRO_PORT,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, redis: Redis): ParametroPort =>
            new ResolverParametro(
              unidadDeTrabajo,
              contexto,
              new LecturaDefinicionesTypeOrm(unidadDeTrabajo),
              new ResolucionSqlTypeOrm(unidadDeTrabajo),
              new CacheParametrosRedis(redis),
              avisar,
            ),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLIENTE_REDIS_CFG],
        },
      ],
      exports: [PARAMETRO_PORT],
    };
  }
}
