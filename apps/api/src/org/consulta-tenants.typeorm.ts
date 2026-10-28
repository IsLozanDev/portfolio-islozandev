import type { EstadoTenant, Listado, ProductoCodigo } from '@vitrina/plataforma/org';
import type { DataSource } from 'typeorm';
import type { CambioDeEstado, ConsultaTenants, FiltroTenants, SuscripcionResumen, TenantDetalle, TenantListado } from './consulta-tenants.js';

// SQL crudo justificado (regla 11): llamadas a las funciones SECURITY DEFINER de db/01a_org_consola.sql,
// que el ORM no expresa. Van sin transacción de tenant: leen entre todos.
const LISTAR = 'SELECT * FROM org.tenants_listar($1, $2, $3, $4, $5)';
const DETALLE = 'SELECT * FROM org.tenant_detalle($1)';

interface SuscripcionJson {
  producto_codigo: ProductoCodigo;
  plan: string;
  estado: string;
  vigente_hasta: string | null;
}

interface CambioJson {
  estado_anterior: EstadoTenant;
  estado_nuevo: EstadoTenant;
  motivo: string;
  fecha_efectiva: string;
  actor_id: string | null;
  registrado_en: string;
}

interface FilaListado {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoTenant;
  creado_en: Date;
  suscripciones: SuscripcionJson[];
  /** bigint: node-pg lo devuelve como string. */
  total: string;
}

interface FilaDetalle extends Omit<FilaListado, 'total'> {
  estado_motivo: string | null;
  estado_cambiado_en: Date | null;
  version: string;
  empresa_principal: { id: string; ruc: string; razon_social: string } | null;
  historial: CambioJson[];
}

export class ConsultaTenantsTypeOrm implements ConsultaTenants {
  constructor(private readonly dataSource: DataSource) {}

  async listar(filtro: FiltroTenants): Promise<Listado<TenantListado>> {
    const filas = await this.pagina(filtro, filtro.tamano, (filtro.pagina - 1) * filtro.tamano);
    return { items: filas.map(tenantListado), total: await this.total(filtro, filas) };
  }

  private pagina(filtro: FiltroTenants, limite: number, desplazamiento: number): Promise<FilaListado[]> {
    return this.dataSource.query(LISTAR, [filtro.q ?? null, filtro.estado ?? null, filtro.producto ?? null, limite, desplazamiento]);
  }

  /** `count(*) OVER ()` viaja en cada fila: una página pasada del final no trae ninguna y se pregunta por la primera. */
  private async total(filtro: FiltroTenants, filas: FilaListado[]): Promise<number> {
    if (filas.length > 0) return Number(filas[0].total);
    if (filtro.pagina === 1) return 0;
    const [primera] = await this.pagina(filtro, 1, 0);
    return primera ? Number(primera.total) : 0;
  }

  async detalle(tenantId: string): Promise<TenantDetalle | null> {
    const [fila]: FilaDetalle[] = await this.dataSource.query(DETALLE, [tenantId]);
    if (!fila) return null;
    return {
      ...tenantListado(fila),
      estadoMotivo: fila.estado_motivo,
      estadoCambiadoEn: fila.estado_cambiado_en,
      version: Number(fila.version),
      empresaPrincipal: fila.empresa_principal && {
        id: fila.empresa_principal.id,
        ruc: fila.empresa_principal.ruc,
        razonSocial: fila.empresa_principal.razon_social,
      },
      historial: fila.historial.map(cambioDeEstado),
    };
  }
}

function tenantListado(fila: Omit<FilaListado, 'total'>): TenantListado {
  return { id: fila.id, codigo: fila.codigo, nombre: fila.nombre, estado: fila.estado, creadoEn: fila.creado_en, suscripciones: fila.suscripciones.map(suscripcionResumen) };
}

function suscripcionResumen(suscripcion: SuscripcionJson): SuscripcionResumen {
  return { productoCodigo: suscripcion.producto_codigo, plan: suscripcion.plan, estado: suscripcion.estado, vigenteHasta: suscripcion.vigente_hasta };
}

function cambioDeEstado(cambio: CambioJson): CambioDeEstado {
  return {
    estadoAnterior: cambio.estado_anterior,
    estadoNuevo: cambio.estado_nuevo,
    motivo: cambio.motivo,
    fechaEfectiva: cambio.fecha_efectiva,
    actorId: cambio.actor_id,
    registradoEn: cambio.registrado_en,
  };
}
