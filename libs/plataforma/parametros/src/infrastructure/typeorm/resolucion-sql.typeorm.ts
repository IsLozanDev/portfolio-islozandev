import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { ResolucionSql, ValorEfectivo, VersionesParametros } from '../../application/ports/repositorios.js';
import type { OrigenValor } from '../../domain/tipos.js';

/** SQL crudo permitido (regla 11): la herencia vive en la función cfg.valor, que el ORM no expresa. */
export class ResolucionSqlTypeOrm implements ResolucionSql {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async valor(codigo: string, tenantId: string, empresaId: string | null, sucursalId: string | null): Promise<ValorEfectivo | null> {
    const [fila]: { valor: unknown; origen: OrigenValor }[] = await this.unidadDeTrabajo.manager.query(
      'SELECT valor, origen FROM cfg.valor($1, $2, $3, $4)',
      [codigo, tenantId, empresaId, sucursalId],
    );
    return fila ?? null;
  }

  async versiones(tenantId: string): Promise<VersionesParametros> {
    // bigint: node-pg lo devuelve como texto. Sin fila (otro tenant en el contexto) no hay versión que usar.
    const [fila]: { vt: string; vd: string }[] = await this.unidadDeTrabajo.manager.query('SELECT vt, vd FROM cfg.versiones($1)', [tenantId]);
    return { vt: Number(fila?.vt ?? 0), vd: Number(fila?.vd ?? 0) };
  }
}
