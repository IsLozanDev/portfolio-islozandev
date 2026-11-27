import { Logger, Module, type DynamicModule, type ModuleMetadata, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { ARCHIVO_SISTEMA_PORT, type ArchivoSistemaPort } from '@vitrina/plataforma/archivos';
import { AUDITORIA, type AuditoriaPort } from '@vitrina/plataforma/auditoria';
import { CATALOGO_PORT, type CatalogoPort } from '@vitrina/plataforma/catalogos';
import type { Clock, EventPublisher, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { CORRELATIVO_PORT, SERIES_ACTIVAS_PORT, type CorrelativoPort, type SeriesActivasPort } from '@vitrina/plataforma/correlativos';
import { ConsultarEmpresa, ConsultarSucursal, ListarEmpresas, ListarSucursales, PADRON_RUC, type PadronRucPort } from '@vitrina/plataforma/org';
import { PARAMETRO_PORT, type ParametroPort } from '@vitrina/plataforma/parametros';
import { BOVEDA_SECRETOS, type BovedaSecretos } from '@vitrina/plataforma/secretos';
import { AvisarCertificadosPorVencer } from './application/avisar-certificados-por-vencer.js';
import { CargarCertificado } from './application/cargar-certificado.js';
import { ConfigurarEmisor } from './application/configurar-emisor.js';
import { ConsultarComprobante } from './application/consultar-comprobante.js';
import { ConsultarEmisor } from './application/consultar-emisor.js';
import { EmitirComprobante } from './application/emitir-comprobante.js';
import { EmitirComprobanteAuditado } from './application/emitir-comprobante-auditado.js';
import { COMPROBANTE_PORT, type ComprobantePort } from './application/ports/comprobante.port.js';
import type { DependenciasEmisor, ReglasEntornoFe } from './application/dependencias-fe.js';
import { EjecutarPruebaEmisor } from './application/ejecutar-prueba-emisor.js';
import { EncolarEnvioComprobante } from './application/encolar-envio-comprobante.js';
import { EncolarPruebaEmisor } from './application/encolar-prueba-emisor.js';
import { EnviarComprobante } from './application/enviar-comprobante.js';
import { HabilitarProduccion } from './application/habilitar-produccion.js';
import { ListarEmisores } from './application/listar-emisores.js';
import type { PseOsePort } from './application/ports/pse-ose.port.js';
import { SolicitarPruebaEmisor } from './application/solicitar-prueba-emisor.js';
import { PROVEEDORES_CON_ADAPTADOR } from './domain/proveedores-fe.js';
import { ArchivosCpeArc } from './infrastructure/arc/archivos-cpe.arc.js';
import { abrirColaEnviosFe, EVENTO_ERROR_COLA_ENVIOS_FE, type ColaEnviosFeAbierta } from './infrastructure/bullmq/cola-envios.js';
import { abrirColaPruebasFe, EVENTO_ERROR_COLA_PRUEBAS_FE, type ColaPruebasFeAbierta } from './infrastructure/bullmq/cola-pruebas.js';
import { CatalogosSunatCatalogo } from './infrastructure/catalogos/catalogos-sunat.catalogo.js';
import { ProveedoresFeCatalogo } from './infrastructure/catalogos/proveedores-fe.catalogo.js';
import { TasaIgvCatalogo } from './infrastructure/catalogos/tasa-igv.catalogo.js';
import { LectorCertificadoForge } from './infrastructure/forge/lector-certificado.forge.js';
import { EmpresaEmisoraOrg } from './infrastructure/org/empresa-emisora.org.js';
import { PadronAdquirenteOrg } from './infrastructure/org/padron-adquirente.org.js';
import { EstablecimientoPrincipalOrg } from './infrastructure/org/establecimiento-principal.org.js';
import { SucursalesEmisorasOrg } from './infrastructure/org/sucursales-emisoras.org.js';
import { DiasAvisoParametros } from './infrastructure/parametros/dias-aviso.parametros.js';
import { UmbralBoletaParametros } from './infrastructure/parametros/umbral-boleta.parametros.js';
import { CircuitBreaker } from './infrastructure/pse/circuit-breaker.js';
import { PseNubefact } from './infrastructure/pse/nubefact/pse.nubefact.js';
import { ResolutorPseMapa } from './infrastructure/pse/resolutor-pse.js';
import { PseSimulador } from './infrastructure/pse/simulador/pse.simulador.js';
import { PseSunat } from './infrastructure/pse/sunat/pse.sunat.js';
import { RepositorioAvisosCertificadoTypeOrm } from './infrastructure/typeorm/avisos-certificado.repositorio.js';
import { CertificadosConAvisoPendienteSql, type EjecutorSql } from './infrastructure/typeorm/certificados-con-aviso-pendiente.sql.js';
import { RepositorioComprobantesTypeOrm } from './infrastructure/typeorm/comprobantes.repositorio.js';
import { RepositorioEmisoresTypeOrm } from './infrastructure/typeorm/emisores.repositorio.js';
import { RepositorioEnviosTypeOrm } from './infrastructure/typeorm/envios.repositorio.js';
import { ComprobantesController } from './interface/comprobantes.controller.js';
import { EmisoresController } from './interface/emisores.controller.js';
import { reglasEntornoFe, type EntornoFe } from './interface/entorno-fe.js';
import { EnviosFeConsumidor } from './interface/envios-fe.consumidor.js';
import { PruebasFeConsumidor } from './interface/pruebas-fe.consumidor.js';

const DEPENDENCIAS_EMISOR = Symbol('DependenciasEmisor');
const COLA_PRUEBAS_ABIERTA = Symbol('ColaPruebasFeAbierta');
const COLA_ENVIOS_ABIERTA = Symbol('ColaEnviosFeAbierta');
const CONTEXTO_LOG = 'Comprobantes';

export interface ComprobantesOpciones {
  /**
   * Módulos que exportan ConsultarEmpresa, ListarEmpresas, ConsultarSucursal y PADRON_RUC (OrgModule), CATALOGO_PORT (CatalogosModule),
   * BOVEDA_SECRETOS (SecretosModule), PARAMETRO_PORT (ParametrosModule) y CORRELATIVO_PORT y SERIES_ACTIVAS_PORT
   * (CorrelativosModule). La misma referencia que en la app: cada uno registra sus controladores.
   */
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
  /** Módulos que exportan ConsultarEmpresa, ListarEmpresas y ListarSucursales (OrgModule), CATALOGO_PORT (CatalogosModule) y BOVEDA_SECRETOS (SecretosModule). */
  imports: ModuleMetadata['imports'];
}

export interface ComprobantesEnviosOpciones {
  /** Cola `fe-envios`. */
  redisUrl: string;
  entorno: EntornoFe;
  /**
   * Módulos que exportan ConsultarEmpresa, ListarEmpresas y ConsultarSucursal (OrgModule), CATALOGO_PORT (CatalogosModule),
   * BOVEDA_SECRETOS (SecretosModule) y ARCHIVO_SISTEMA_PORT (ArchivosModule.registrarWorker).
   */
  imports: ModuleMetadata['imports'];
}

/** Los casos de uso del emisor reciben las mismas dependencias. */
function casoDeUsoDelEmisor<CasoDeUso>(clase: new (dependencias: DependenciasEmisor) => CasoDeUso): Provider {
  return { provide: clase, useFactory: (dependencias: DependenciasEmisor) => new clase(dependencias), inject: [DEPENDENCIAS_EMISOR] };
}

type Registrar = (mensaje: string, datos: Record<string, unknown>) => void;

/** El simulador solo existe donde el ambiente lo permite: en los demás, un emisor SIMULADO no tiene adaptador. */
function adaptadoresPse(reglas: ReglasEntornoFe, reloj: Clock, proveedores: ProveedoresFeCatalogo, informar: Registrar): Record<string, PseOsePort> {
  const reales = {
    [PROVEEDORES_CON_ADAPTADOR.nubefact]: new PseNubefact(new CircuitBreaker(reloj)),
    [PROVEEDORES_CON_ADAPTADOR.sunat]: new PseSunat(proveedores, new CircuitBreaker(reloj), informar),
  };
  return reglas.simuladoPermitido ? { ...reales, [PROVEEDORES_CON_ADAPTADOR.simulado]: new PseSimulador() } : reales;
}

/** Cierra una cola de FE con la app (app.close() en pruebas y apagado). */
class CierreColaFe implements OnModuleDestroy {
  constructor(private readonly abierta: { cerrar(): Promise<void> }) {}

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
    const logger = new Logger(CONTEXTO_LOG);
    return {
      module: ComprobantesModule,
      imports,
      controllers: [EmisoresController, ComprobantesController],
      providers: [
        {
          provide: COMPROBANTE_PORT,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            ids: IdGenerator,
            publicador: EventPublisher,
            catalogo: CatalogoPort,
            parametros: ParametroPort,
            padron: PadronRucPort,
            consultarSucursal: ConsultarSucursal,
            series: SeriesActivasPort,
            correlativo: CorrelativoPort,
          ): ComprobantePort =>
            new EmitirComprobante({
              unidadDeTrabajo,
              contexto,
              reloj,
              ids,
              publicador,
              emisores: new RepositorioEmisoresTypeOrm(unidadDeTrabajo, contexto),
              sucursales: new SucursalesEmisorasOrg(consultarSucursal),
              series,
              correlativo,
              catalogos: new CatalogosSunatCatalogo(catalogo),
              tasas: new TasaIgvCatalogo(catalogo),
              umbral: new UmbralBoletaParametros(parametros),
              padron: new PadronAdquirenteOrg(padron, (mensaje, datos) => logger.warn({ evento: mensaje, ...datos })),
              comprobantes: new RepositorioComprobantesTypeOrm(unidadDeTrabajo, contexto),
            }),
          inject: [
            TypeOrmUnitOfWork,
            TENANT_CONTEXT,
            CLOCK,
            ID_GENERATOR,
            EVENT_PUBLISHER,
            CATALOGO_PORT,
            PARAMETRO_PORT,
            PADRON_RUC,
            ConsultarSucursal,
            SERIES_ACTIVAS_PORT,
            CORRELATIVO_PORT,
          ],
        },
        {
          provide: EmitirComprobanteAuditado,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, auditoria: AuditoriaPort, emision: ComprobantePort) =>
            new EmitirComprobanteAuditado({ unidadDeTrabajo, auditoria, emision }),
          inject: [TypeOrmUnitOfWork, AUDITORIA, COMPROBANTE_PORT],
        },
        {
          provide: ConsultarComprobante,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext) =>
            new ConsultarComprobante({ unidadDeTrabajo, comprobantes: new RepositorioComprobantesTypeOrm(unidadDeTrabajo, contexto) }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
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
            listarEmpresas: ListarEmpresas,
          ): DependenciasEmisor => ({
            unidadDeTrabajo,
            contexto,
            reloj,
            ids,
            publicador,
            auditoria,
            boveda,
            emisores: new RepositorioEmisoresTypeOrm(unidadDeTrabajo, contexto),
            empresas: new EmpresaEmisoraOrg(consultarEmpresa, listarEmpresas),
            proveedores: new ProveedoresFeCatalogo(catalogo),
            lector: new LectorCertificadoForge(),
            entorno: reglas,
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, EVENT_PUBLISHER, AUDITORIA, BOVEDA_SECRETOS, CATALOGO_PORT, ConsultarEmpresa, ListarEmpresas],
        },
        casoDeUsoDelEmisor(ConsultarEmisor),
        casoDeUsoDelEmisor(ListarEmisores),
        casoDeUsoDelEmisor(ConfigurarEmisor),
        casoDeUsoDelEmisor(CargarCertificado),
        casoDeUsoDelEmisor(SolicitarPruebaEmisor),
        casoDeUsoDelEmisor(HabilitarProduccion),
      ],
      // COMPROBANTE_PORT: la emisión en proceso para los productos del monorepo, en su transacción (spec 51).
      exports: [COMPROBANTE_PORT],
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
        { provide: CierreColaFe, useFactory: (abierta: ColaPruebasFeAbierta) => new CierreColaFe(abierta), inject: [COLA_PRUEBAS_ABIERTA] },
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
            listarSucursales: ListarSucursales,
            listarEmpresas: ListarEmpresas,
          ) => {
            const proveedores = new ProveedoresFeCatalogo(catalogo);
            const informar: Registrar = (mensaje, datos) => logger.log({ evento: mensaje, ...datos });
            return new EjecutarPruebaEmisor({
              unidadDeTrabajo,
              contexto,
              reloj,
              publicador,
              emisores: new RepositorioEmisoresTypeOrm(unidadDeTrabajo, contexto),
              empresas: new EmpresaEmisoraOrg(consultarEmpresa, listarEmpresas),
              establecimientos: new EstablecimientoPrincipalOrg(listarSucursales),
              proveedores,
              boveda,
              resolutor: new ResolutorPseMapa(adaptadoresPse(reglas, reloj, proveedores, informar)),
              informar,
            });
          },
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, EVENT_PUBLISHER, BOVEDA_SECRETOS, CATALOGO_PORT, ConsultarEmpresa, ListarSucursales, ListarEmpresas],
        },
      ],
      exports: [EjecutarPruebaEmisor],
    };
  }

  /**
   * El envío de comprobantes a SUNAT en apps/worker (spec 52): el consumidor de `cpe.emitido` (EventosModule.registrarWorker
   * lo descubre por `@SuscribirEvento`), que encola en `fe-envios`, y `EnviarComprobante`, que procesa esa cola. Mismos
   * adaptadores que la prueba en beta; el XML y el CDR van a TR-ARC por ARCHIVO_SISTEMA_PORT.
   */
  static registerEnvios({ redisUrl, entorno, imports }: ComprobantesEnviosOpciones): DynamicModule {
    const logger = new Logger(CONTEXTO_LOG);
    const reglas = reglasEntornoFe(entorno);
    const informar: Registrar = (mensaje, datos) => logger.log({ evento: mensaje, ...datos });
    const avisar: Registrar = (mensaje, datos) => logger.warn({ evento: mensaje, ...datos });
    return {
      module: ComprobantesModule,
      imports,
      providers: [
        {
          provide: COLA_ENVIOS_ABIERTA,
          // Solo el nombre del error: el mensaje de Redis puede llevar la URL con su clave.
          useFactory: (): ColaEnviosFeAbierta => abrirColaEnviosFe(redisUrl, (error) => logger.warn({ evento: EVENTO_ERROR_COLA_ENVIOS_FE, error: error.name })),
        },
        { provide: CierreColaFe, useFactory: (abierta: ColaEnviosFeAbierta) => new CierreColaFe(abierta), inject: [COLA_ENVIOS_ABIERTA] },
        {
          provide: EnviosFeConsumidor,
          useFactory: (abierta: ColaEnviosFeAbierta) => new EnviosFeConsumidor(new EncolarEnvioComprobante(abierta.cola)),
          inject: [COLA_ENVIOS_ABIERTA],
        },
        {
          provide: EnviarComprobante,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            ids: IdGenerator,
            publicador: EventPublisher,
            boveda: BovedaSecretos,
            catalogo: CatalogoPort,
            consultarEmpresa: ConsultarEmpresa,
            consultarSucursal: ConsultarSucursal,
            archivos: ArchivoSistemaPort,
            listarEmpresas: ListarEmpresas,
          ) => {
            const proveedores = new ProveedoresFeCatalogo(catalogo);
            return new EnviarComprobante({
              unidadDeTrabajo,
              contexto,
              reloj,
              ids,
              publicador,
              comprobantes: new RepositorioComprobantesTypeOrm(unidadDeTrabajo, contexto),
              envios: new RepositorioEnviosTypeOrm(unidadDeTrabajo, contexto),
              emisores: new RepositorioEmisoresTypeOrm(unidadDeTrabajo, contexto),
              empresas: new EmpresaEmisoraOrg(consultarEmpresa, listarEmpresas),
              sucursales: new SucursalesEmisorasOrg(consultarSucursal),
              catalogos: new CatalogosSunatCatalogo(catalogo),
              proveedores,
              boveda,
              resolutor: new ResolutorPseMapa(adaptadoresPse(reglas, reloj, proveedores, informar)),
              archivos: new ArchivosCpeArc(archivos, avisar),
              informar,
              avisar,
            });
          },
          inject: [
            TypeOrmUnitOfWork,
            TENANT_CONTEXT,
            CLOCK,
            ID_GENERATOR,
            EVENT_PUBLISHER,
            BOVEDA_SECRETOS,
            CATALOGO_PORT,
            ConsultarEmpresa,
            ConsultarSucursal,
            ARCHIVO_SISTEMA_PORT,
            ListarEmpresas,
          ],
        },
      ],
      exports: [EnviarComprobante],
    };
  }
}
