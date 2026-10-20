import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RepositorioSuscripciones } from '../../application/ports/repositorios.js';
import { Suscripcion, type EstadoSuscripcion, type Plan, type ProductoCodigo } from '../../domain/suscripcion.js';
import { RepositorioBase } from './repositorio-base.js';

interface Fila {
  id: string;
  tenant_id: string;
  producto_codigo: ProductoCodigo;
  edicion: string | null;
  plan: Plan;
  estado: EstadoSuscripcion;
  limite_sucursales: number | null;
  limite_usuarios: number | null;
  vigente_hasta: string | null;
  version: string;
}

// vigente_hasta como texto: pg convierte `date` a Date en la zona local y corre el día.
const COLUMNAS = `id, tenant_id, producto_codigo, edicion, plan, estado, limite_sucursales, limite_usuarios,
  vigente_hasta::text AS vigente_hasta, version`;

export class SuscripcionRepositorioTypeOrm extends RepositorioBase<Suscripcion> implements RepositorioSuscripciones {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants, { suscripcion_tenant_id_producto_codigo_key: 'El tenant ya tiene una suscripción a este producto' });
  }

  async buscar(productoCodigo: ProductoCodigo): Promise<Suscripcion | null> {
    const [fila] = await this.consultar<Fila>(`SELECT ${COLUMNAS} FROM org.suscripcion WHERE tenant_id = $1 AND producto_codigo = $2`, [
      this.tenantId,
      productoCodigo,
    ]);
    return fila ? this.leido(aDominio(fila)) : null;
  }

  async listar(): Promise<Suscripcion[]> {
    const filas = await this.consultar<Fila>(`SELECT ${COLUMNAS} FROM org.suscripcion WHERE tenant_id = $1 ORDER BY producto_codigo`, [this.tenantId]);
    return filas.map((f) => this.leido(aDominio(f)));
  }

  async guardar(s: Suscripcion): Promise<void> {
    const d = s.datos;
    const params = [s.id, s.tenantId, d.edicion, d.plan, d.estado, d.limiteSucursales, d.limiteUsuarios, d.vigenteHasta, s.version];
    await this.persistir(
      s,
      async () => {
        await this.consultar(
          `INSERT INTO org.suscripcion
             (id, tenant_id, edicion, plan, estado, limite_sucursales, limite_usuarios, vigente_hasta, version, producto_codigo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [...params, s.productoCodigo],
        );
      },
      (previa) =>
        this.actualizarFilas(
          `UPDATE org.suscripcion
              SET edicion = $3, plan = $4, estado = $5, limite_sucursales = $6, limite_usuarios = $7, vigente_hasta = $8, version = $9
            WHERE id = $1 AND tenant_id = $2 AND version = $10`,
          [...params, previa],
        ),
    );
  }
}

function aDominio(f: Fila): Suscripcion {
  return Suscripcion.reconstituir(f.id, Number(f.version), {
    tenantId: f.tenant_id,
    productoCodigo: f.producto_codigo,
    edicion: f.edicion,
    plan: f.plan,
    estado: f.estado,
    limiteSucursales: f.limite_sucursales,
    limiteUsuarios: f.limite_usuarios,
    vigenteHasta: f.vigente_hasta,
  });
}
