import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RepositorioEmpresas } from '../../application/ports/repositorios.js';
import { Empresa } from '../../domain/empresa.js';
import { RepositorioBase } from './repositorio-base.js';

interface Fila {
  id: string;
  tenant_id: string;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  direccion_fiscal: string | null;
  ubigeo: string | null;
  telefono: string | null;
  correo: string | null;
  sitio_web: string | null;
  logo_archivo_id: string | null;
  activo: boolean;
  version: string;
}

export class EmpresaRepositorioTypeOrm extends RepositorioBase<Empresa> implements RepositorioEmpresas {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants, { empresa_tenant_id_ruc_key: 'La empresa ya está registrada en este tenant' });
  }

  async buscar(id: string): Promise<Empresa | null> {
    const [fila] = await this.consultar<Fila>('SELECT * FROM org.empresa WHERE id = $1 AND tenant_id = $2', [id, this.tenantId]);
    return fila ? this.leido(aDominio(fila)) : null;
  }

  async guardar(e: Empresa): Promise<void> {
    const d = e.datos;
    const params = [
      e.id,
      e.tenantId,
      d.razonSocial,
      d.nombreComercial,
      d.direccionFiscal,
      d.ubigeo,
      e.activo,
      e.version,
      d.telefono,
      d.correo,
      d.sitioWeb,
      e.logoArchivoId,
    ];
    await this.persistir(
      e,
      async () => {
        await this.consultar(
          `INSERT INTO org.empresa (id, tenant_id, razon_social, nombre_comercial, direccion_fiscal, ubigeo, activo, version,
                                    telefono, correo, sitio_web, logo_archivo_id, ruc)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [...params, e.ruc],
        );
      },
      (previa) =>
        this.actualizarFilas(
          `UPDATE org.empresa
              SET razon_social = $3, nombre_comercial = $4, direccion_fiscal = $5, ubigeo = $6, activo = $7, version = $8,
                  telefono = $9, correo = $10, sitio_web = $11, logo_archivo_id = $12
            WHERE id = $1 AND tenant_id = $2 AND version = $13`,
          [...params, previa],
        ),
    );
  }
}

function aDominio(f: Fila): Empresa {
  return Empresa.reconstituir(f.id, Number(f.version), {
    tenantId: f.tenant_id,
    ruc: f.ruc,
    razonSocial: f.razon_social,
    nombreComercial: f.nombre_comercial,
    direccionFiscal: f.direccion_fiscal,
    ubigeo: f.ubigeo,
    telefono: f.telefono,
    correo: f.correo,
    sitioWeb: f.sitio_web,
    logoArchivoId: f.logo_archivo_id,
    activo: f.activo,
  });
}
