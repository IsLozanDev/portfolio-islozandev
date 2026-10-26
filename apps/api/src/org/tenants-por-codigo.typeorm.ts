import type { DataSource } from 'typeorm';
import type { TenantsPorCodigo } from './alta-tenant.js';

// SQL crudo justificado (regla 11): llamada a la función SECURITY DEFINER org.tenant_por_codigo, que
// el ORM no expresa. Va sin transacción de tenant: busca entre todos.
const CONSULTA = 'SELECT org.tenant_por_codigo($1) AS id';

export class TenantsPorCodigoTypeOrm implements TenantsPorCodigo {
  constructor(private readonly dataSource: DataSource) {}

  async idDe(codigo: string): Promise<string | null> {
    const [{ id }]: { id: string | null }[] = await this.dataSource.query(CONSULTA, [codigo]);
    return id;
  }
}
