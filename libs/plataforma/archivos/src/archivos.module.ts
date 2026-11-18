import { Logger, Module, type DynamicModule, type InjectionToken, type ModuleMetadata, type OnModuleDestroy } from '@nestjs/common';
import { AUDITORIA, type AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { Clock, EventPublisher, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { AnalizarArchivo } from './application/analizar-archivo.js';
import { ConfirmarCarga } from './application/confirmar-carga.js';
import { ConsultarEstadoArchivo } from './application/consultar-estado.js';
import type { DependenciasArchivos } from './application/dependencias-archivos.js';
import { EmitirUrlDescarga, type DependenciasDescarga } from './application/emitir-url-descarga.js';
import { ARCHIVO_PORT, type ArchivoPort } from './application/ports/archivo.port.js';
import type { AlmacenArchivos } from './application/ports/almacen-archivos.js';
import { AUTORIZADORES_ENTIDAD, type AutorizadorEntidad } from './application/ports/autorizador-entidad.js';
import { ServicioArchivos } from './application/servicio-archivos.js';
import { SolicitarCarga } from './application/solicitar-carga.js';
import { AnalizadorFirmaEicar } from './infrastructure/antivirus/analizador-firma-eicar.js';
import { abrirColaAnalisis, EVENTO_ERROR_COLA_ANALISIS, type ColaAnalisisAbierta } from './infrastructure/bullmq/cola-analisis.bullmq.js';
import { AlmacenArchivosSupabase, type OpcionesAlmacenSupabase } from './infrastructure/supabase/almacen-archivos.supabase.js';
import { DetectorTipoFileType } from './infrastructure/tipo/detector-tipo.file-type.js';
import { RepositorioArchivosTypeOrm } from './infrastructure/typeorm/archivos.repositorio.js';
import { ArchivosController } from './interface/archivos.controller.js';

const DEPENDENCIAS_ARCHIVOS = Symbol('DependenciasArchivos');
/** Las pruebas de integración de la app los reemplazan por el almacén en memoria y una cola sin Redis. */
export const ALMACEN_ARCHIVOS = Symbol('AlmacenArchivos');
export const COLA_ANALISIS_ABIERTA = Symbol('ColaAnalisisAbierta');

/** Fábrica de un proveedor que arma la app con sus propios tokens. */
export interface FabricaDe<Proveedor> {
  useFactory: (...dependencias: never[]) => Proveedor;
  inject?: InjectionToken[];
}

export interface ArchivosOpciones {
  /** Cola `arc-analisis`: la API encola, el worker procesa. */
  redisUrl: string;
  /** Secret key del proyecto: firma las URL de carga y descarga del bucket privado (regla 9). */
  supabase: { url: string; secretKey: string };
  bucket: string;
  /** Los autorizadores que registra cada producto para su `entidad_tipo`. Por defecto ninguno. */
  autorizadores?: FabricaDe<AutorizadorEntidad[]>;
  /** Módulos que exportan lo que inyecta la fábrica de autorizadores. */
  imports?: ModuleMetadata['imports'];
}

/** Lo que necesita el worker: lee y borra objetos con la secret key (regla 9). */
export interface ArchivosWorkerOpciones {
  supabase: { url: string; secretKey: string };
  bucket: string;
}

type DependenciasApi = DependenciasArchivos & DependenciasDescarga;

function proveedorAlmacen(opciones: OpcionesAlmacenSupabase) {
  return {
    provide: ALMACEN_ARCHIVOS,
    useFactory: (reloj: Clock): AlmacenArchivos => AlmacenArchivosSupabase.conectar(opciones, reloj),
    inject: [CLOCK],
  };
}

/** Cierra la cola de análisis con la app (app.close() en pruebas y apagado). */
class CierreColaAnalisis implements OnModuleDestroy {
  constructor(private readonly abierta: ColaAnalisisAbierta) {}

  onModuleDestroy(): Promise<void> {
    return this.abierta.cerrar();
  }
}

const sinAutorizadores: FabricaDe<AutorizadorEntidad[]> = { useFactory: () => [] };

// Usa los tokens de KernelInfraModule, SeguridadModule y AuditoriaModule (los tres globales), que la app
// debe importar. Las entidades ENTIDADES_ARC van en el DataSource de la app.
@Module({})
export class ArchivosModule {
  static register(opciones: ArchivosOpciones): DynamicModule {
    const logger = new Logger('Archivos');
    return {
      module: ArchivosModule,
      imports: opciones.imports,
      controllers: [ArchivosController],
      providers: [
        { provide: AUTORIZADORES_ENTIDAD, ...(opciones.autorizadores ?? sinAutorizadores) },
        proveedorAlmacen({ ...opciones.supabase, bucket: opciones.bucket }),
        {
          provide: COLA_ANALISIS_ABIERTA,
          // Solo el nombre del error: el mensaje de Redis puede llevar la URL con su clave.
          useFactory: (): ColaAnalisisAbierta =>
            abrirColaAnalisis(opciones.redisUrl, (error) => logger.warn({ evento: EVENTO_ERROR_COLA_ANALISIS, error: error.name })),
        },
        {
          provide: CierreColaAnalisis,
          useFactory: (abierta: ColaAnalisisAbierta) => new CierreColaAnalisis(abierta),
          inject: [COLA_ANALISIS_ABIERTA],
        },
        {
          provide: DEPENDENCIAS_ARCHIVOS,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            ids: IdGenerator,
            auditoria: AuditoriaPort,
            autorizadores: AutorizadorEntidad[],
            almacen: AlmacenArchivos,
            abierta: ColaAnalisisAbierta,
          ): DependenciasApi => ({
            unidadDeTrabajo,
            contexto,
            reloj,
            ids,
            archivos: new RepositorioArchivosTypeOrm(unidadDeTrabajo, contexto),
            almacen,
            cola: abierta.cola,
            autorizadores,
            auditoria,
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, AUDITORIA, AUTORIZADORES_ENTIDAD, ALMACEN_ARCHIVOS, COLA_ANALISIS_ABIERTA],
        },
        {
          provide: SolicitarCarga,
          useFactory: (dependencias: DependenciasApi) => new SolicitarCarga(dependencias),
          inject: [DEPENDENCIAS_ARCHIVOS],
        },
        {
          provide: ConfirmarCarga,
          useFactory: (dependencias: DependenciasApi) => new ConfirmarCarga(dependencias),
          inject: [DEPENDENCIAS_ARCHIVOS],
        },
        {
          provide: ConsultarEstadoArchivo,
          useFactory: (dependencias: DependenciasApi) => new ConsultarEstadoArchivo(dependencias),
          inject: [DEPENDENCIAS_ARCHIVOS],
        },
        {
          provide: EmitirUrlDescarga,
          useFactory: (dependencias: DependenciasApi) => new EmitirUrlDescarga(dependencias),
          inject: [DEPENDENCIAS_ARCHIVOS],
        },
        {
          provide: ARCHIVO_PORT,
          useFactory: (
            solicitarCarga: SolicitarCarga,
            confirmarCarga: ConfirmarCarga,
            emitirUrlDescarga: EmitirUrlDescarga,
            consultarEstado: ConsultarEstadoArchivo,
          ): ArchivoPort => new ServicioArchivos({ solicitarCarga, confirmarCarga, emitirUrlDescarga, consultarEstado }),
          inject: [SolicitarCarga, ConfirmarCarga, EmitirUrlDescarga, ConsultarEstadoArchivo],
        },
      ],
      exports: [ARCHIVO_PORT],
    };
  }

  /**
   * El análisis de la cola `arc-analisis` para apps/worker. El antivirus es el de firma EICAR hasta el
   * spec 34. Usa los tokens de KernelInfraModule (global).
   */
  static registrarWorker(opciones: ArchivosWorkerOpciones): DynamicModule {
    return {
      module: ArchivosModule,
      providers: [
        proveedorAlmacen({ ...opciones.supabase, bucket: opciones.bucket }),
        {
          provide: AnalizarArchivo,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, publicador: EventPublisher, almacen: AlmacenArchivos) =>
            new AnalizarArchivo({
              unidadDeTrabajo,
              contexto,
              publicador,
              archivos: new RepositorioArchivosTypeOrm(unidadDeTrabajo, contexto),
              almacen,
              detector: new DetectorTipoFileType(),
              antivirus: new AnalizadorFirmaEicar(),
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, EVENT_PUBLISHER, ALMACEN_ARCHIVOS],
        },
      ],
      exports: [AnalizarArchivo],
    };
  }
}
