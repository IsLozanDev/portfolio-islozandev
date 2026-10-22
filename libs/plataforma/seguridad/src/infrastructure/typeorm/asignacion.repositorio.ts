import { NotFoundError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { BitacoraSeguridad, RepositorioAsignaciones, TipoEventoSeguridad, UbicacionesOrg } from '../../application/ports/repositorios.js';
import type { Alcance, Ambito } from '../../domain/alcance.js';
import { Asignacion, type Fecha } from '../../domain/asignacion.js';
import { RepositorioBase } from './repositorio-base.js';

interface Fila {
  id: string;
  tenant_id: string;
  membresia_id: string;
  rol_id: string | null;
  perfil_id: string | null;
  alcance: Alcance;
  empresa_id: string | null;
  sucursal_id: string | null;
  unidad_id: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  otorgado_por: string | null;
  version: string;
}

// to_char: el driver convierte `date` en Date con la zona del proceso y corre el día.
const SELECT = `
  SELECT id, tenant_id, membresia_id, rol_id, perfil_id, alcance, empresa_id, sucursal_id, unidad_id,
         to_char(vigente_desde, 'YYYY-MM-DD') AS vigente_desde, to_char(vigente_hasta, 'YYYY-MM-DD') AS vigente_hasta,
         otorgado_por, version
    FROM seg.asignacion`;

export class AsignacionRepositorioTypeOrm extends RepositorioBase<Asignacion> implements RepositorioAsignaciones {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants);
  }

  async vigentesDe(membresiaId: string, hoy: Fecha): Promise<Asignacion[]> {
    const filas = await this.consultar<Fila>(
      `${SELECT} WHERE tenant_id = $1 AND membresia_id = $2
          AND $3::date BETWEEN vigente_desde AND COALESCE(vigente_hasta, 'infinity'::date)`,
      [this.tenantId, membresiaId, hoy],
    );
    return filas.map((f) => this.leido(aDominio(f)));
  }

  /** En este spec las asignaciones solo se otorgan; editar y revocar son del spec 08. */
  async guardar(a: Asignacion): Promise<void> {
    const u = a.ubicacion;
    await this.persistir(
      a,
      async () => {
        await this.consultar(
          `INSERT INTO seg.asignacion (id, tenant_id, membresia_id, rol_id, perfil_id, alcance, empresa_id, sucursal_id, unidad_id,
             vigente_desde, vigente_hasta, otorgado_por, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [a.id, this.tenantId, a.membresiaId, a.rolId, a.perfilId, u.alcance, u.empresaId, u.sucursalId, u.unidadId, a.vigenteDesde, a.vigenteHasta, a.otorgadoPor, a.version],
        );
      },
      (previa) =>
        this.actualizarFilas(
          'UPDATE seg.asignacion SET vigente_hasta = $3, version = $4 WHERE id = $1 AND tenant_id = $2 AND version = $5',
          [a.id, this.tenantId, a.vigenteHasta, a.version, previa],
        ),
    );
  }
}

function aDominio(f: Fila): Asignacion {
  return Asignacion.reconstituir(f.id, Number(f.version), {
    tenantId: f.tenant_id,
    membresiaId: f.membresia_id,
    rolId: f.rol_id,
    perfilId: f.perfil_id,
    alcance: f.alcance,
    empresaId: f.empresa_id,
    sucursalId: f.sucursal_id,
    unidadId: f.unidad_id,
    vigenteDesde: f.vigente_desde,
    vigenteHasta: f.vigente_hasta,
    otorgadoPor: f.otorgado_por,
  });
}

/** Lee org con SQL en la misma transacción: seguridad no importa la lib org. */
export class UbicacionesOrgTypeOrm extends RepositorioBase implements UbicacionesOrg {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants);
  }

  async resolver(ambito: Ambito): Promise<Ambito> {
    switch (ambito.alcance) {
      case 'TENANT':
        return { alcance: 'TENANT', empresaId: null, sucursalId: null, unidadId: null };
      case 'EMPRESA': {
        const [f] = await this.consultar<{ id: string }>('SELECT id FROM org.empresa WHERE id = $1 AND tenant_id = $2', [ambito.empresaId, this.tenantId]);
        if (!f) throw new NotFoundError('La empresa no existe');
        return { alcance: 'EMPRESA', empresaId: f.id, sucursalId: null, unidadId: null };
      }
      case 'SUCURSAL': {
        const [f] = await this.consultar<{ empresa_id: string }>('SELECT empresa_id FROM org.sucursal WHERE id = $1 AND tenant_id = $2', [
          ambito.sucursalId,
          this.tenantId,
        ]);
        if (!f) throw new NotFoundError('La sucursal no existe');
        return { alcance: 'SUCURSAL', empresaId: f.empresa_id, sucursalId: ambito.sucursalId, unidadId: null };
      }
      case 'UNIDAD': {
        const [f] = await this.consultar<{ empresa_id: string; sucursal_id: string | null }>(
          'SELECT empresa_id, sucursal_id FROM org.unidad_operativa WHERE id = $1 AND tenant_id = $2',
          [ambito.unidadId, this.tenantId],
        );
        if (!f) throw new NotFoundError('La unidad no existe');
        return { alcance: 'UNIDAD', empresaId: f.empresa_id, sucursalId: f.sucursal_id, unidadId: ambito.unidadId };
      }
    }
  }
}

export class BitacoraSeguridadTypeOrm extends RepositorioBase implements BitacoraSeguridad {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants);
  }

  async registrar(tipo: TipoEventoSeguridad, usuarioId: string, detalle: Record<string, unknown>): Promise<void> {
    await this.consultar('INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo, detalle) VALUES ($1, $2, $3, $4::jsonb)', [
      this.tenantId,
      usuarioId,
      tipo,
      JSON.stringify(detalle),
    ]);
  }
}
