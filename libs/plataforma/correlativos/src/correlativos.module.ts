import { Logger, Module, type DynamicModule } from '@nestjs/common';
import type { Clock, EventPublisher, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ALCANCE_ACTOR, type AlcanceActor } from '@vitrina/plataforma/seguridad';
import { CambiarEstadoSerie } from './application/cambiar-estado-serie.js';
import { CrearSerie } from './application/crear-serie.js';
import type { DependenciasSeries } from './application/dependencias-series.js';
import { ConsultarSerie, ListarSeries, type DependenciasLectura } from './application/lecturas-series.js';
import { ObtenerSiguiente } from './application/obtener-siguiente.js';
import { CORRELATIVO_PORT, type CorrelativoPort } from './application/ports/correlativo.port.js';
import { LecturaSeriesTypeOrm } from './infrastructure/typeorm/lectura-series.typeorm.js';
import { NumeracionSqlTypeOrm } from './infrastructure/typeorm/numeracion-sql.typeorm.js';
import { SeriesRepositorioTypeOrm } from './infrastructure/typeorm/series.repositorio.js';
import { UbicacionesSerieTypeOrm } from './infrastructure/typeorm/ubicaciones-serie.typeorm.js';
import { SeriesController } from './interface/series.controller.js';

const DEPENDENCIAS_SERIES = Symbol('DEPENDENCIAS_SERIES');
const DEPENDENCIAS_LECTURA = Symbol('DEPENDENCIAS_LECTURA');

// Usa los tokens de KernelInfraModule y SeguridadModule (ambos globales), que la app debe importar.
// Las entidades ENTIDADES_SEQ van en el DataSource de la app.
@Module({})
export class CorrelativosModule {
  static register(): DynamicModule {
    const logger = new Logger('Correlativos');
    const depurar = (mensaje: string, datos: Record<string, unknown>) => logger.debug({ mensaje, ...datos });
    return {
      module: CorrelativosModule,
      controllers: [SeriesController],
      providers: [
        {
          provide: DEPENDENCIAS_SERIES,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            ids: IdGenerator,
            reloj: Clock,
            eventos: EventPublisher,
            alcanceActor: AlcanceActor,
          ): DependenciasSeries => ({
            unidadDeTrabajo,
            contexto,
            ids,
            reloj,
            eventos,
            series: new SeriesRepositorioTypeOrm(unidadDeTrabajo, contexto),
            ubicaciones: new UbicacionesSerieTypeOrm(unidadDeTrabajo, contexto),
            alcanceActor,
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, ID_GENERATOR, CLOCK, EVENT_PUBLISHER, ALCANCE_ACTOR],
        },
        {
          provide: DEPENDENCIAS_LECTURA,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock): DependenciasLectura => ({
            unidadDeTrabajo,
            reloj,
            lectura: new LecturaSeriesTypeOrm(unidadDeTrabajo, contexto),
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK],
        },
        { provide: CrearSerie, useFactory: (dependencias: DependenciasSeries) => new CrearSerie(dependencias), inject: [DEPENDENCIAS_SERIES] },
        { provide: CambiarEstadoSerie, useFactory: (dependencias: DependenciasSeries) => new CambiarEstadoSerie(dependencias), inject: [DEPENDENCIAS_SERIES] },
        { provide: ListarSeries, useFactory: (dependencias: DependenciasLectura) => new ListarSeries(dependencias), inject: [DEPENDENCIAS_LECTURA] },
        { provide: ConsultarSerie, useFactory: (dependencias: DependenciasLectura) => new ConsultarSerie(dependencias), inject: [DEPENDENCIAS_LECTURA] },
        {
          provide: CORRELATIVO_PORT,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock): CorrelativoPort =>
            new ObtenerSiguiente(contexto, reloj, new NumeracionSqlTypeOrm(unidadDeTrabajo), depurar),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK],
        },
      ],
      exports: [CORRELATIVO_PORT, CrearSerie],
    };
  }
}
