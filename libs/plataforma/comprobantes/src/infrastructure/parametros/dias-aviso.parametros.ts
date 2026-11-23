import type { ParametroPort } from '@vitrina/plataforma/parametros';
import type { DiasAvisoCertificado } from '../../application/ports/dias-aviso-certificado.js';
import { PARAMETRO_DIAS_AVISO_CERTIFICADO } from '../../domain/permisos-fe.js';

/** ParametroPort toma el tenant del contexto: se llama dentro del `TenantContext.run` del emisor. */
export class DiasAvisoParametros implements DiasAvisoCertificado {
  constructor(private readonly parametros: Pick<ParametroPort, 'valor'>) {}

  async delTenant(): Promise<number> {
    const { valor } = await this.parametros.valor<number>(PARAMETRO_DIAS_AVISO_CERTIFICADO);
    return valor;
  }
}
