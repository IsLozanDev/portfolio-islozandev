import { Logger, Module, type DynamicModule, type ModuleMetadata, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { AUDITORIA, type AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { Clock, EventPublisher, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { hashDocumento } from '@vitrina/plataforma/observabilidad';
import { TenantRepositorioTypeOrm, ZONA_VENCIMIENTOS } from '@vitrina/plataforma/org';
import { CONSENTIMIENTO_PORT, PERSONA_PORT, type ConsentimientoPort, type PersonaPort } from '@vitrina/plataforma/personas';
import { PropietariosTenantTypeOrm } from '@vitrina/plataforma/seguridad';
import { Resend } from 'resend';
import { AvisarIntegridadRota } from './application/avisos/avisar-integridad-rota.js';
import { AvisarSoporteSolicitado } from './application/avisos/avisar-soporte-solicitado.js';
import { AvisarSuscripcionPorVencer } from './application/avisos/avisar-suscripcion-por-vencer.js';
import { AvisarTenantSuspendido } from './application/avisos/avisar-tenant-suspendido.js';
import { EnvioAvisos } from './application/avisos/envio-avisos.js';
import type { DependenciasEnvio, DependenciasPlantillas, HashearDestino, Registrar } from './application/dependencias.js';
import { EncolarEnvio } from './application/encolar-envio.js';
import { EntregarMensaje } from './application/entregar-mensaje.js';
import { EnviarNotificacion } from './application/enviar-notificacion.js';
import { ConsultarPlantilla } from './application/plantillas/consultar-plantilla.js';
import { ListarPlantillas } from './application/plantillas/listar-plantillas.js';
import { ListarVersionesPlantilla } from './application/plantillas/listar-versiones-plantilla.js';
import { PersonalizarPlantilla } from './application/plantillas/personalizar-plantilla.js';
import { RestaurarPlantillaBase } from './application/plantillas/restaurar-plantilla-base.js';
import { VistaPreviaPlantilla } from './application/plantillas/vista-previa-plantilla.js';
import { NOTIFICACION_PORT, type NotificacionPort } from './application/ports/notificacion.port.js';
import type { ProveedorCorreo } from './application/ports/proveedor-correo.js';
import type { VerificadorWebhook } from './application/ports/verificador-webhook.js';
import { ProcesarEventoProveedor } from './application/procesar-evento-proveedor.js';
import { abrirColaEnvios, EVENTO_ERROR_COLA_ENVIOS, type ColaEnviosAbierta } from './infrastructure/bullmq/cola-envios.js';
import { CircuitBreaker } from './infrastructure/resend/circuit-breaker.js';
import { PROVEEDOR_NO_CONFIGURADO, VERIFICADOR_NO_CONFIGURADO } from './infrastructure/resend/no-configurado.js';
import { ProveedorCorreoResend } from './infrastructure/resend/proveedor-correo.resend.js';
import { VerificadorWebhookResend } from './infrastructure/resend/verificador-webhook.resend.js';
import { SaneadorHtmlSanitize } from './infrastructure/sanitize-html/saneador-html.sanitize.js';
import { RepositorioContactosInvalidosTypeOrm } from './infrastructure/typeorm/contactos-invalidos.repositorio.js';
import { MensajePorIdExternoSql, type EjecutorSql } from './infrastructure/typeorm/mensaje-por-id-externo.sql.js';
import { RepositorioMensajesTypeOrm } from './infrastructure/typeorm/mensajes.repositorio.js';
import { RepositorioPlantillasTypeOrm } from './infrastructure/typeorm/plantillas.repositorio.js';
import { NombreTenantOrg } from './infrastructure/org/nombre-tenant.org.js';
import type { EntornoNotificaciones } from './interface/entorno-notificaciones.js';
import { AvisosPlataformaConsumidor } from './interface/avisos-plataforma.consumidor.js';
import { NotificacionesConsumidor } from './interface/notificaciones.consumidor.js';
import { PlantillasController } from './interface/plantillas.controller.js';
import { WebhooksController } from './interface/webhooks.controller.js';

const CONTEXTO_LOG = 'Notificaciones';
/** Solo fuera de producción (allí NOT_SAL_DESTINO es obligatoria): el hash sigue siendo estable entre reinicios. */
const SAL_DESTINO_SIN_CONFIGURAR = 'not-sal-destino-local-no-apta-para-produccion';
const COLA_ENVIOS_ABIERTA = Symbol('ColaEnviosAbierta');
const DEPENDENCIAS_PLANTILLAS = Symbol('DependenciasPlantillas');

export interface NotificacionesOpciones {
  entorno: EntornoNotificaciones;
  /** Para ubicar por id externo el mensaje de un webhook, que llega sin tenant, fuera de toda transacción. */
  dataSource: EjecutorSql;
  /** Módulos que exportan `PERSONA_PORT` y `CONSENTIMIENTO_PORT` (PersonasModule). */
  imports: ModuleMetadata['imports'];
}

export interface NotificacionesWorkerOpciones {
  /** Cola `not-envios`. */
  redisUrl: string;
  entorno: EntornoNotificaciones;
}

function crearAviso(): Registrar {
  const logger = new Logger(CONTEXTO_LOG);
  return (mensaje, datos) => logger.warn({ evento: mensaje, ...datos });
}

function crearInforme(): Registrar {
  const logger = new Logger(CONTEXTO_LOG);
  return (mensaje, datos) => logger.log({ evento: mensaje, ...datos });
}

/** El worker solo envía a correos directos y TRANSACCIONAL (avisos de plataforma): TR-PER no está en su proceso. */
function personaNoDisponible(): Promise<never> {
  return Promise.reject(new Error('TR-PER no está disponible en el worker de notificaciones'));
}
const PERSONAS_NO_DISPONIBLES: DependenciasEnvio['personas'] = { obtener: personaNoDisponible };
const CONSENTIMIENTOS_NO_DISPONIBLES: DependenciasEnvio['consentimientos'] = { vigente: personaNoDisponible };

type PiezasEnvio = Pick<DependenciasEnvio, 'unidadDeTrabajo' | 'contexto' | 'reloj' | 'ids' | 'publicador' | 'personas' | 'consentimientos'> & {
  unidadDeTrabajo: TypeOrmUnitOfWork;
};

function crearEnvio(entorno: EntornoNotificaciones, piezas: PiezasEnvio): NotificacionPort {
  const { unidadDeTrabajo, contexto } = piezas;
  return new EnviarNotificacion({
    ...piezas,
    mensajes: new RepositorioMensajesTypeOrm(unidadDeTrabajo, contexto),
    plantillas: new RepositorioPlantillasTypeOrm(unidadDeTrabajo, contexto),
    contactosInvalidos: new RepositorioContactosInvalidosTypeOrm(unidadDeTrabajo, contexto),
    hashearDestino: hasheadorDestino(entorno),
    zonaHoraria: ZONA_VENCIMIENTOS,
  });
}

function hasheadorDestino(entorno: EntornoNotificaciones): HashearDestino {
  const sal = entorno.NOT_SAL_DESTINO ?? SAL_DESTINO_SIN_CONFIGURAR;
  return (destino) => hashDocumento(destino, sal);
}

function crearProveedor(entorno: EntornoNotificaciones, reloj: Clock): ProveedorCorreo {
  if (!entorno.RESEND_API_KEY) return PROVEEDOR_NO_CONFIGURADO;
  return new ProveedorCorreoResend(new Resend(entorno.RESEND_API_KEY).emails, new CircuitBreaker(reloj));
}

/** `webhooks.verify` no llama a la API, pero el SDK exige una API key al construirse. */
function crearVerificador(entorno: EntornoNotificaciones): VerificadorWebhook {
  if (!entorno.RESEND_API_KEY || !entorno.RESEND_WEBHOOK_SECRET) return VERIFICADOR_NO_CONFIGURADO;
  return new VerificadorWebhookResend(new Resend(entorno.RESEND_API_KEY).webhooks, entorno.RESEND_WEBHOOK_SECRET);
}

/** Los casos de uso de plantillas reciben las mismas dependencias. */
function casoDeUsoDePlantillas<CasoDeUso>(clase: new (dependencias: DependenciasPlantillas) => CasoDeUso): Provider {
  return { provide: clase, useFactory: (dependencias: DependenciasPlantillas) => new clase(dependencias), inject: [DEPENDENCIAS_PLANTILLAS] };
}

/** Cierra la cola de envíos con la app (app.close() en pruebas y apagado). */
class CierreColaEnvios implements OnModuleDestroy {
  constructor(private readonly abierta: ColaEnviosAbierta) {}

  onModuleDestroy(): Promise<void> {
    return this.abierta.cerrar();
  }
}

// Usa los tokens de KernelInfraModule y AUDITORIA de AuditoriaModule (globales), que la app debe importar con
// registrarEsquemasNot.
// Las entidades ENTIDADES_NOT van en el DataSource de la app.
@Module({})
export class NotificacionesModule {
  /** `NOTIFICACION_PORT` en proceso, el webhook del proveedor y las plantillas por HTTP, para apps/api. */
  static register({ entorno, dataSource, imports }: NotificacionesOpciones): DynamicModule {
    const avisar = crearAviso();
    return {
      module: NotificacionesModule,
      imports,
      controllers: [WebhooksController, PlantillasController],
      providers: [
        {
          provide: DEPENDENCIAS_PLANTILLAS,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            ids: IdGenerator,
            auditoria: AuditoriaPort,
          ): DependenciasPlantillas => ({
            unidadDeTrabajo,
            contexto,
            reloj,
            ids,
            auditoria,
            plantillas: new RepositorioPlantillasTypeOrm(unidadDeTrabajo, contexto),
            saneador: new SaneadorHtmlSanitize(),
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, AUDITORIA],
        },
        casoDeUsoDePlantillas(ListarPlantillas),
        casoDeUsoDePlantillas(ConsultarPlantilla),
        casoDeUsoDePlantillas(ListarVersionesPlantilla),
        casoDeUsoDePlantillas(VistaPreviaPlantilla),
        casoDeUsoDePlantillas(PersonalizarPlantilla),
        casoDeUsoDePlantillas(RestaurarPlantillaBase),
        {
          provide: NOTIFICACION_PORT,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            ids: IdGenerator,
            publicador: EventPublisher,
            personas: PersonaPort,
            consentimientos: ConsentimientoPort,
          ): NotificacionPort => crearEnvio(entorno, { unidadDeTrabajo, contexto, reloj, ids, publicador, personas, consentimientos }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, EVENT_PUBLISHER, PERSONA_PORT, CONSENTIMIENTO_PORT],
        },
        {
          provide: ProcesarEventoProveedor,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock, ids: IdGenerator) =>
            new ProcesarEventoProveedor({
              unidadDeTrabajo,
              contexto,
              reloj,
              ids,
              mensajes: new RepositorioMensajesTypeOrm(unidadDeTrabajo, contexto),
              contactosInvalidos: new RepositorioContactosInvalidosTypeOrm(unidadDeTrabajo, contexto),
              verificador: crearVerificador(entorno),
              localizador: new MensajePorIdExternoSql(dataSource),
              avisar,
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR],
        },
      ],
      exports: [NOTIFICACION_PORT],
    };
  }

  /**
   * El consumidor de `not.mensaje.solicitado` (EventosModule.registrarWorker lo descubre por `@SuscribirEvento`),
   * `EntregarMensaje`, que procesa la cola `not-envios` desde apps/worker, y el consumidor de los avisos de
   * plataforma (spec 44), que lee los propietarios de SEG y el nombre del tenant de ORG con sus adaptadores.
   */
  static registerWorker({ redisUrl, entorno }: NotificacionesWorkerOpciones): DynamicModule {
    const avisar = crearAviso();
    return {
      module: NotificacionesModule,
      providers: [
        {
          provide: COLA_ENVIOS_ABIERTA,
          // Solo el nombre del error: el mensaje de Redis puede llevar la URL con su clave.
          useFactory: (): ColaEnviosAbierta => abrirColaEnvios(redisUrl, (error) => avisar(EVENTO_ERROR_COLA_ENVIOS, { error: error.name })),
        },
        { provide: CierreColaEnvios, useFactory: (abierta: ColaEnviosAbierta) => new CierreColaEnvios(abierta), inject: [COLA_ENVIOS_ABIERTA] },
        {
          provide: NotificacionesConsumidor,
          useFactory: (reloj: Clock, abierta: ColaEnviosAbierta) => new NotificacionesConsumidor(new EncolarEnvio({ reloj, cola: abierta.cola })),
          inject: [CLOCK, COLA_ENVIOS_ABIERTA],
        },
        {
          provide: AvisosPlataformaConsumidor,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock, ids: IdGenerator, publicador: EventPublisher) => {
            const envio = new EnvioAvisos({
              unidadDeTrabajo,
              contexto,
              notificaciones: crearEnvio(entorno, {
                unidadDeTrabajo,
                contexto,
                reloj,
                ids,
                publicador,
                personas: PERSONAS_NO_DISPONIBLES,
                consentimientos: CONSENTIMIENTOS_NO_DISPONIBLES,
              }),
              propietarios: new PropietariosTenantTypeOrm(unidadDeTrabajo, contexto, reloj),
              nombreTenant: new NombreTenantOrg(new TenantRepositorioTypeOrm(unidadDeTrabajo, contexto), contexto),
              correoOperacion: entorno.NOT_CORREO_OPERACION,
              zonaHoraria: ZONA_VENCIMIENTOS,
              informar: crearInforme(),
              avisar,
            });
            return new AvisosPlataformaConsumidor({
              suscripcionPorVencer: new AvisarSuscripcionPorVencer(envio),
              tenantSuspendido: new AvisarTenantSuspendido(envio),
              soporteSolicitado: new AvisarSoporteSolicitado(envio),
              integridadRota: new AvisarIntegridadRota(envio),
            });
          },
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, EVENT_PUBLISHER],
        },
        {
          provide: EntregarMensaje,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock, ids: IdGenerator) =>
            new EntregarMensaje({
              unidadDeTrabajo,
              contexto,
              reloj,
              ids,
              mensajes: new RepositorioMensajesTypeOrm(unidadDeTrabajo, contexto),
              proveedor: crearProveedor(entorno, reloj),
              remitente: entorno.NOT_REMITENTE,
              avisar,
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR],
        },
      ],
      exports: [EntregarMensaje],
    };
  }
}
