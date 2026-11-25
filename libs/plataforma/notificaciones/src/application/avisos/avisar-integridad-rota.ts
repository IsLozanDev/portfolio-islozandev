import { CODIGOS_AVISO, variablesIntegridadRota, type CargaIntegridadRota } from '../../domain/avisos-plataforma.js';
import type { EnvioAvisos, EventoDeAviso } from './envio-avisos.js';

/**
 * `aud.integridad.rota` → un correo a `NOT_CORREO_OPERACION`, nunca a los propietarios. El mensaje queda con el
 * tenant del evento (columna obligatoria de `ntf.mensaje`).
 */
export class AvisarIntegridadRota {
  constructor(private readonly envio: EnvioAvisos) {}

  ejecutar(evento: EventoDeAviso<CargaIntegridadRota>): Promise<void> {
    return this.envio.aOperacion(evento, CODIGOS_AVISO.integridadRota, variablesIntegridadRota(evento.payload, evento.tenantId));
  }
}
