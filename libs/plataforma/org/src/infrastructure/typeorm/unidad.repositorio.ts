import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RepositorioUnidades } from '../../application/ports/repositorios.js';
import { UnidadOperativa, type Atributos, type TipoUnidad } from '../../domain/unidad-operativa.js';
import { RepositorioBase } from './repositorio-base.js';

interface Fila {
  id: string;
  tenant_id: string;
  empresa_id: string;
  sucursal_id: string | null;
  tipo: TipoUnidad;
  codigo: string;
  nombre: string;
  padre_id: string | null;
  atributos: Atributos;
  activo: boolean;
  version: string;
}

export class UnidadRepositorioTypeOrm extends RepositorioBase<UnidadOperativa> implements RepositorioUnidades {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants, { unidad_operativa_empresa_id_tipo_codigo_key: 'Ya existe una unidad de ese tipo con ese código en la empresa' });
  }

  async buscar(id: string): Promise<UnidadOperativa | null> {
    const [fila] = await this.consultar<Fila>('SELECT * FROM org.unidad_operativa WHERE id = $1 AND tenant_id = $2', [id, this.tenantId]);
    return fila ? this.leido(aDominio(fila)) : null;
  }

  async guardar(u: UnidadOperativa): Promise<void> {
    const d = u.datos;
    const params = [u.id, u.tenantId, d.codigo, d.nombre, u.padreId, JSON.stringify(d.atributos), u.activo, u.version];
    await this.persistir(
      u,
      async () => {
        await this.consultar(
          `INSERT INTO org.unidad_operativa (id, tenant_id, codigo, nombre, padre_id, atributos, activo, version, empresa_id, sucursal_id, tipo)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)`,
          [...params, u.empresaId, u.sucursalId, u.tipo],
        );
      },
      (previa) =>
        this.actualizarFilas(
          `UPDATE org.unidad_operativa
              SET codigo = $3, nombre = $4, padre_id = $5, atributos = $6::jsonb, activo = $7, version = $8
            WHERE id = $1 AND tenant_id = $2 AND version = $9`,
          [...params, previa],
        ),
    );
  }
}

function aDominio(f: Fila): UnidadOperativa {
  return UnidadOperativa.reconstituir(f.id, Number(f.version), {
    tenantId: f.tenant_id,
    empresaId: f.empresa_id,
    sucursalId: f.sucursal_id,
    tipo: f.tipo,
    codigo: f.codigo,
    nombre: f.nombre,
    padreId: f.padre_id,
    atributos: f.atributos,
    activo: f.activo,
  });
}
