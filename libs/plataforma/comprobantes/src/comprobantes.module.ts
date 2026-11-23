import { Logger, Module, type DynamicModule, type ModuleMetadata, type Provider } from '@nestjs/common';
import { AUDITORIA, type AuditoriaPort } from '@vitrina/plataforma/auditoria';
import { CATALOGO_PORT, type CatalogoPort } from '@vitrina/plataforma/catalogos';
import type { Clock, EventPublisher, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ConsultarEmpresa } from '@vitrina/plataforma/org';
import { PARAMETRO_PORT, type ParametroPort } from '@vitrina/plataforma/parametros';
import { BOVEDA_SECRETOS, type BovedaSecretos } from '@vitrina/plataforma/secretos';
import { AvisarCertificadosPorVencer } from './application/avisar-certificados-por-vencer.js';
import { CargarCertificado } from './application/cargar-certificado.js';
import { ConfigurarEmisor } from './application/configurar-emisor.js';
import { ConsultarEmisor } from './application/consultar-emisor.js';
import type { DependenciasEmisor } from './application/dependencias-fe.js';
import { ProveedoresFeCatalogo } from './infrastructure/catalogos/proveedores-fe.catalogo.js';
import { LectorCertificadoForge } from './infrastructure/forge/lector-certificado.forge.js';
import { EmpresaEmisoraOrg } from './infrastructure/org/empresa-emisora.org.js';
import { DiasAvisoParametros } from './infrastructure/parametros/dias-aviso.parametros.js';
import { RepositorioAvisosCertificadoTypeOrm } from './infrastructure/typeorm/avisos-certificado.repositorio.js';
import { CertificadosConAvisoPendienteSql, type EjecutorSql } from './infrastructure/typeorm/certificados-con-aviso-pendiente.sql.js';
import { RepositorioEmisoresTypeOrm } from './infrastructure/typeorm/emisores.repositorio.js';
import { EmisoresController } from './interface/emisores.controller.js';

const DEPENDENCIAS_EMISOR = Symbol('DependenciasEmisor');
const CONTEXTO_LOG = 'Comprobantes';

export interface ComprobantesOpciones {
  /** Módulos que exportan ConsultarEmpresa (OrgModule), CATALOGO_PORT (CatalogosModule) y BOVEDA_SECRETOS (SecretosModule). */
  imports: ModuleMetadata['imports'];
}

export interface ComprobantesWorkerOpciones {
  /** Para listar los emisores con aviso pendiente de todos los tenants, fuera de toda transacción. */
  dataSource: EjecutorSql;
  /** Módulo que exporta PARAMETRO_PORT (ParametrosModule). */
  imports: ModuleMetadata['imports'];
}

/** Los casos de uso del emisor reciben las mismas dependencias. */
function casoDeUsoDelEmisor<CasoDeUso>(clase: new (dependencias: DependenciasEmisor) => CasoDeUso): Provider {
  return { provide: clase, useFactory: (dependencias: DependenciasEmisor) => new clase(dependencias), inject: [DEPENDENCIAS_EMISOR] };
}

// Usa los tokens de KernelInfraModule y AUDITORIA de AuditoriaModule (globales), que la app debe importar.
// Las entidades ENTIDADES_FE van en el DataSource de la app.
@Module({})
export class ComprobantesModule {
  /** El emisor electrónico por HTTP (`/v1/fe/emisores`), para apps/api. */
  static register({ imports }: ComprobantesOpciones): DynamicModule {
    return {
      module: ComprobantesModule,
      imports,
      controllers: [EmisoresController],
      providers: [
        {
          provide: DEPENDENCIAS_EMISOR,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            ids: IdGenerator,
            publicador: EventPublisher,
            auditoria: AuditoriaPort,
            boveda: BovedaSecretos,
            catalogo: CatalogoPort,
            consultarEmpresa: ConsultarEmpresa,
          ): DependenciasEmisor => ({
            unidadDeTrabajo,
            contexto,
            reloj,
            ids,
            publicador,
            auditoria,
            boveda,
            emisores: new RepositorioEmisoresTypeOrm(unidadDeTrabajo, contexto),
            empresas: new EmpresaEmisoraOrg(consultarEmpresa),
            proveedores: new ProveedoresFeCatalogo(catalogo),
            lector: new LectorCertificadoForge(),
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, EVENT_PUBLISHER, AUDITORIA, BOVEDA_SECRETOS, CATALOGO_PORT, ConsultarEmpresa],
        },
        casoDeUsoDelEmisor(ConsultarEmisor),
        casoDeUsoDelEmisor(ConfigurarEmisor),
        casoDeUsoDelEmisor(CargarCertificado),
      ],
    };
  }

  /** La tarea diaria de avisos de certificados por vencer, para apps/worker. Sin HTTP ni bóveda. */
  static registerWorker({ dataSource, imports }: ComprobantesWorkerOpciones): DynamicModule {
    const logger = new Logger(CONTEXTO_LOG);
    return {
      module: ComprobantesModule,
      imports,
      providers: [
        {
          provide: AvisarCertificadosPorVencer,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            ids: IdGenerator,
            publicador: EventPublisher,
            parametros: ParametroPort,
          ) =>
            new AvisarCertificadosPorVencer({
              unidadDeTrabajo,
              contexto,
              reloj,
              ids,
              publicador,
              emisores: new RepositorioEmisoresTypeOrm(unidadDeTrabajo, contexto),
              avisos: new RepositorioAvisosCertificadoTypeOrm(unidadDeTrabajo, new CertificadosConAvisoPendienteSql(dataSource)),
              diasAviso: new DiasAvisoParametros(parametros),
              informar: (mensaje, datos) => logger.log({ evento: mensaje, ...datos }),
              avisar: (mensaje, datos) => logger.warn({ evento: mensaje, ...datos }),
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, EVENT_PUBLISHER, PARAMETRO_PORT],
        },
      ],
      exports: [AvisarCertificadosPorVencer],
    };
  }
}
