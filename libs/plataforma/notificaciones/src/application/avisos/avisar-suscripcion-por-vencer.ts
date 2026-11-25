import { CODIGOS_AVISO, variablesSuscripcionPorVencer, type CargaSuscripcionPorVencer } from '../../domain/avisos-plataforma.js';
import type { EnvioAvisos, EventoDeAviso } from './envio-avisos.js';

/** `suscripcion.por_vencer` (7, 3 o 1 días antes) → un correo a cada propietario del tenant. */
export class AvisarSuscripcionPorVencer {
  constructor(private readonly envio: EnvioAvisos) {}

  ejecutar(evento: EventoDeAviso<CargaSuscripcionPorVencer>): Promise<void> {
    return this.envio.aPropietarios(evento, CODIGOS_AVISO.suscripcionPorVencer, (tenant) => variablesSuscripcionPorVencer(evento.payload, tenant));
  }
}
