import { Logger, Module, type DynamicModule } from '@nestjs/common';
import type { Clock, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ALCANCE_ACTOR, DIRECTORIO_SEG, type AlcanceActor, type DirectorioSeg } from '@vitrina/plataforma/seguridad';
import { AuditarEventoDePlataforma } from './application/auditar-evento-de-plataforma.js';
import { ConsultarAuditoria, type DependenciasConsultaAuditoria } from './application/consultar-auditoria.js';
import { ExportarAuditoria } from './application/exportar-auditoria.js';
import { FABRICA_ESCRITOR_AUDITORIA, type FabricaEscritorAuditoria } from './application/ports/escritor-auditoria.port.js';
import type { DependenciasRegistro } from './application/dependencias-registro.js';
import { AUDITORIA, type AuditoriaPort } from './application/ports/auditoria.port.js';
import { ObtenerEventoAuditoria } from './application/obtener-evento-auditoria.js';
import { RegistrarAccesoSensible } from './application/registrar-acceso-sensible.js';
import { RegistrarEvento } from './application/registrar-evento.js';
import { LecturaAuditoriaTypeOrm } from './infrastructure/typeorm/lectura-auditoria.typeorm.js';
import { RegistroAuditoriaTypeOrm } from './infrastructure/typeorm/registro-auditoria.typeorm.js';
import { EscritorAuditoriaXlsx } from './infrastructure/xlsx/escritor-auditoria.xlsx.js';
import { AuditoriaController } from './interface/auditoria.controller.js';
import { AuditoriaConsumidor } from './interface/auditoria.consumidor.js';

const CONTEXTO_LOG = 'Auditoria';
const DEPENDENCIAS_CONSULTA = Symbol('DEPENDENCIAS_CONSULTA_AUDITORIA');
type CasoDeConsulta<T> = new (dependencias: DependenciasConsultaAuditoria) => T;

/** Los casos de uso de lectura reciben las mismas dependencias. */
const deConsulta = <T>(Clase: CasoDeConsulta<T>) => ({
  provide: Clase,
  useFactory: (dependencias: DependenciasConsultaAuditoria) => new Clase(dependencias),
  inject: [DEPENDENCIAS_CONSULTA],
});

// Usa los tokens de KernelInfraModule (global), que la app debe importar.
@Module({})
export class AuditoriaModule {
  /**
   * `AUDITORIA` para los casos de uso de apps/api y las rutas /v1/aud (spec 20b). Global: los módulos de
   * producto lo inyectan sin importarlo. Usa ALCANCE_ACTOR y DIRECTORIO_SEG de SeguridadModule (global).
   */
  static registrarApi(): DynamicModule {
    return {
      module: AuditoriaModule,
      global: true,
      controllers: [AuditoriaController],
      providers: [
        {
          provide: DEPENDENCIAS_CONSULTA,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            alcanceActor: AlcanceActor,
            directorio: DirectorioSeg,
          ): DependenciasConsultaAuditoria => ({
            unidadDeTrabajo,
            contexto,
            reloj,
            alcanceActor,
            directorio,
            lectura: new LecturaAuditoriaTypeOrm(unidadDeTrabajo, contexto),
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ALCANCE_ACTOR, DIRECTORIO_SEG],
        },
        deConsulta(ConsultarAuditoria),
        deConsulta(ObtenerEventoAuditoria),
        {
          provide: ExportarAuditoria,
          useFactory: (dependencias: DependenciasConsultaAuditoria, auditoria: AuditoriaPort) => {
            const logger = new Logger(CONTEXTO_LOG);
            return new ExportarAuditoria({ ...dependencias, auditoria, avisar: (mensaje, datos) => logger.error({ evento: mensaje, ...datos }) });
          },
          inject: [DEPENDENCIAS_CONSULTA, AUDITORIA],
        },
        { provide: FABRICA_ESCRITOR_AUDITORIA, useValue: ((destino) => new EscritorAuditoriaXlsx(destino)) satisfies FabricaEscritorAuditoria },
        {
          provide: AUDITORIA,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, ids: IdGenerator, reloj: Clock) =>
            crearAuditoria({ contexto, ids, reloj, registro: crearRegistro(unidadDeTrabajo) }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, ID_GENERATOR, CLOCK],
        },
      ],
      exports: [AUDITORIA],
    };
  }

  /** Consumidor `auditoria` de los eventos de plataforma. EventosModule.registrarWorker lo descubre por `@SuscribirEvento`. */
  static registrarWorker(): DynamicModule {
    return {
      module: AuditoriaModule,
      providers: [
        {
          provide: AuditoriaConsumidor,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, ids: IdGenerator) =>
            new AuditoriaConsumidor(new AuditarEventoDePlataforma({ ids, registro: crearRegistro(unidadDeTrabajo) })),
          inject: [TypeOrmUnitOfWork, ID_GENERATOR],
        },
      ],
    };
  }
}

function crearRegistro(unidadDeTrabajo: TypeOrmUnitOfWork): RegistroAuditoriaTypeOrm {
  const logger = new Logger(CONTEXTO_LOG);
  return new RegistroAuditoriaTypeOrm(unidadDeTrabajo, (mensaje, datos) => logger.error({ mensaje, ...datos }));
}

function crearAuditoria(dependencias: DependenciasRegistro): AuditoriaPort {
  const registrarEvento = new RegistrarEvento(dependencias);
  const registrarAccesoSensible = new RegistrarAccesoSensible(dependencias);
  return {
    registrar: (entrada) => registrarEvento.ejecutar(entrada),
    registrarAccesoSensible: (entrada) => registrarAccesoSensible.ejecutar(entrada),
  };
}
