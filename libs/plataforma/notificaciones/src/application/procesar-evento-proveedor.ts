import { CANAL_CORREO } from '../domain/canal.js';
import type { Mensaje } from '../domain/mensaje.js';
import type { DependenciasWebhook } from './dependencias.js';
import type { CabecerasWebhook, EventoProveedor } from './ports/verificador-webhook.js';

type EventoConMensaje = Exclude<EventoProveedor, { tipo: 'IGNORADO' }>;
type EventoDeRechazo = Extract<EventoProveedor, { tipo: 'REBOTE_DURO' | 'QUEJA_SPAM' }>;

/**
 * Webhook del proveedor (TR-CA-197 y 198). Verifica la firma, ubica el mensaje en cualquier tenant y, con el
 * contexto de ese tenant, avanza su estado. Un aviso repetido o que retrocede no cambia nada ni deja intento.
 * Un rebote duro o una queja marcan el mensaje FALLIDO y el destino como contacto inválido del tenant; en R2 no
 * hay canal alterno.
 */
export class ProcesarEventoProveedor {
  constructor(private readonly dependencias: DependenciasWebhook) {}

  async ejecutar(cuerpoCrudo: Buffer, cabeceras: CabecerasWebhook): Promise<void> {
    const evento = this.dependencias.verificador.verificar(cuerpoCrudo, cabeceras);
    if (evento.tipo === 'IGNORADO') return;
    const ubicado = await this.dependencias.localizador.porIdExterno(evento.idExterno);
    if (!ubicado) {
      this.dependencias.avisar('Webhook de un mensaje desconocido', { idExterno: evento.idExterno, tipo: evento.tipo });
      return;
    }
    const { contexto, unidadDeTrabajo } = this.dependencias;
    await contexto.run({ tenantId: ubicado.tenantId }, () => unidadDeTrabajo.run(() => this.aplicar(ubicado.mensajeId, evento)));
  }

  private async aplicar(mensajeId: string, evento: EventoConMensaje): Promise<void> {
    const { mensajes, ids, contexto } = this.dependencias;
    const mensaje = await mensajes.obtener(mensajeId);
    if (!mensaje) return;
    const versionLeida = mensaje.version;
    if (!cambiarEstado(mensaje, evento)) return;
    await mensajes.actualizar(mensaje, versionLeida);
    await mensajes.registrarIntento({
      id: ids.next(),
      tenantId: contexto.current().tenantId,
      mensajeId,
      numero: await mensajes.siguienteNumeroIntento(mensajeId),
      resultado: 'CALLBACK',
      respuestaProveedor: { tipo: evento.tipo, ...(esRechazo(evento) ? { detalle: evento.detalle } : {}) },
      en: evento.en,
    });
    if (esRechazo(evento)) await this.dependencias.contactosInvalidos.marcar(CANAL_CORREO, mensaje.destinoHash, evento.tipo);
  }
}

function cambiarEstado(mensaje: Mensaje, evento: EventoConMensaje): boolean {
  switch (evento.tipo) {
    case 'ENVIADO':
      return mensaje.marcarEnviado(evento.idExterno, evento.en);
    case 'ENTREGADO':
      return mensaje.marcarEntregado(evento.en);
    case 'LEIDO':
      return mensaje.marcarLeido(evento.en);
    case 'REBOTE_DURO':
    case 'QUEJA_SPAM':
      return mensaje.marcarFallido(`${evento.tipo}: ${evento.detalle}`, evento.en);
  }
}

function esRechazo(evento: EventoConMensaje): evento is EventoDeRechazo {
  return evento.tipo === 'REBOTE_DURO' || evento.tipo === 'QUEJA_SPAM';
}
