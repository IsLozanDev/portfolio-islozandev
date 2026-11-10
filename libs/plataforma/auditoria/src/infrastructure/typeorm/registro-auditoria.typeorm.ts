import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { FilaAuditoria, RegistroAuditoria } from '../../application/ports/registro-auditoria.port.js';
import { AuditoriaNoDisponibleError } from '../../domain/errores.js';
import { EventoAuditoriaEntidad, type FilaEventoAuditoria, type ValorJson } from './entidades.js';

/** Log estructurado. Nunca lleva antes, despues, motivo ni payload (TR-RNF-026). */
export type AvisarError = (mensaje: string, datos: Record<string, unknown>) => void;

const MENSAJE_FALLO = 'aud.registro.error';

/** Inserta con el EntityManager de la transacción activa; el trigger de la base encadena el hash. */
export class RegistroAuditoriaTypeOrm implements RegistroAuditoria {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly avisar: AvisarError,
  ) {}

  async insertar(fila: FilaAuditoria): Promise<void> {
    // Fuera del try: sin transacción activa es NoActiveTransactionError, no auditoría caída.
    const manager = this.unidadDeTrabajo.manager;
    try {
      await manager.createQueryBuilder().insert().into(EventoAuditoriaEntidad).values(filaDesdeAuditoria(fila)).execute();
    } catch (error) {
      this.avisar(MENSAJE_FALLO, {
        tenant_id: fila.tenantId,
        accion: fila.accion,
        entidad_tipo: fila.entidadTipo,
        error: error instanceof Error ? error.name : typeof error,
      });
      throw new AuditoriaNoDisponibleError();
    }
  }
}

/** antes y despues llegan de prepararContenido, que los midió con JSON.stringify; TypeORM los serializa igual en el jsonb. */
function filaDesdeAuditoria(fila: FilaAuditoria): FilaEventoAuditoria {
  return { ...fila, antes: fila.antes as ValorJson | undefined, despues: fila.despues as ValorJson | undefined };
}
