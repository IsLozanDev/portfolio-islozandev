import type { TenantsPorReenvolver } from '../../application/ports/tenants-por-reenvolver.js';

// SQL crudo (regla 11): función SECURITY DEFINER que lee las claves de todos los tenants sin depender de
// app.tenant_id. El ORM no llama funciones que devuelven filas.
const TENANTS_POR_REENVOLVER = 'SELECT tenant_id FROM sec.tenants_por_reenvolver($1::smallint, $2::integer)';

/** Lo único que usa del DataSource. */
export interface EjecutorSql {
  query(consulta: string, parametros: unknown[]): Promise<unknown>;
}

interface FilaTenantPorReenvolver {
  tenant_id: string;
}

/** Fuera de toda transacción: la re-envoltura abre después una por tenant, con su contexto. */
export class TenantsPorReenvolverSql implements TenantsPorReenvolver {
  constructor(private readonly dataSource: EjecutorSql) {}

  async listar(versionActiva: number, limite: number): Promise<string[]> {
    const filas = (await this.dataSource.query(TENANTS_POR_REENVOLVER, [versionActiva, limite])) as FilaTenantPorReenvolver[];
    return filas.map((fila) => fila.tenant_id);
  }
}
