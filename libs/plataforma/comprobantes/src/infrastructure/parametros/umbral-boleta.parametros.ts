import type { ParametroPort } from '@vitrina/plataforma/parametros';
import type { UmbralBoleta } from '../../application/ports/reglas-emision.js';
import { ESCALA_MONTO, monto, type Decimal } from '../../domain/comprobante/dinero.js';
import { PARAMETRO_UMBRAL_BOLETA } from '../../domain/permisos-fe.js';

/** Un NUMERO del manifiesto: se pasa por su texto decimal para no operar en coma flotante. */
export class UmbralBoletaParametros implements UmbralBoleta {
  constructor(private readonly parametros: Pick<ParametroPort, 'valor'>) {}

  async valor(empresaId: string, sucursalId: string): Promise<Decimal> {
    const { valor } = await this.parametros.valor<number>(PARAMETRO_UMBRAL_BOLETA, { empresaId, sucursalId });
    return monto(valor.toFixed(ESCALA_MONTO), PARAMETRO_UMBRAL_BOLETA);
  }
}
