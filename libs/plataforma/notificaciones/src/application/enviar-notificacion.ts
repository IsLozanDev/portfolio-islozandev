import { bloqueaEnvio } from '../domain/baja.js';
import { CANAL_CORREO, estaHabilitado } from '../domain/canal.js';
import { normalizarCorreo } from '../domain/correo-destino.js';
import {
  CanalNoHabilitadoError,
  ClaveIdempotenciaInvalidaError,
  PersonaSinCorreoError,
  PlantillaNoEncontradaError,
  PromocionalSinPersonaError,
} from '../domain/errores.js';
import { AGREGADO_MENSAJE, EVENTOS_NOT, VERSION_ESQUEMA_NOT, type MensajeSolicitado } from '../domain/eventos-not.js';
import { agregarPiePreferencias, llevaPiePreferencias, urlPreferencias, vencimientoEnlace } from '../domain/enlace-preferencias.js';
import { MOTIVO_BAJA_CANAL } from '../domain/estado-mensaje.js';
import { CONSENTIMIENTO_PROMOCIONAL, FINALIDAD_PROMOCIONAL } from '../domain/finalidad-notificacion.js';
import { Mensaje } from '../domain/mensaje.js';
import { IDIOMA_POR_DEFECTO } from '../domain/plantilla.js';
import { renderizar } from '../domain/renderizador-plantilla.js';
import { programarPromocional } from '../domain/ventana-promocional.js';
import type { DependenciasEnvio } from './dependencias.js';
import type { Destinatario, EnviarNotificacionComando, NotificacionPort, NotificacionRegistrada } from './ports/notificacion.port.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPO_CONTACTO_CORREO = 'CORREO';
export const MOTIVO_CONTACTO_INVALIDO = 'CONTACTO_INVALIDO';
const EVENTO_PIE_SIN_CONFIGURAR = 'not.pie_preferencias_sin_configurar';

interface DestinoResuelto {
  correo: string;
  personaId: string | null;
}

/** Cómo queda el mensaje antes de insertarlo. */
interface Decision {
  estado: 'ENCOLADO' | 'OMITIDO_SIN_CONSENTIMIENTO' | 'DESCARTADO';
  motivoFallo: string | null;
  programadoPara: Date | null;
}

/**
 * TR-RF-075 y TR-RN-025 en el canal CORREO. Registra el mensaje en la transacción del llamador y, si queda
 * ENCOLADO, publica `not.mensaje.solicitado` por outbox en la misma transacción (regla 4): si el llamador
 * revierte, no sale ningún correo. Los omitidos y los descartados también se guardan, sin evento.
 */
export class EnviarNotificacion implements Pick<NotificacionPort, 'enviar'> {
  constructor(private readonly dependencias: DependenciasEnvio) {}

  async enviar(comando: EnviarNotificacionComando): Promise<NotificacionRegistrada> {
    const canal = comando.canal ?? CANAL_CORREO;
    if (!estaHabilitado(canal)) throw new CanalNoHabilitadoError(canal);
    if (!UUID.test(comando.claveIdempotencia)) throw new ClaveIdempotenciaInvalidaError();
    return this.dependencias.unidadDeTrabajo.run(() => this.registrar(comando));
  }

  private async registrar(comando: EnviarNotificacionComando): Promise<NotificacionRegistrada> {
    const { mensajes } = this.dependencias;
    const existente = await mensajes.porClave(comando.claveIdempotencia);
    if (existente) return registrada(existente, true);
    if (comando.finalidad === FINALIDAD_PROMOCIONAL && !('personaId' in comando.destinatario)) throw new PromocionalSinPersonaError();

    const destino = await this.resolverDestino(comando.destinatario);
    const mensaje = await this.crearMensaje(comando, destino);
    const guardado = await mensajes.insertar(mensaje);
    if (guardado.id !== mensaje.id) return registrada(guardado, true);
    if (guardado.estado === 'ENCOLADO') await this.publicarSolicitud(guardado);
    return registrada(guardado, false);
  }

  private async crearMensaje(comando: EnviarNotificacionComando, destino: DestinoResuelto): Promise<Mensaje> {
    const { plantillas, contexto, ids, hashearDestino } = this.dependencias;
    const plantilla = await plantillas.vigente(comando.plantilla, CANAL_CORREO, IDIOMA_POR_DEFECTO);
    if (!plantilla) throw new PlantillaNoEncontradaError(comando.plantilla);
    const contenido = renderizar(plantilla, comando.variables);
    const destinoHash = hashearDestino(destino.correo);
    const { tenantId, actorId } = contexto.current();
    const cuerpo = llevaPiePreferencias(comando.plantilla)
      ? this.conPiePreferencias(contenido.cuerpo, { tenantId, destinoHash, personaId: destino.personaId, plantilla: comando.plantilla })
      : contenido.cuerpo;
    return Mensaje.registrar({
      id: ids.next(),
      tenantId,
      plantillaId: plantilla.id,
      canal: CANAL_CORREO,
      destino: destino.correo,
      destinoHash,
      personaId: destino.personaId,
      finalidad: comando.finalidad,
      asunto: contenido.asunto,
      cuerpo,
      claveIdempotencia: comando.claveIdempotencia,
      creadoPor: actorId ?? null,
      ...(await this.decidir(comando, destino, destinoHash)),
    });
  }

