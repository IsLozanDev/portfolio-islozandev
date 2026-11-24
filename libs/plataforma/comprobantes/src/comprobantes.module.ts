import { Logger, Module, type DynamicModule, type ModuleMetadata, type OnModuleDestroy, type Provider } from '@nestjs/common';
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
import type { DependenciasEmisor, ReglasEntornoFe } from './application/dependencias-fe.js';
import { EjecutarPruebaEmisor } from './application/ejecutar-prueba-emisor.js';
import { EncolarPruebaEmisor } from './application/encolar-prueba-emisor.js';
import { HabilitarProduccion } from './application/habilitar-produccion.js';
import type { PseOsePort } from './application/ports/pse-ose.port.js';
import { SolicitarPruebaEmisor } from './application/solicitar-prueba-emisor.js';
import { PROVEEDORES_CON_ADAPTADOR } from './domain/proveedores-fe.js';
import { abrirColaPruebasFe, EVENTO_ERROR_COLA_PRUEBAS_FE, type ColaPruebasFeAbierta } from './infrastructure/bullmq/cola-pruebas.js';
import { ProveedoresFeCatalogo } from './infrastructure/catalogos/proveedores-fe.catalogo.js';
import { LectorCertificadoForge } from './infrastructure/forge/lector-certificado.forge.js';
import { EmpresaEmisoraOrg } from './infrastructure/org/empresa-emisora.org.js';
import { DiasAvisoParametros } from './infrastructure/parametros/dias-aviso.parametros.js';
import { CircuitBreaker } from './infrastructure/pse/circuit-breaker.js';
import { PseNubefact } from './infrastructure/pse/nubefact/pse.nubefact.js';
import { ResolutorPseMapa } from './infrastructure/pse/resolutor-pse.js';
import { PseSimulador } from './infrastructure/pse/simulador/pse.simulador.js';
import { RepositorioAvisosCertificadoTypeOrm } from './infrastructure/typeorm/avisos-certificado.repositorio.js';
import { CertificadosConAvisoPendienteSql, type EjecutorSql } from './infrastructure/typeorm/certificados-con-aviso-pendiente.sql.js';
import { RepositorioEmisoresTypeOrm } from './infrastructure/typeorm/emisores.repositorio.js';
import { EmisoresController } from './interface/emisores.controller.js';
import { reglasEntornoFe, type EntornoFe } from './interface/entorno-fe.js';
import { PruebasFeConsumidor } from './interface/pruebas-fe.consumidor.js';

const DEPENDENCIAS_EMISOR = Symbol('DependenciasEmisor');
const COLA_PRUEBAS_ABIERTA = Symbol('ColaPruebasFeAbierta');
const CONTEXTO_LOG = 'Comprobantes';

export interface ComprobantesOpciones {
  /** Módulos que exportan ConsultarEmpresa (OrgModule), CATALOGO_PORT (CatalogosModule) y BOVEDA_SECRETOS (SecretosModule). */
  imports: ModuleMetadata['imports'];
  /** FE_PRODUCCION_PERMITIDA y FE_SIMULADO_PERMITIDO (spec 50). */
  entorno: EntornoFe;
}

export interface ComprobantesWorkerOpciones {
  /** Para listar los emisores con aviso pendiente de todos los tenants, fuera de toda transacción. */
  dataSource: EjecutorSql;
  /** Módulo que exporta PARAMETRO_PORT (ParametrosModule). */
  imports: ModuleMetadata['imports'];
}

export interface ComprobantesPruebasOpciones {
  /** Cola `fe-pruebas`. */
  redisUrl: string;
  entorno: EntornoFe;
  /** Módulos que exportan ConsultarEmpresa (OrgModule), CATALOGO_PORT (CatalogosModule) y BOVEDA_SECRETOS (SecretosModule). */
  imports: ModuleMetadata['imports'];
}

/** Los casos de uso del emisor reciben las mismas dependencias. */
function casoDeUsoDelEmisor<CasoDeUso>(clase: new (dependencias: DependenciasEmisor) => CasoDeUso): Provider {
  return { provide: clase, useFactory: (dependencias: DependenciasEmisor) => new clase(dependencias), inject: [DEPENDENCIAS_EMISOR] };
}

