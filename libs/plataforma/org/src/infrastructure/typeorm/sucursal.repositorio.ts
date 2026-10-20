import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RepositorioSucursales } from '../../application/ports/repositorios.js';
import { Sucursal } from '../../domain/sucursal.js';
import { RepositorioBase } from './repositorio-base.js';

interface Fila {
  id: string;
  tenant_id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  codigo_establecimiento_sunat: string | null;
  direccion: string | null;
  ubigeo: string | null;
  telefono: string | null;
  zona_horaria: string;
  es_principal: boolean;
  activo: boolean;
  version: string;
}

export class SucursalRepositorioTypeOrm extends RepositorioBase<Sucursal> implements RepositorioSucursales {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants, {
      sucursal_empresa_id_codigo_key: 'Ya existe una sucursal con ese código en la empresa',
      sucursal_empresa_id_codigo_establecimiento_sunat_key: 'Ya existe una sucursal con ese establecimiento SUNAT en la empresa',
      ux_sucursal_principal: 'La empresa ya tiene una sucursal principal',
    });
  }

  async buscar(id: string): Promise<Sucursal | null> {
    const [fila] = await this.consultar<Fila>('SELECT * FROM org.sucursal WHERE id = $1 AND tenant_id = $2', [id, this.tenantId]);
    return fila ? this.leido(aDominio(fila)) : null;
  }

  async buscarPrincipal(empresaId: string): Promise<Sucursal | null> {
    const [fila] = await this.consultar<Fila>('SELECT * FROM org.sucursal WHERE empresa_id = $1 AND tenant_id = $2 AND es_principal', [
      empresaId,
      this.tenantId,
    ]);
    return fila ? this.leido(aDominio(fila)) : null;
  }

  async contarActivas(): Promise<number> {
    const [{ n }] = await this.consultar<{ n: number }>('SELECT count(*)::int AS n FROM org.sucursal WHERE tenant_id = $1 AND activo', [this.tenantId]);
    return n;
  }

  /** Al trasladar la principal, guardar primero la que la pierde: ux_sucursal_principal no es diferible. */
  async guardar(s: Sucursal): Promise<void> {
    const d = s.datos;
    const params = [
      s.id,
      s.tenantId,
      d.codigo,
      d.nombre,
      d.codigoEstablecimientoSunat,
      d.direccion,
      d.ubigeo,
      d.telefono,
      d.zonaHoraria,
      s.esPrincipal,
      s.activo,
      s.version,
    ];
    await this.persistir(
      s,
      async () => {
        await this.consultar(
          `INSERT INTO org.sucursal (id, tenant_id, codigo, nombre, codigo_establecimiento_sunat, direccion, ubigeo, telefono,
             zona_horaria, es_principal, activo, version, empresa_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [...params, s.empresaId],
        );
      },
      (previa) =>
        this.actualizarFilas(
          `UPDATE org.sucursal
              SET codigo = $3, nombre = $4, codigo_establecimiento_sunat = $5, direccion = $6, ubigeo = $7, telefono = $8,
                  zona_horaria = $9, es_principal = $10, activo = $11, version = $12
            WHERE id = $1 AND tenant_id = $2 AND version = $13`,
          [...params, previa],
        ),
    );
  }
}

function aDominio(f: Fila): Sucursal {
  return Sucursal.reconstituir(f.id, Number(f.version), {
    tenantId: f.tenant_id,
    empresaId: f.empresa_id,
    codigo: f.codigo,
    nombre: f.nombre,
    codigoEstablecimientoSunat: f.codigo_establecimiento_sunat,
    direccion: f.direccion,
    ubigeo: f.ubigeo,
    telefono: f.telefono,
    zonaHoraria: f.zona_horaria,
    esPrincipal: f.es_principal,
    activo: f.activo,
  });
}