  private async resolverDestino(destinatario: Destinatario): Promise<DestinoResuelto> {
    if ('correo' in destinatario) return { correo: normalizarCorreo(destinatario.correo), personaId: null };
    const persona = await this.dependencias.personas.obtener(destinatario.personaId);
    const correos = persona.contactos.filter((contacto) => contacto.tipo === TIPO_CONTACTO_CORREO);
    const elegido = correos.find((contacto) => contacto.principal) ?? correos[0];
    if (!elegido) throw new PersonaSinCorreoError();
    return { correo: normalizarCorreo(elegido.valor), personaId: destinatario.personaId };
  }

  /** El pie con el enlace firmado de preferencias (spec 46), después de renderizar la plantilla. */
  private conPiePreferencias(cuerpo: string, destino: { tenantId: string; destinoHash: string; personaId: string | null; plantilla: string }): string {
    const { enlacePreferencias, reloj, avisar } = this.dependencias;
    if (!enlacePreferencias) {
      avisar(EVENTO_PIE_SIN_CONFIGURAR, { plantilla: destino.plantilla, destino_hash: destino.destinoHash });
      return cuerpo;
    }
    const token = enlacePreferencias.firmador.firmar({
      tenantId: destino.tenantId,
      canal: CANAL_CORREO,
      destinoHash: destino.destinoHash,
      ...(destino.personaId ? { personaId: destino.personaId } : {}),
      venceEn: vencimientoEnlace(reloj.now()),
    });
    return agregarPiePreferencias(cuerpo, urlPreferencias(enlacePreferencias.urlBase, token));
  }

  /** TR-RN-025: consentimiento, bajas del destinatario, contactos inválidos y ventana horaria, en ese orden. */
  private async decidir(comando: EnviarNotificacionComando, destino: DestinoResuelto, destinoHash: string): Promise<Decision> {
    const { consentimientos, bajas, contactosInvalidos, reloj, zonaHoraria } = this.dependencias;
    const esPromocional = comando.finalidad === FINALIDAD_PROMOCIONAL;
    if (esPromocional && destino.personaId && !(await consentimientos.vigente(destino.personaId, CONSENTIMIENTO_PROMOCIONAL))) {
      return { estado: 'OMITIDO_SIN_CONSENTIMIENTO', motivoFallo: null, programadoPara: null };
    }
    const bloqueo = bloqueaEnvio(await bajas.delDestino(CANAL_CORREO, destinoHash), comando.finalidad);
    if (bloqueo === MOTIVO_BAJA_CANAL) return { estado: 'DESCARTADO', motivoFallo: bloqueo, programadoPara: null };
    if (bloqueo) return { estado: 'OMITIDO_SIN_CONSENTIMIENTO', motivoFallo: bloqueo, programadoPara: null };
    if (await contactosInvalidos.esInvalido(CANAL_CORREO, destinoHash)) {
      return { estado: 'DESCARTADO', motivoFallo: MOTIVO_CONTACTO_INVALIDO, programadoPara: null };
    }
    const programadoPara = esPromocional ? programarPromocional(reloj.now(), zonaHoraria) : null;
    return { estado: 'ENCOLADO', motivoFallo: null, programadoPara };
  }

  private async publicarSolicitud(mensaje: Mensaje): Promise<void> {
    const payload: MensajeSolicitado = {
      mensaje_id: mensaje.id,
      ...(mensaje.programadoPara ? { programado_para: mensaje.programadoPara.toISOString() } : {}),
    };
    await this.dependencias.publicador.publish({
      eventType: EVENTOS_NOT.mensajeSolicitado,
      aggregateType: AGREGADO_MENSAJE,
      aggregateId: mensaje.id,
      aggregateVersion: mensaje.version,
      schemaVersion: VERSION_ESQUEMA_NOT,
      payload,
      occurredAt: this.dependencias.reloj.now(),
    });
  }
}

function registrada(mensaje: Mensaje, repetida: boolean): NotificacionRegistrada {
  return { mensajeId: mensaje.id, estado: mensaje.estado, ...(mensaje.programadoPara ? { programadoPara: mensaje.programadoPara } : {}), repetida };
}
