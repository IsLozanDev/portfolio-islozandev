import { Logger, Module, type DynamicModule, type InjectionToken, type ModuleMetadata, type OnModuleDestroy } from '@nestjs/common';
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
import { ActualizarFeriado } from './application/feriados/actualizar-feriado.js';
import { CrearFeriado } from './application/feriados/crear-feriado.js';
import type { DependenciasCalendario } from './application/feriados/dependencias-calendario.js';
import type { DependenciasFeriados } from './application/feriados/dependencias-feriados.js';
import { EliminarFeriado } from './application/feriados/eliminar-feriado.js';
import { EsDiaHabil } from './application/feriados/es-dia-habil.js';
import { ListarFeriados } from './application/feriados/listar-feriados.js';
import { SumarDiasHabiles } from './application/feriados/sumar-dias-habiles.js';
import { GuardarItemGlobal } from './application/guardar-item-global.js';
import { GuardarItemPropio } from './application/guardar-item-propio.js';
import { AplicarImportacion } from './application/importacion/aplicar-importacion.js';
import { ConsultarImportacion } from './application/importacion/consultar-importacion.js';
import type { DependenciasImportacion } from './application/importacion/dependencias-importacion.js';
import { DescargarErrores } from './application/importacion/descargar-errores.js';
import { ListarImportaciones } from './application/importacion/listar-importaciones.js';
import { PrevisualizarImportacion } from './application/importacion/previsualizar-importacion.js';
import { SeguirImportacion } from './application/importacion/seguir-importacion.js';
import { EVENTO_ERROR_CACHE, LectorItems } from './application/lector-items.js';
import { ListarCatalogos } from './application/listar-catalogos.js';
import { ListarItemsAdministracion } from './application/listar-items-administracion.js';
import { CALENDARIO_PORT, PARAMETROS_CALENDARIO, type CalendarioPort, type ParametrosCalendario } from './application/ports/calendario.port.js';
import { CATALOGO_PORT, type CatalogoPort } from './application/ports/catalogo.port.js';
import { VERIFICADOR_OPERADOR, type VerificadorOperador } from './application/ports/verificador-operador.js';
import { VERIFICADORES_REFERENCIAS, type VerificadorReferencias } from './application/ports/verificador-referencias.js';
import { ValidarItem } from './application/validar-item.js';
import { abrirColaImportaciones, EVENTO_ERROR_COLA, type ColaAbierta } from './infrastructure/bullmq/cola-importaciones.bullmq.js';
import { LectorTablaArchivos } from './infrastructure/lectores/lector-tabla.archivos.js';
import { CacheItemsRedis } from './infrastructure/redis/cache-items.redis.js';
import { CanalAvanceRedis } from './infrastructure/redis/canal-avance.redis.js';
import { AjustesRepositorioTypeOrm } from './infrastructure/typeorm/ajustes.repositorio.js';
import { CatalogosRepositorioTypeOrm } from './infrastructure/typeorm/catalogos.repositorio.js';
import { FeriadosRepositorioTypeOrm } from './infrastructure/typeorm/feriados.repositorio.js';
import { ImportacionesRepositorioTypeOrm } from './infrastructure/typeorm/importaciones.repositorio.js';
import { ItemsRepositorioTypeOrm } from './infrastructure/typeorm/items.repositorio.js';
import { LecturaCalendarioTypeOrm } from './infrastructure/typeorm/lectura-calendario.typeorm.js';
import { LecturaItemsAdministracionTypeOrm } from './infrastructure/typeorm/lectura-items-administracion.typeorm.js';
import { LecturaItemsGlobalesTypeOrm } from './infrastructure/typeorm/lectura-items-globales.typeorm.js';
import { LecturaItemsTypeOrm } from './infrastructure/typeorm/lectura-items.typeorm.js';
import { CatalogosController } from './interface/catalogos.controller.js';
import { FeriadosController } from './interface/feriados.controller.js';
import { ImportacionesController } from './interface/importaciones.controller.js';

const CLIENTE_REDIS_CAT = Symbol('CLIENTE_REDIS_CAT');
const DEPENDENCIAS_CATALOGOS = Symbol('DEPENDENCIAS_CATALOGOS');
const DEPENDENCIAS_IMPORTACION = Symbol('DEPENDENCIAS_IMPORTACION');
const DEPENDENCIAS_FERIADOS = Symbol('DEPENDENCIAS_FERIADOS');
const DEPENDENCIAS_CALENDARIO = Symbol('DEPENDENCIAS_CALENDARIO');
const COLA_ABIERTA = Symbol('COLA_ABIERTA');

/** Fábrica de un proveedor que arma la app con sus propios tokens. */
export interface FabricaDe<T> {
  useFactory: (...dependencias: never[]) => T;
  inject?: InjectionToken[];
}

export interface CatalogosOpciones {
  /**
   * Caché de ítems (TR-RNF-102), cola de importaciones y su avance (spec 19b). El mismo Redis de
   * ParametrosModule; la caché conecta con el primer uso.
   */
  redisUrl: string;
  /** Regla del tenant operador: la implementa apps/api con org (TR-RNF-119). */
  verificadorOperador: FabricaDe<VerificadorOperador>;
  /** Los de los productos que referencian ítems (spec 25, R2). Por defecto ninguno. */
  verificadoresReferencias?: FabricaDe<VerificadorReferencias[]>;
  /** `plat.calendario.sabado_habil`: lo implementa apps/api con ParametroPort (TR-RNF-119). */
  parametrosCalendario: FabricaDe<ParametrosCalendario>;
  /** Módulos que exportan lo que inyectan las fábricas (ParametrosModule para `parametrosCalendario`). */
  imports?: ModuleMetadata['imports'];
}

