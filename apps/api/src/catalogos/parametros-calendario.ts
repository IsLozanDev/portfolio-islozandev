import type { ParametrosCalendario } from '@vitrina/plataforma/catalogos';
import type { ParametroPort } from '@vitrina/plataforma/parametros';

export const PARAMETRO_SABADO_HABIL = 'plat.calendario.sabado_habil';

/** `sabado_habil` con ParametroPort (sucursal, empresa, tenant y defecto, TR-RN-014): catalogos no importa parametros (TR-RNF-119). */
export class ParametrosCalendarioCfg implements ParametrosCalendario {
  constructor(private readonly parametros: Pick<ParametroPort, 'valor'>) {}

  async sabadoHabil(sucursalId: string | null): Promise<boolean> {
    const contexto = sucursalId === null ? {} : { sucursalId };
    const { valor } = await this.parametros.valor<boolean>(PARAMETRO_SABADO_HABIL, contexto);
    return valor;
  }
}