/** El simulador solo existe donde el ambiente lo permite: en los demás, un emisor SIMULADO no tiene adaptador. */
function adaptadoresPse(reglas: ReglasEntornoFe, reloj: Clock): Record<string, PseOsePort> {
  const nubefact = { [PROVEEDORES_CON_ADAPTADOR.nubefact]: new PseNubefact(new CircuitBreaker(reloj)) };
  return reglas.simuladoPermitido ? { ...nubefact, [PROVEEDORES_CON_ADAPTADOR.simulado]: new PseSimulador() } : nubefact;
}

/** Cierra la cola de pruebas con la app (app.close() en pruebas y apagado). */
class CierreColaPruebas implements OnModuleDestroy {
  constructor(private readonly abierta: ColaPruebasFeAbierta) {}

  onModuleDestroy(): Promise<void> {
    return this.abierta.cerrar();
  }
}

// Usa los tokens de KernelInfraModule y AUDITORIA de AuditoriaModule (globales), que la app debe importar.
// Las entidades ENTIDADES_FE van en el DataSource de la app.
@Module({})
export class ComprobantesModule {
  /** El emisor electrónico por HTTP (`/v1/fe/emisores`), para apps/api. */
  static register({ imports, entorno }: ComprobantesOpciones): DynamicModule {
    const reglas = reglasEntornoFe(entorno);
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
            entorno: reglas,
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, EVENT_PUBLISHER, AUDITORIA, BOVEDA_SECRETOS, CATALOGO_PORT, ConsultarEmpresa],
        },
        casoDeUsoDelEmisor(ConsultarEmisor),
        casoDeUsoDelEmisor(ConfigurarEmisor),
        casoDeUsoDelEmisor(CargarCertificado),
        casoDeUsoDelEmisor(SolicitarPruebaEmisor),
        casoDeUsoDelEmisor(HabilitarProduccion),
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

  /**
   * La prueba en beta en apps/worker (spec 50): el consumidor de `fe.prueba.solicitada` (EventosModule.registrarWorker
   * lo descubre por `@SuscribirEvento`), que encola en `fe-pruebas`, y `EjecutarPruebaEmisor`, que procesa esa cola.
   * Aparte de `registerWorker` para que el CLI de avisos no abra la cola.
   */
  static registerPruebas({ redisUrl, entorno, imports }: ComprobantesPruebasOpciones): DynamicModule {
    const logger = new Logger(CONTEXTO_LOG);
    const reglas = reglasEntornoFe(entorno);
    return {
      module: ComprobantesModule,
      imports,
      providers: [
        {
          provide: COLA_PRUEBAS_ABIERTA,
          // Solo el nombre del error: el mensaje de Redis puede llevar la URL con su clave.
          useFactory: (): ColaPruebasFeAbierta =>
            abrirColaPruebasFe(redisUrl, (error) => logger.warn({ evento: EVENTO_ERROR_COLA_PRUEBAS_FE, error: error.name })),
        },
        { provide: CierreColaPruebas, useFactory: (abierta: ColaPruebasFeAbierta) => new CierreColaPruebas(abierta), inject: [COLA_PRUEBAS_ABIERTA] },
        {
          provide: PruebasFeConsumidor,
          useFactory: (abierta: ColaPruebasFeAbierta) => new PruebasFeConsumidor(new EncolarPruebaEmisor(abierta.cola)),
          inject: [COLA_PRUEBAS_ABIERTA],
        },
        {
          provide: EjecutarPruebaEmisor,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            publicador: EventPublisher,
            boveda: BovedaSecretos,
            catalogo: CatalogoPort,
            consultarEmpresa: ConsultarEmpresa,
          ) =>
            new EjecutarPruebaEmisor({
              unidadDeTrabajo,
              contexto,
              reloj,
              publicador,
              emisores: new RepositorioEmisoresTypeOrm(unidadDeTrabajo, contexto),
              empresas: new EmpresaEmisoraOrg(consultarEmpresa),
              proveedores: new ProveedoresFeCatalogo(catalogo),
              boveda,
              resolutor: new ResolutorPseMapa(adaptadoresPse(reglas, reloj)),
              informar: (mensaje, datos) => logger.log({ evento: mensaje, ...datos }),
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, EVENT_PUBLISHER, BOVEDA_SECRETOS, CATALOGO_PORT, ConsultarEmpresa],
        },
      ],
      exports: [EjecutarPruebaEmisor],
    };
  }
}
