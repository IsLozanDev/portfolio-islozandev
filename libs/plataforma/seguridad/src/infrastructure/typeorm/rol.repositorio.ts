import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RepositorioRoles } from '../../application/ports/repositorios.js';
import { Rol } from '../../domain/rol.js';
import { RepositorioBase } from './repositorio-base.js';

interface Fila {
  id: string;
  tenant_id: string | null;
  producto_codigo: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  obsoleto: boolean;
  version: string;
  permisos: string[];
}

const SELECT = `
  SELECT r.id, r.tenant_id, r.producto_codigo, r.codigo, r.nombre, r.activo, r.obsoleto, r.version,
         ARRAY(SELECT rp.permiso_codigo::text FROM seg.rol_permiso rp WHERE rp.rol_id = r.id ORDER BY 1) AS permisos
    FROM seg.rol r`;
const VISIBLE = '(r.tenant_id IS NULL OR r.tenant_id = $1)';

export class RolRepositorioTypeOrm extends RepositorioBase<Rol> implements RepositorioRoles {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants, { ux_rol_codigo: 'Ya existe un rol con ese código en el tenant' });
  }

  async buscar(id: string): Promise<Rol | null> {
    const [fila] = await this.consultar<Fila>(`${SELECT} WHERE r.id = $2 AND ${VISIBLE}`, [this.tenantId, id]);
    return fila ? this.leido(aDominio(fila)) : null;
  }

  async buscarPorCodigo(codigo: string): Promise<Rol | null> {
    const [fila] = await this.consultar<Fila>(`${SELECT} WHERE r.codigo = $2 AND ${VISIBLE} ORDER BY r.tenant_id NULLS LAST LIMIT 1`, [
      this.tenantId,
      codigo,
    ]);
    return fila ? this.leido(aDominio(fila)) : null;
  }

  async buscarVarios(ids: readonly string[]): Promise<Rol[]> {
    const filas = await this.consultar<Fila>(`${SELECT} WHERE r.id = ANY($2::uuid[]) AND ${VISIBLE}`, [this.tenantId, ids]);
    return filas.map((f) => this.leido(aDominio(f)));
  }

  async contarMembresiasAfectadas(rolId: string): Promise<number> {
    const [{ n }] = await this.consultar<{ n: number }>(
      `SELECT count(DISTINCT a.membresia_id)::int AS n
         FROM seg.asignacion a
        WHERE a.tenant_id = $1
          AND current_date BETWEEN a.vigente_desde AND COALESCE(a.vigente_hasta, 'infinity'::date)
          AND (a.rol_id = $2 OR a.perfil_id IN (SELECT pr.perfil_id FROM seg.perfil_rol pr WHERE pr.rol_id = $2))`,
      [this.tenantId, rolId],
    );
    return n;
  }

  /** Solo roles del tenant: los predefinidos los escribe el manifiesto. */
  async guardar(rol: Rol): Promise<void> {
    const d = rol.datos;
    await this.persistir(
      rol,
      async () => {
        await this.consultar(
          `INSERT INTO seg.rol (id, tenant_id, producto_codigo, codigo, nombre, editable, activo, version)
           VALUES ($1, $2, $3, $4, $5, true, $6, $7)`,
          [rol.id, this.tenantId, rol.productoCodigo, d.codigo, d.nombre, rol.activo, rol.version],
        );
      },
      (previa) =>
        this.actualizarFilas(
          `UPDATE seg.rol SET codigo = $3, nombre = $4, activo = $5, version = $6
            WHERE id = $1 AND tenant_id = $2 AND version = $7`,
          [rol.id, this.tenantId, d.codigo, d.nombre, rol.activo, rol.version, previa],
        ),
      async () => {
        await this.consultar('DELETE FROM seg.rol_permiso WHERE rol_id = $1 AND permiso_codigo <> ALL($2::varchar[])', [rol.id, rol.permisos]);
        await this.consultar(
          `INSERT INTO seg.rol_permiso (rol_id, permiso_codigo)
           SELECT $1, unnest($2::varchar[]) ON CONFLICT DO NOTHING`,
          [rol.id, rol.permisos],
        );
      },
    );
  }
}

function aDominio(f: Fila): Rol {
  return Rol.reconstituir(f.id, Number(f.version), {
    tenantId: f.tenant_id,
    productoCodigo: f.producto_codigo,
    codigo: f.codigo,
    nombre: f.nombre,
    activo: f.activo,
    obsoleto: f.obsoleto,
    permisos: f.permisos,
  });
}