/** Cierra la conexión a Redis con la app (app.close() en pruebas y apagado). */
class CierreRedisCat implements OnModuleDestroy {
  constructor(private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

/** Cierra la cola de importaciones con la app. */
class CierreColaImportaciones implements OnModuleDestroy {
  constructor(private readonly abierta: ColaAbierta) {}

  onModuleDestroy(): Promise<void> {
    return this.abierta.cerrar();
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
    const casoDeImportacion = <T>(tipo: new (dependencias: DependenciasImportacion) => T) => ({
      provide: tipo,
      useFactory: (dependencias: DependenciasImportacion) => new tipo(dependencias),
      inject: [DEPENDENCIAS_IMPORTACION],
    });
    const casoDeFeriados = <T>(tipo: new (dependencias: DependenciasFeriados) => T) => ({
      provide: tipo,
      useFactory: (dependencias: DependenciasFeriados) => new tipo(dependencias),
      inject: [DEPENDENCIAS_FERIADOS],
    });

    return {
      module: CatalogosModule,
      imports: opciones.imports ?? [],
      // ImportacionesController primero: sus rutas `importaciones` no deben tomarse por un `{codigo}`.
      controllers: [ImportacionesController, CatalogosController, FeriadosController],
      providers: [
        {
          provide: COLA_ABIERTA,
          // Solo el nombre del error: el mensaje puede traer la URL con la clave (TR-RNF-026).
          useFactory: (): ColaAbierta => abrirColaImportaciones(opciones.redisUrl, (error) => logger.warn({ evento: EVENTO_ERROR_COLA, error: error.name })),
        },
        { provide: CierreColaImportaciones, useFactory: (abierta: ColaAbierta) => new CierreColaImportaciones(abierta), inject: [COLA_ABIERTA] },
        {
          provide: DEPENDENCIAS_IMPORTACION,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            ids: IdGenerator,
            reloj: Clock,
            verificadorOperador: VerificadorOperador,
            abierta: ColaAbierta,
            redis: Redis,
          ): DependenciasImportacion => ({
            unidadDeTrabajo,
            contexto,
            ids,
            reloj,
            catalogos: new CatalogosRepositorioTypeOrm(unidadDeTrabajo),
            importaciones: new ImportacionesRepositorioTypeOrm(unidadDeTrabajo),
            itemsGlobales: new LecturaItemsGlobalesTypeOrm(unidadDeTrabajo),
            lector: new LectorTablaArchivos(),
            verificadorOperador,
            cola: abierta.cola,
            canal: new CanalAvanceRedis(redis),
            avisar,
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, ID_GENERATOR, CLOCK, VERIFICADOR_OPERADOR, COLA_ABIERTA, CLIENTE_REDIS_CAT],
        },
        casoDeImportacion(PrevisualizarImportacion),
        casoDeImportacion(ListarImportaciones),
        casoDeImportacion(ConsultarImportacion),
        casoDeImportacion(DescargarErrores),
        casoDeImportacion(AplicarImportacion),
        casoDeImportacion(SeguirImportacion),
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
          provide: ListarItemsAdministracion,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock) =>
            new ListarItemsAdministracion({
              unidadDeTrabajo,
              contexto,
              reloj,
              catalogos: new CatalogosRepositorioTypeOrm(unidadDeTrabajo),
              lectura: new LecturaItemsAdministracionTypeOrm(unidadDeTrabajo),
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK],
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
        {
          provide: DEPENDENCIAS_FERIADOS,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            ids: IdGenerator,
            reloj: Clock,
            eventos: EventPublisher,
            verificadorOperador: VerificadorOperador,
          ): DependenciasFeriados => ({
            unidadDeTrabajo,
            contexto,
            ids,
            reloj,
            eventos,
            feriados: new FeriadosRepositorioTypeOrm(unidadDeTrabajo, contexto),
            verificadorOperador,
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, ID_GENERATOR, CLOCK, EVENT_PUBLISHER, VERIFICADOR_OPERADOR],
        },
        casoDeFeriados(CrearFeriado),
        casoDeFeriados(ActualizarFeriado),
        casoDeFeriados(EliminarFeriado),
        casoDeFeriados(ListarFeriados),
        { provide: PARAMETROS_CALENDARIO, useFactory: opciones.parametrosCalendario.useFactory, inject: opciones.parametrosCalendario.inject ?? [] },
        {
          provide: DEPENDENCIAS_CALENDARIO,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, parametros: ParametrosCalendario): DependenciasCalendario => ({
            unidadDeTrabajo,
            contexto,
            lectura: new LecturaCalendarioTypeOrm(unidadDeTrabajo),
            parametros,
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, PARAMETROS_CALENDARIO],
        },
        {
          provide: CALENDARIO_PORT,
          useFactory: (dependencias: DependenciasCalendario): CalendarioPort => {
            const sumar = new SumarDiasHabiles(dependencias);
            const esHabil = new EsDiaHabil(dependencias);
            return {
              sumarDiasHabiles: (fecha, dias, sucursalId) => sumar.sumarDiasHabiles(fecha, dias, sucursalId),
              esDiaHabil: (fecha, sucursalId) => esHabil.esDiaHabil(fecha, sucursalId),
            };
          },
          inject: [DEPENDENCIAS_CALENDARIO],
        },
      ],
      exports: [CATALOGO_PORT, CALENDARIO_PORT],
    };
  }
}
