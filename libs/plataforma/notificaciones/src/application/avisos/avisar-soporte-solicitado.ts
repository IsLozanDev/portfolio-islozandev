import { CODIGOS_AVISO, variablesSoporteSolicitado, type CargaSoporteSolicitado } from '../../domain/avisos-plataforma.js';
import type { EnvioAvisos, EventoDeAviso } from './envio-avisos.js';

/** `soporte.solicitado` → un correo a cada propietario del tenant, que es quien aprueba el acceso. */
export class AvisarSoporteSolicitado {
  constructor(private readonly envio: EnvioAvisos) {}

  ejecutar(evento: EventoDeAviso<CargaSoporteSolicitado>): Promise<void> {
    return this.envio.aPropietarios(evento, CODIGOS_AVISO.soporteSolicitado, (tenant) => variablesSoporteSolicitado(evento.payload, tenant));
  }
}
