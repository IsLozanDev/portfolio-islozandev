import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RepositorioTenants } from '../../application/ports/repositorios.js';
import { Tenant, type CambioEstadoTenant, type EstadoTenant } from '../../domain/tenant.js';
import { RepositorioBase } from './repositorio-base.js';

interface Fila {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoTenant;
  estado_motivo: string | null;
  estado_cambiado_en: Date | null;
  baja_en: Date | null;
  version: string;
}

export class TenantRepositorioTypeOrm extends RepositorioBase<Tenant> implements RepositorioTenants {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    // RLS oculta los códigos de otros tenants: el duplicado solo se detecta por la restricción.
    super(uow, tenants, { tenant_codigo_key: 'El código de tenant ya existe' });
  }

  async buscar(id: string): Promise<Tenant | null> {
    if (id !== this.tenantId) return null;
    const [fila] = await this.consultar<Fila>('SELECT * FROM org.tenant WHERE id = $1', [id]);
    return fila ? this.leido(aDominio(fila)) : null;
  }

  async guardar(t: Tenant): Promise<void> {
    const params = [t.id, t.nombre, t.estado, t.estadoMotivo, t.estadoCambiadoEn, t.bajaEn, t.version];
    await this.persistir(
      t,
      async () => {
        await this.consultar(
          `INSERT INTO org.tenant (id, nombre, estado, estado_motivo, estado_cambiado_en, baja_en, version, codigo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [...params, t.codigo],
        );
      },
      (previa) =>
        this.actualizarFilas(
          `UPDATE org.tenant SET nombre = $2, estado = $3, estado_motivo = $4, estado_cambiado_en = $5, baja_en = $6, version = $7
            WHERE id = $1 AND version = $8`,
          [...params, previa],
        ),
    );
  }

  async registrarCambioEstado(id: string, tenantId: string, cambio: CambioEstadoTenant, actorId: string | null): Promise<void> {
    await this.consultar(
      `INSERT INTO org.tenant_estado_historial (id, tenant_id, estado_anterior, estado_nuevo, motivo, fecha_efectiva, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, tenantId, cambio.estadoAnterior, cambio.estadoNuevo, cambio.motivo, cambio.fechaEfectiva, actorId],
    );
  }
}

function aDominio(f: Fila): Tenant {
  return Tenant.reconstituir(f.id, Number(f.version), {
    codigo: f.codigo,
    nombre: f.nombre,
    estado: f.estado,
    estadoMotivo: f.estado_motivo,
    estadoCambiadoEn: f.estado_cambiado_en,
    bajaEn: f.baja_en,
  });
}
