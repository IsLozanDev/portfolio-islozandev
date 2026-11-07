import { Logger, Module, type DynamicModule, type InjectionToken, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Clock, EventPublisher, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { crearClienteRedis } from '@vitrina/plataforma/seguridad';
import { ActualizarCatalogo } from './application/actualizar-catalogo.js';
import { AjustarItem } from './application/ajustar-item.js';
import { ConsultarItems } from './application/consultar-items.js';
import { CrearCatalogo } from './application/crear-catalogo.js';
import type { DependenciasCatalogos } from './application/dependencias-catalogos.js';
import { EliminarItemGlobal } from './application/eliminar-item-global.js';
import { EliminarItemPropio } from './application/eliminar-item-propio.js';
import { GuardarItemGlobal } from './application/guardar-item-global.js';
import { GuardarItemPropio } from './application/guardar-item-propio.js';
import { EVENTO_ERROR_CACHE, LectorItems } from './application/lector-items.js';
import { ListarCatalogos } from './application/listar-catalogos.js';
import { CATALOGO_PORT, type CatalogoPort } from './application/ports/catalogo.port.js';
import { VERIFICADOR_OPERADOR, type VerificadorOperador } from './application/ports/verificador-operador.js';
import { VERIFICADORES_REFERENCIAS, type VerificadorReferencias } from './application/ports/verificador-referencias.js';
import { ValidarItem } from './application/validar-item.js';
import { CacheItemsRedis } from './infrastructure/redis/cache-items.redis.js';
import { AjustesRepositorioTypeOrm } from './infrastructure/typeorm/ajustes.repositorio.js';
import { CatalogosRepositorioTypeOrm } from './infrastructure/typeorm/catalogos.repositorio.js';
import { ItemsRepositorioTypeOrm } from './infrastructure/typeorm/items.repositorio.js';
import { LecturaItemsTypeOrm } from './infrastructure/typeorm/lectura-items.typeorm.js';
import { CatalogosController } from './interface/catalogos.controller.js';

const CLIENTE_REDIS_CAT = Symbol('CLIENTE_REDIS_CAT');
const DEPENDENCIAS_CATALOGOS = Symbol('DEPENDENCIAS_CATALOGOS');

/** Fábrica de un proveedor que arma la app con sus propios tokens. */
export interface FabricaDe<T> {
  useFactory: (...dependencias: never[]) => T;
  inject?: InjectionToken[];
}

export interface CatalogosOpciones {
  /** Caché de ítems (TR-RNF-102). El mismo Redis de ParametrosModule; conecta con el primer uso. */
  redisUrl: string;
  /** Regla del tenant operador: la implementa apps/api con org (TR-RNF-119). */
  verificadorOperador: FabricaDe<VerificadorOperador>;
  /** Los de los productos que referencian ítems (spec 25, R2). Por defecto ninguno. */
  verificadoresReferencias?: FabricaDe<VerificadorReferencias[]>;
}

/** Cierra la conexión a Redis con la app (app.close() en pruebas y apagado). */
class CierreRedisCat implements OnModuleDestroy {
  constructor(private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

const sinReferencias: FabricaDe<VerificadorReferencias[]> = { useFactory: () => [] };

// register usa los tokens de KernelInfraModule y SeguridadModule (ambos globales), que la app debe importar.
// Las entidades ENTIDADES_CAT van en el DataSource de la app.
@Module({})
export class CatalogosModule {
  static register(opciones: CatalogosOpciones): DynamicModule {
    const logger = new Logger('Catalogos');
    const avisar = (mensaje: string, datos: Record<string, unknown>) => logger.warn({ mensaje, ...datos });
    const referencias = opciones.verificadoresReferencias ?? sinReferencias;
    const casoDeUso = <T>(tipo: new (dependencias: DependenciasCatalogos) => T) => ({
      provide: tipo,
      useFactory: (dependencias: DependenciasCatalogos) => new tipo(dependencias),
      inject: [DEPENDENCIAS_CATALOGOS],
    });

    return {
      module: CatalogosModule,
      controllers: [CatalogosController],
      providers: [
        {
          provide: CLIENTE_REDIS_CAT,
          // Solo el nombre del error: el mensaje puede traer la URL con la clave (TR-RNF-026).
          useFactory: (): Redis => crearClienteRedis(opciones.redisUrl, (error) => logger.warn({ evento: EVENTO_ERROR_CACHE, error: error.name })),
        },
        { provide: CierreRedisCat, useFactory: (redis: Redis) => new CierreRedisCat(redis), inject: [CLIENTE_REDIS_CAT] },
        { provide: VERIFICADOR_OPERADOR, useFactory: opciones.verificadorOperador.useFactory, inject: opciones.verificadorOperador.inject ?? [] },
        { provide: VERIFICADORES_REFERENCIAS, useFactory: referencias.useFactory, inject: referencias.inject ?? [] },
        {
          provide: DEPENDENCIAS_CATALOGOS,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            ids: IdGenerator,
            reloj: Clock,
            eventos: EventPublisher,
            verificadorOperador: VerificadorOperador,
            verificadoresReferencias: VerificadorReferencias[],
          ): DependenciasCatalogos => ({
            unidadDeTrabajo,
            contexto,
            ids,
            reloj,
            eventos,
            catalogos: new CatalogosRepositorioTypeOrm(unidadDeTrabajo),
            items: new ItemsRepositorioTypeOrm(unidadDeTrabajo, contexto),
            ajustes: new AjustesRepositorioTypeOrm(unidadDeTrabajo, contexto),
            lectura: new LecturaItemsTypeOrm(unidadDeTrabajo),
            verificadorOperador,
            verificadoresReferencias,
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, ID_GENERATOR, CLOCK, EVENT_PUBLISHER, VERIFICADOR_OPERADOR, VERIFICADORES_REFERENCIAS],
        },
        {
          provide: LectorItems,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, reloj: Clock, redis: Redis) =>
            new LectorItems({ lectura: new LecturaItemsTypeOrm(unidadDeTrabajo), cache: new CacheItemsRedis(redis), reloj, aviso: avisar }),
          inject: [TypeOrmUnitOfWork, CLOCK, CLIENTE_REDIS_CAT],
        },
        {
          provide: ListarCatalogos,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork) => new ListarCatalogos({ unidadDeTrabajo, catalogos: new CatalogosRepositorioTypeOrm(unidadDeTrabajo) }),
          inject: [TypeOrmUnitOfWork],
        },
        {
          provide: ConsultarItems,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, lector: LectorItems) => new ConsultarItems({ unidadDeTrabajo, contexto, lector }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, LectorItems],
        },
        {
          provide: CATALOGO_PORT,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, lector: LectorItems): CatalogoPort =>
            new ValidarItem({ unidadDeTrabajo, contexto, lector }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, LectorItems],
        },
        casoDeUso(CrearCatalogo),
        casoDeUso(ActualizarCatalogo),
        casoDeUso(GuardarItemGlobal),
        casoDeUso(EliminarItemGlobal),
        casoDeUso(GuardarItemPropio),
        casoDeUso(EliminarItemPropio),
        casoDeUso(AjustarItem),
      ],
      exports: [CATALOGO_PORT],
    };
  }
}
