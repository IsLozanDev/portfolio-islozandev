import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { QueryFailedError } from 'typeorm';
import type { SolicitudNumero } from '../../application/ports/correlativo.port.js';
import type { FilaNumerada, NumeracionSql } from '../../application/ports/repositorios.js';
import { SerieAgotadaError } from '../../domain/errores.js';
import { SerieEntidad } from './entidades.js';

const VIOLACION_CHECK = '23514';
const RESTRICCION_AGOTADA = 'ck_serie_agotada';

interface FilaSiguiente {
  serie: string;
  /** bigint: node-pg lo devuelve como string. */
  numero: string;
  digitos: number;
}

/**
 * SQL crudo justificado (regla 11, spec 10): seq.siguiente bloquea la fila, reinicia por periodo e
 * incrementa en un solo UPDATE. Usa el EntityManager de la transacción activa: fuera de ella,
 * `manager` lanza NoActiveTransactionError.
 */
export class NumeracionSqlTypeOrm implements NumeracionSql {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async siguiente(tenantId: string, solicitud: SolicitudNumero, instante: Date): Promise<FilaNumerada | null> {
    const filas = await this.llamarSiguiente(tenantId, solicitud, instante);
    const [fila] = filas;
    return fila ? { serie: fila.serie, numero: BigInt(fila.numero), digitos: fila.digitos } : null;
  }

  async estado(tenantId: string, solicitud: SolicitudNumero): Promise<'INACTIVA' | null> {
    const serie = await this.unidadDeTrabajo.manager.getRepository(SerieEntidad).findOne({
      select: { id: true, activa: true },
      where: { tenantId, empresaId: solicitud.empresaId, tipo: solicitud.tipo, serie: solicitud.serie },
    });
    return serie && !serie.activa ? 'INACTIVA' : null;
  }

  private async llamarSiguiente(tenantId: string, solicitud: SolicitudNumero, instante: Date): Promise<FilaSiguiente[]> {
    try {
      return await this.unidadDeTrabajo.manager.query(
        'SELECT serie, numero, digitos FROM seq.siguiente($1, $2, $3, $4, $5)',
        [tenantId, solicitud.empresaId, solicitud.tipo, solicitud.serie, instante],
      );
    } catch (error) {
      if (esSerieAgotada(error)) throw new SerieAgotadaError();
      throw error;
    }
  }
}

function esSerieAgotada(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const { code, constraint } = error.driverError as { code?: string; constraint?: string };
  return code === VIOLACION_CHECK && constraint === RESTRICCION_AGOTADA;
}
