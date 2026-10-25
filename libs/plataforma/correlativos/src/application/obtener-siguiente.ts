import type { Clock, TenantContext } from '@vitrina/plataforma/kernel';
import { SerieInactivaError, SerieNoEncontradaError } from '../domain/errores.js';
import { NumeroCorrelativo } from '../domain/numero-correlativo.js';
import type { CorrelativoPort, NumeroEmitido, SolicitudNumero } from './ports/correlativo.port.js';
import type { NumeracionSql } from './ports/repositorios.js';

export const EVENTO_NUMERO_EMITIDO = 'seq.numero.emitido';

export type Depuracion = (mensaje: string, datos: Record<string, unknown>) => void;

/**
 * TR-RF-036 y TR-RF-037: siguiente número de una serie, con reinicio por periodo en la zona de la
 * sucursal. No abre transacción propia: usa la del producto. No publica eventos.
 */
export class ObtenerSiguiente implements CorrelativoPort {
  constructor(
    private readonly contexto: TenantContext,
    private readonly reloj: Clock,
    private readonly numeracion: NumeracionSql,
    private readonly depuracion: Depuracion = () => undefined,
  ) {}

  async siguiente(solicitud: SolicitudNumero): Promise<NumeroEmitido> {
    const { tenantId } = this.contexto.current();
    const fila = await this.numeracion.siguiente(tenantId, solicitud, this.reloj.now());
    if (!fila) throw await this.motivoSinNumero(tenantId, solicitud);

    const numero = NumeroCorrelativo.de(fila.serie, fila.numero, fila.digitos);
    this.depuracion(EVENTO_NUMERO_EMITIDO, { tipo: solicitud.tipo, serie: numero.serie, numero: numero.numero.toString() });
    return { serie: numero.serie, numero: numero.numero, numeroFormateado: numero.formateado };
  }

  private async motivoSinNumero(tenantId: string, solicitud: SolicitudNumero): Promise<Error> {
    const estado = await this.numeracion.estado(tenantId, solicitud);
    return estado === 'INACTIVA' ? new SerieInactivaError() : new SerieNoEncontradaError();
  }
}
