import type { DiasGracia } from '@vitrina/plataforma/org';
import type { ParametroPort } from '@vitrina/plataforma/parametros';

const PARAMETRO_DIAS_GRACIA = 'plat.suscripcion.dias_gracia';

/**
 * `plat.suscripcion.dias_gracia` por ParametroPort (TR-RNF-119). ParametroPort toma el tenant del
 * contexto: ProcesarVencimientosTenant lo llama dentro del `TenantContext.run` del tenant que pide.
 */
export class DiasGraciaParametros implements DiasGracia {
  constructor(private readonly parametros: Pick<ParametroPort, 'valor'>) {}

  async de(): Promise<number> {
    const { valor } = await this.parametros.valor<number>(PARAMETRO_DIAS_GRACIA);
    return valor;
  }
}
