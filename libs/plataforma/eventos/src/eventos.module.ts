import { Logger, Module, type DynamicModule, type OnModuleDestroy } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { Redis } from 'ioredis';
import type { DataSource } from 'typeorm';
import type { Clock, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { CicloRelay } from './application/ciclo-relay.js';
import type { DependenciasEntrega } from './application/dependencias-entrega.js';
import { DespacharLote } from './application/despachar-lote.js';
import { EntregarEvento } from './application/entregar-evento.js';
import { ListarFallidos } from './application/listar-fallidos.js';
import { RegistrarFallo } from './application/registrar-fallo.js';
import { ReprocesarFallidos } from './application/reprocesar-fallidos.js';
import { ColaEventosBullMQ } from './infrastructure/bullmq/cola-eventos.bullmq.js';
import { crearConexionColas, crearConexionProductor } from './infrastructure/bullmq/conexion-redis.js';
import type { PoliticaReintentos } from './infrastructure/bullmq/politica-reintentos.js';
import { TrabajadoresEventos } from './infrastructure/bullmq/trabajadores-eventos.js';
import { CursorRelayTypeOrm } from './infrastructure/typeorm/cursor-relay.typeorm.js';
import { FallidosRepositorioTypeOrm } from './infrastructure/typeorm/fallidos.repositorio.js';
import { LecturaOutboxTypeOrm } from './infrastructure/typeorm/lectura-outbox.typeorm.js';
import { RegistroProcesadosTypeOrm } from './infrastructure/typeorm/registro-procesados.typeorm.js';
import { ProcesoWorker } from './interface/proceso-worker.nest.js';
import { RegistroSuscripcionesNest } from './interface/registro-suscripciones.nest.js';

const MILISEGUNDOS_POR_SEGUNDO = 1000;
const EVENTO_ERROR_REDIS = 'evt.redis.error';
const CONTEXTO_LOG = 'Eventos';

export interface OpcionesRelay {
  intervaloMs: number;
  margenSeg: number;
  lote: number;
  rebarridoSeg: number;
  ventanaSeg: number;
}

export interface EventosWorkerOpciones {
  /** Sin tenant: el cursor y la lectura del outbox van en su propia transacción. */
  dataSource: DataSource;
  redisUrl: string;
  relay: OpcionesRelay;
  reintentos: PoliticaReintentos;
  /** Trabajos simultáneos por consumidor. */
  concurrencia: number;
}

export interface EventosApiOpciones {
  redisUrl: string;
  /** La misma que el worker: los reprocesos se encolan con sus intentos y su backoff. */
  reintentos: PoliticaReintentos;
}

const COLA_REPROCESOS = Symbol('COLA_REPROCESOS');

/** Suelta Redis con la app (app.close() en pruebas y apagado). */
class CierreColaReprocesos implements OnModuleDestroy {
  constructor(
    private readonly cola: ColaEventosBullMQ,
    private readonly conexion: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.cola.cerrar();
    this.conexion.disconnect();
  }
}

// Usa los tokens de KernelInfraModule (global), que la app debe importar.
@Module({})
export class EventosModule {
  /** Lecturas y reproceso de fallidos para el controlador de apps/api. Solo encola: no procesa. */
  static registrarApi(opciones: EventosApiOpciones): DynamicModule {
    const logger = new Logger(CONTEXTO_LOG);
    const alFallarRedis = avisarErrorRedis(logger);
    const conexion = crearConexionProductor(opciones.redisUrl, alFallarRedis);
    const cola = new ColaEventosBullMQ(conexion, opciones.reintentos, alFallarRedis);
    return {
      module: EventosModule,
      providers: [
        { provide: COLA_REPROCESOS, useValue: cola },
        { provide: CierreColaReprocesos, useValue: new CierreColaReprocesos(cola, conexion) },
        {
          provide: ListarFallidos,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext) =>
            new ListarFallidos({ unidadDeTrabajo, fallidos: new FallidosRepositorioTypeOrm(unidadDeTrabajo, contexto) }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        {
          provide: ReprocesarFallidos,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock, colaReprocesos: ColaEventosBullMQ) =>
            new ReprocesarFallidos({
              unidadDeTrabajo,
              reloj,
              fallidos: new FallidosRepositorioTypeOrm(unidadDeTrabajo, contexto),
              outbox: new LecturaOutboxTypeOrm(unidadDeTrabajo, contexto),
              cola: colaReprocesos,
              informar: (mensaje, datos) => logger.log({ mensaje, ...datos }),
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, COLA_REPROCESOS],
        },
      ],
      exports: [ListarFallidos, ReprocesarFallidos],
    };
  }

  /** Relay del outbox y un `Worker` por consumidor declarado con `@SuscribirEvento` en los providers de la app. */
  static registrarWorker(opciones: EventosWorkerOpciones): DynamicModule {
    return {
      module: EventosModule,
      imports: [DiscoveryModule],
      providers: [
        {
          provide: RegistroSuscripcionesNest,
          useFactory: (descubrimiento: DiscoveryService, escaner: MetadataScanner) => new RegistroSuscripcionesNest(descubrimiento, escaner),
          inject: [DiscoveryService, MetadataScanner],
        },
        {
          provide: ProcesoWorker,
          useFactory: (suscripciones: RegistroSuscripcionesNest, unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, ids: IdGenerator, reloj: Clock) =>
            crearProcesoWorker(opciones, { unidadDeTrabajo, contexto, ids, reloj, suscripciones }),
          inject: [RegistroSuscripcionesNest, TypeOrmUnitOfWork, TENANT_CONTEXT, ID_GENERATOR, CLOCK],
        },
      ],
    };
  }
}

/** Solo el nombre del error: el mensaje de ioredis puede traer la URL (RNF-026). */
function avisarErrorRedis(logger: Logger): (error: Error) => void {
  return (error) => logger.warn({ evento: EVENTO_ERROR_REDIS, error: error.name });
}

/** Los repositorios ORM necesitan la UoW de TypeORM, no el puerto. */
type PiezasDelKernel = Omit<DependenciasEntrega, 'unidadDeTrabajo' | 'procesados' | 'fallidos' | 'avisar'> & { unidadDeTrabajo: TypeOrmUnitOfWork };

function crearProcesoWorker(opciones: EventosWorkerOpciones, kernel: PiezasDelKernel): ProcesoWorker {
  const logger = new Logger(CONTEXTO_LOG);
  const alFallarRedis = avisarErrorRedis(logger);
  const conexionColas = crearConexionColas(opciones.redisUrl, alFallarRedis);
  const conexionProductor = crearConexionProductor(opciones.redisUrl, alFallarRedis);
  const cola = new ColaEventosBullMQ(conexionProductor, opciones.reintentos, alFallarRedis);
  return new ProcesoWorker({
    suscripciones: kernel.suscripciones,
    trabajadores: crearTrabajadores(opciones, kernel, conexionColas, logger),
    ciclo: new CicloRelay(crearDespacho(opciones, kernel, cola, logger), opciones.relay.intervaloMs, (mensaje, datos) => logger.error({ mensaje, ...datos })),
    cola,
    conexiones: [conexionColas, conexionProductor],
    informar: (mensaje, datos) => logger.log({ mensaje, ...datos }),
  });
}

function crearDespacho(opciones: EventosWorkerOpciones, kernel: PiezasDelKernel, cola: ColaEventosBullMQ, logger: Logger): DespacharLote {
  const { relay } = opciones;
  return new DespacharLote(
    {
      cursor: new CursorRelayTypeOrm(opciones.dataSource),
      cola,
      suscripciones: kernel.suscripciones,
      reloj: kernel.reloj,
      depurar: (mensaje, datos) => logger.debug({ mensaje, ...datos }),
    },
    { margenSeg: relay.margenSeg, lote: relay.lote, ventanaSeg: relay.ventanaSeg, rebarridoCadaMs: relay.rebarridoSeg * MILISEGUNDOS_POR_SEGUNDO },
  );
}

function crearTrabajadores(opciones: EventosWorkerOpciones, kernel: PiezasDelKernel, conexion: Redis, logger: Logger): TrabajadoresEventos {
  const { unidadDeTrabajo, contexto } = kernel;
  const dependencias: DependenciasEntrega = {
    ...kernel,
    procesados: new RegistroProcesadosTypeOrm(unidadDeTrabajo),
    fallidos: new FallidosRepositorioTypeOrm(unidadDeTrabajo, contexto),
    avisar: (mensaje, datos) => logger.warn({ mensaje, ...datos }),
  };
  const entregar = new EntregarEvento(dependencias, new RegistrarFallo(dependencias));
  return new TrabajadoresEventos({ conexion, concurrencia: opciones.concurrencia, politica: opciones.reintentos }, kernel.suscripciones, entregar);
}

