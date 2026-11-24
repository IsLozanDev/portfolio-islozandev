import type { AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { ConsentimientoPort, PersonaPort } from '@vitrina/plataforma/personas';
import type { ColaEnvios } from './ports/cola-envios.js';
import type { ProveedorCorreo } from './ports/proveedor-correo.js';
import type { SaneadorHtml } from './ports/saneador-html.js';
import type { RepositorioContactosInvalidos, RepositorioMensajes, RepositorioPlantillas, LocalizadorMensajes } from './ports/repositorios.js';
import type { VerificadorWebhook } from './ports/verificador-webhook.js';

export type Registrar = (mensaje: string, datos: Record<string, unknown>) => void;

/** Hash del destino con la sal de plataforma (`NOT_SAL_DESTINO`): lo único del destino que va a logs. */
export type HashearDestino = (destino: string) => string;

interface Transaccional {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  ids: IdGenerator;
  mensajes: RepositorioMensajes;
}

/** `EnviarNotificacion`, en el proceso del llamador. */
export interface DependenciasEnvio extends Transaccional {
  publicador: EventPublisher;
  plantillas: RepositorioPlantillas;
  contactosInvalidos: RepositorioContactosInvalidos;
  personas: Pick<PersonaPort, 'obtener'>;
  consentimientos: Pick<ConsentimientoPort, 'vigente'>;
  hashearDestino: HashearDestino;
  /** Zona de la ventana de los promocionales (America/Lima). */
  zonaHoraria: string;
}

/** `EncolarEnvio`, consumidor de `not.mensaje.solicitado` en el worker. */
export interface DependenciasEncolado {
  reloj: Clock;
  cola: ColaEnvios;
}

/** `EntregarMensaje`, procesador de `not-envios` en el worker. */
export interface DependenciasEntrega extends Transaccional {
  proveedor: ProveedorCorreo;
  /** `NOT_REMITENTE`. Sin él, ProveedorNoConfiguradoError y el mensaje sigue ENCOLADO. */
  remitente: string | undefined;
  avisar: Registrar;
}

/** Casos de uso de `/v1/notificaciones/plantillas`, en la API (spec 43). */
export interface DependenciasPlantillas {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  ids: IdGenerator;
  plantillas: RepositorioPlantillas;
  saneador: SaneadorHtml;
  auditoria: Pick<AuditoriaPort, 'registrar'>;
}

/** `ProcesarEventoProveedor`, el webhook en la API. */
export interface DependenciasWebhook extends Transaccional {
  verificador: VerificadorWebhook;
  localizador: LocalizadorMensajes;
  contactosInvalidos: RepositorioContactosInvalidos;
  avisar: Registrar;
}
