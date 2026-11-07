import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { LecturaItems, Versiones } from '../../application/ports/repositorios.js';

// SQL crudo (regla 11): funciones de base de datos con la RLS del tenant.
const VERSIONES = 'SELECT catalogo_id, version_global, version_tenant FROM cat.versiones($1, $2)';

interface FilaVersiones {
  catalogo_id: string;
  /** bigint: node-pg lo devuelve como string. */
  version_global: string;
  version_tenant: string;
}

export class LecturaItemsTypeOrm implements LecturaItems {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async versiones(codigo: string, tenantId: string): Promise<Versiones | null> {
    const [fila]: FilaVersiones[] = await this.unidadDeTrabajo.manager.query(VERSIONES, [codigo, tenantId]);
    if (!fila) return null;
    return { catalogoId: fila.catalogo_id, versionGlobal: Number(fila.version_global), versionTenant: Number(fila.version_tenant) };
  }
}
