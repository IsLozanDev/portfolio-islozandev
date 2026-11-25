import type { LocalizadorProgramaciones, ProgramacionAtrasada } from '../../application/ports/repositorios.js';
import type { EjecutorSql } from './mensaje-por-id-externo.sql.js';

// SQL crudo (regla 11): función SECURITY DEFINER que lee las atrasadas de todos los tenants sin depender de
// app.tenant_id. El ORM no llama funciones que devuelven filas.
const PROGRAMACIONES_ATRASADAS = 'SELECT id, tenant_id, version FROM ntf.programaciones_atrasadas($1::timestamptz, $2::integer)';

interface FilaAtrasada {
  id: string;
  tenant_id: string;
  version: number;
}

/** Fuera de toda transacción: el barrido no tiene tenant; la ejecución abre una con el contexto de cada programación. */
export class ProgramacionesAtrasadasSql implements LocalizadorProgramaciones {
  constructor(private readonly dataSource: EjecutorSql) {}

  async atrasadas(antes: Date, limite: number): Promise<ProgramacionAtrasada[]> {
    const filas = (await this.dataSource.query(PROGRAMACIONES_ATRASADAS, [antes.toISOString(), limite])) as FilaAtrasada[];
    return filas.map((fila) => ({ programacionId: fila.id, tenantId: fila.tenant_id, version: fila.version }));
  }
}
