import type { DataSource } from 'typeorm';
import type { CodigosDeTenant } from './alta-tenant.js';

// SQL crudo justificado (regla 11): llamada a la función SECURITY DEFINER org.codigo_tenant_existe, que
// el ORM no expresa. Va sin transacción de tenant: pregunta por todos.
const CONSULTA = 'SELECT org.codigo_tenant_existe($1) AS existe';

export class CodigosDeTenantTypeOrm implements CodigosDeTenant {
  constructor(private readonly dataSource: DataSource) {}

  async existe(codigo: string): Promise<boolean> {
    const [{ existe }]: { existe: boolean }[] = await this.dataSource.query(CONSULTA, [codigo]);
    return existe;
  }
}
