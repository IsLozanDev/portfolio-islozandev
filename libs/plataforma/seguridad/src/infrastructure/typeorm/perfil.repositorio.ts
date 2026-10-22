import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RepositorioPerfiles } from '../../application/ports/repositorios.js';
import { Perfil } from '../../domain/perfil.js';
import { RepositorioBase } from './repositorio-base.js';

interface Fila {
  id: string;
  tenant_id: string | null;
  codigo: string;
  nombre: string;
  version: string;
  roles: string[];
}

export class PerfilRepositorioTypeOrm extends RepositorioBase<Perfil> implements RepositorioPerfiles {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants, { ux_perfil_codigo: 'Ya existe un perfil con ese código en el tenant' });
  }

  async buscar(id: string): Promise<Perfil | null> {
    const [fila] = await this.consultar<Fila>(
      `SELECT p.id, p.tenant_id, p.codigo, p.nombre, p.version,
              ARRAY(SELECT pr.rol_id::text FROM seg.perfil_rol pr WHERE pr.perfil_id = p.id ORDER BY 1) AS roles
         FROM seg.perfil p
        WHERE p.id = $2 AND (p.tenant_id IS NULL OR p.tenant_id = $1)`,
      [this.tenantId, id],
    );
    return fila ? this.leido(aDominio(fila)) : null;
  }

  async guardar(perfil: Perfil): Promise<void> {
    const d = perfil.datos;
    await this.persistir(
      perfil,
      async () => {
        await this.consultar('INSERT INTO seg.perfil (id, tenant_id, codigo, nombre, version) VALUES ($1, $2, $3, $4, $5)', [
          perfil.id,
          this.tenantId,
          d.codigo,
          d.nombre,
          perfil.version,
        ]);
      },
      (previa) =>
        this.actualizarFilas('UPDATE seg.perfil SET codigo = $3, nombre = $4, version = $5 WHERE id = $1 AND tenant_id = $2 AND version = $6', [
          perfil.id,
          this.tenantId,
          d.codigo,
          d.nombre,
          perfil.version,
          previa,
        ]),
      async () => {
        await this.consultar('DELETE FROM seg.perfil_rol WHERE perfil_id = $1 AND rol_id <> ALL($2::uuid[])', [perfil.id, perfil.roles]);
        await this.consultar('INSERT INTO seg.perfil_rol (perfil_id, rol_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING', [
          perfil.id,
          perfil.roles,
        ]);
      },
    );
  }
}

function aDominio(f: Fila): Perfil {
  return Perfil.reconstituir(f.id, Number(f.version), { tenantId: f.tenant_id, codigo: f.codigo, nombre: f.nombre, roles: f.roles });
}
