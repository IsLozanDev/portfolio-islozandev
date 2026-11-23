import { ProveedorNoConfiguradoError } from '../domain/errores.js';
import type { ResultadoIntento } from '../domain/intento-entrega.js';
import type { Mensaje } from '../domain/mensaje.js';
import type { DependenciasEntrega } from './dependencias.js';
import type { IntentoEnCurso, TrabajoEnvio } from './ports/cola-envios.js';
import { ErrorDefinitivoProveedor, ErrorTemporalProveedor, type CorreoSaliente } from './ports/proveedor-correo.js';

export const MOTIVO_REINTENTOS_AGOTADOS = 'REINTENTOS_AGOTADOS';

/**
 * Procesador de `not-envios`, con el contexto del tenant del trabajo. El proveedor se llama fuera de la
 * transacción. Un error temporal queda como intento y se relanza para que BullMQ reintente; en el último intento
 * el mensaje queda FALLIDO. Un error definitivo lo deja FALLIDO y no se relanza. Sin configuración (o con un error
 * desconocido) se relanza sin tocar el mensaje: sigue ENCOLADO.
 */
export class EntregarMensaje {
  constructor(private readonly dependencias: DependenciasEntrega) {}

  ejecutar(trabajo: TrabajoEnvio, intento: IntentoEnCurso): Promise<void> {
    return this.dependencias.contexto.run({ tenantId: trabajo.tenantId }, () => this.entregar(trabajo.mensajeId, intento));
  }

  private async entregar(mensajeId: string, intento: IntentoEnCurso): Promise<void> {
    const { unidadDeTrabajo, mensajes, remitente } = this.dependencias;
    const mensaje = await unidadDeTrabajo.run(() => mensajes.obtener(mensajeId));
    if (mensaje?.estado !== 'ENCOLADO') return;
    if (remitente === undefined) throw new ProveedorNoConfiguradoError();
    try {
      const { idExterno } = await this.dependencias.proveedor.enviar(this.correoDe(mensaje, remitente));
      await this.registrarAceptado(mensaje, idExterno, intento);
    } catch (error) {
      if (error instanceof ErrorDefinitivoProveedor) return this.registrarDefinitivo(mensaje, intento, error);
      if (error instanceof ErrorTemporalProveedor) await this.registrarTemporal(mensaje, intento, error);
      throw error;
    }
  }

  private correoDe(mensaje: Mensaje, remitente: string): CorreoSaliente {
    const { id, destino, asunto, cuerpo } = mensaje.instantanea();
    return { mensajeId: id, remitente, destino, asunto, html: cuerpo };
  }

  private registrarAceptado(mensaje: Mensaje, idExterno: string, intento: IntentoEnCurso): Promise<void> {
    return this.guardar(mensaje, intento, 'ACEPTADO', { id_externo: idExterno }, (en) => mensaje.marcarEnviado(idExterno, en));
  }

  /** No se relanza: BullMQ da el trabajo por terminado y no reintenta. */
  private registrarDefinitivo(mensaje: Mensaje, intento: IntentoEnCurso, error: ErrorDefinitivoProveedor): Promise<void> {
    this.dependencias.avisar('Error definitivo del proveedor de correo', { mensajeId: mensaje.id, intento: intento.numero, codigo: error.codigo });
    return this.guardar(mensaje, intento, 'ERROR_DEFINITIVO', { codigo: error.codigo }, (en) => mensaje.marcarFallido(error.codigo, en));
  }

  private async registrarTemporal(mensaje: Mensaje, intento: IntentoEnCurso, error: ErrorTemporalProveedor): Promise<void> {
    this.dependencias.avisar('Error temporal del proveedor de correo', { mensajeId: mensaje.id, intento: intento.numero, codigo: error.codigo });
    await this.guardar(mensaje, intento, 'ERROR_TEMPORAL', { codigo: error.codigo }, (en) =>
      intento.esUltimo ? mensaje.marcarFallido(MOTIVO_REINTENTOS_AGOTADOS, en) : false,
    );
  }

  /** Intento y cambio de estado en una transacción. `cambiar` devuelve si el mensaje cambió. */
  private guardar(
    mensaje: Mensaje,
    intento: IntentoEnCurso,
    resultado: ResultadoIntento,
    respuestaProveedor: Record<string, string>,
    cambiar: (en: Date) => boolean,
  ): Promise<void> {
    const { unidadDeTrabajo, mensajes, ids, reloj, contexto } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const en = reloj.now();
      const versionLeida = mensaje.version;
      if (cambiar(en)) await mensajes.actualizar(mensaje, versionLeida);
      await mensajes.registrarIntento({
        id: ids.next(),
        tenantId: contexto.current().tenantId,
        mensajeId: mensaje.id,
        numero: intento.numero,
        resultado,
        respuestaProveedor,
        en,
      });
    });
  }
}
