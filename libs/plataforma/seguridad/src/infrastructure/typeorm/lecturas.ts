import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type {
  CatalogoPermisos,
  EstadoMembresia,
  MembresiaLeida,
  MembresiasLectura,
  ProductosContratados,
} from '../../application/ports/repositorios.js';
import type { Alcance } from '../../domain/alcance.js';
import type { PermisoCatalogo } from '../../domain/rol.js';
import { RepositorioBase } from './repositorio-base.js';

// Lecturas sin agregado propio, en la misma transacción que el caso de uso.

export class CatalogoPermisosTypeOrm extends RepositorioBase implements CatalogoPermisos {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants);
  }

  async permisos(codigos: readonly string[]): Promise<PermisoCatalogo[]> {
    const filas = await this.consultar<{ codigo: string; producto_codigo: string; alcance_minimo: Alcance; sensible: boolean; obsoleto: boolean }>(
      'SELECT codigo, producto_codigo, alcance_minimo, sensible, obsoleto FROM seg.permiso WHERE codigo = ANY($1::varchar[])',
      [codigos],
    );
    return filas.map((f) => ({ codigo: f.codigo, productoCodigo: f.producto_codigo, alcanceMinimo: f.alcance_minimo, sensible: f.sensible, obsoleto: f.obsoleto }));
  }

  async sensible(codigo: string): Promise<boolean> {
    const [fila] = await this.consultar<{ sensible: boolean }>('SELECT sensible FROM seg.permiso WHERE codigo = $1', [codigo]);
    return fila?.sensible ?? false;
  }
}

/** Lee org.suscripcion con SQL: seguridad no importa la lib org (decisión del spec 06). */
export class ProductosContratadosTypeOrm extends RepositorioBase implements ProductosContratados {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants);
  }

  async vigentes(): Promise<string[]> {
    const filas = await this.consultar<{ producto_codigo: string }>(
      `SELECT producto_codigo FROM org.suscripcion
        WHERE tenant_id = $1 AND estado IN ('PRUEBA', 'ACTIVA') AND (vigente_hasta IS NULL OR vigente_hasta >= current_date)
        ORDER BY 1`,
      [this.tenantId],
    );
    return filas.map((f) => f.producto_codigo);
  }
}

interface FilaMembresia {
  id: string;
  usuario_id: string;
  estado: EstadoMembresia;
  es_propietario: boolean;
  ultima_sucursal_id: string | null;
}

const SELECT_MEMBRESIA = 'SELECT id, usuario_id, estado, es_propietario, ultima_sucursal_id FROM seg.membresia';

export class MembresiasLecturaTypeOrm extends RepositorioBase implements MembresiasLectura {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants);
  }

  async buscar(membresiaId: string): Promise<MembresiaLeida | null> {
    const [fila] = await this.consultar<FilaMembresia>(`${SELECT_MEMBRESIA} WHERE id = $1 AND tenant_id = $2`, [membresiaId, this.tenantId]);
    return fila ? aMembresia(fila) : null;
  }

  async deUsuario(usuarioId: string): Promise<MembresiaLeida | null> {
    const [fila] = await this.consultar<FilaMembresia>(`${SELECT_MEMBRESIA} WHERE usuario_id = $1 AND tenant_id = $2`, [usuarioId, this.tenantId]);
    return fila ? aMembresia(fila) : null;
  }
}

function aMembresia(f: FilaMembresia): MembresiaLeida {
  return { id: f.id, usuarioId: f.usuario_id, estado: f.estado, esPropietario: f.es_propietario, ultimaSucursalId: f.ultima_sucursal_id };
}
