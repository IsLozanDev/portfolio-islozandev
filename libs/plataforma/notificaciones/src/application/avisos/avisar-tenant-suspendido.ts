import { CODIGOS_AVISO, variablesTenantSuspendido, type CargaTenantSuspendido } from '../../domain/avisos-plataforma.js';
import type { EnvioAvisos, EventoDeAviso } from './envio-avisos.js';

/** `tenant.suspendido` → un correo a cada propietario del tenant. */
export class AvisarTenantSuspendido {
  constructor(private readonly envio: EnvioAvisos) {}

  ejecutar(evento: EventoDeAviso<CargaTenantSuspendido>): Promise<void> {
    return this.envio.aPropietarios(evento, CODIGOS_AVISO.tenantSuspendido, (tenant) =>
      variablesTenantSuspendido(evento.payload, tenant, this.envio.zonaHoraria),
    );
  }
}
