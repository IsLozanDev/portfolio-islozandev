import { QueryFailedError, type DataSource } from 'typeorm';
import type { AvanceCursor, CursorRelay, LectorOutbox } from '../../application/ports/relay.js';
import { RelayCursorEntidad } from './entidades.js';
import { LectorOutboxTypeOrm } from './lector-outbox.typeorm.js';

/** PostgreSQL: FOR UPDATE NOWAIT sobre una fila que otra transacción tiene bloqueada. */
const BLOQUEO_NO_DISPONIBLE = '55P03';

/**
 * Transacción propia sin tenant: el relay lee entre tenants con sync.read_events, no con la RLS.
 * Un bloqueo asesor de sesión no sirve con el pooler en modo transacción; el de fila sí.
 */
export class CursorRelayTypeOrm implements CursorRelay {
  constructor(private readonly dataSource: DataSource) {}

  async conBloqueo<T>(relay: string, trabajo: (cursor: string, lector: LectorOutbox) => Promise<AvanceCursor<T>>): Promise<T | null> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repositorio = manager.getRepository(RelayCursorEntidad);
        const fila = await repositorio
          .createQueryBuilder('cursor')
          .setLock('pessimistic_write')
          .setOnLocked('nowait')
          .where('cursor.relay = :relay', { relay })
          .getOne();
        if (!fila) throw new Error(`No existe el cursor del relay «${relay}» en sync.relay_cursor`);
        const { nuevoCursor, resultado } = await trabajo(fila.ultimoSeq, new LectorOutboxTypeOrm(manager));
        if (nuevoCursor !== fila.ultimoSeq) await repositorio.update({ relay }, { ultimoSeq: nuevoCursor, actualizadoEn: new Date() });
        return resultado;
      });
    } catch (error) {
      if (esBloqueoOcupado(error)) return null;
      throw error;
    }
  }
}

function esBloqueoOcupado(error: unknown): boolean {
  return error instanceof QueryFailedError && (error.driverError as { code?: string }).code === BLOQUEO_NO_DISPONIBLE;
}
