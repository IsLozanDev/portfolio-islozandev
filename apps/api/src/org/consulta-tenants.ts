import { NotFoundError } from '@vitrina/plataforma/kernel';
import type { CambiarEstadoTenant, EstadoTenant, Listado, Pagina, ProductoCodigo } from '@vitrina/plataforma/org';
import type { Actor, ExigirOperador } from './operador.js';

export interface FiltroTenants extends Pagina {
  q?: string;
  estado?: EstadoTenant;
  producto?: ProductoCodigo;
}

export interface SuscripcionResumen {
  productoCodigo: ProductoCodigo;
  plan: string;
  estado: string;
  /** YYYY-MM-DD o null. */
  vigenteHasta: string | null;
}

/** Solo cabecera y suscripciones: ninguna columna de negocio del cliente (TR-RNF-010). */
export interface TenantListado {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoTenant;
  creadoEn: Date;
  suscripciones: SuscripcionResumen[];
}

export interface CambioDeEstado {
  estadoAnterior: EstadoTenant;
  estadoNuevo: EstadoTenant;
  motivo: string;
  fechaEfectiva: string;
  actorId: string | null;
  registradoEn: string;
}

export interface TenantDetalle extends TenantListado {
  estadoMotivo: string | null;
  estadoCambiadoEn: Date | null;
  version: number;
  empresaPrincipal: { id: string; ruc: string; razonSocial: string } | null;
  /** Del más reciente al más antiguo. */
  historial: CambioDeEstado[];
}

/** Lectura entre tenants por org.tenants_listar y org.tenant_detalle (SECURITY DEFINER). */
export interface ConsultaTenants {
  listar(filtro: FiltroTenants): Promise<Listado<TenantListado>>;
  detalle(tenantId: string): Promise<TenantDetalle | null>;
}

export interface CambiarEstadoComando {
  tenantId: string;
  estado: EstadoTenant;
  motivo: string;
}

export interface DependenciasConsola {
  exigirOperador: Pick<ExigirOperador, 'ejecutar'>;
  consulta: ConsultaTenants;
  cambiarEstadoTenant: Pick<CambiarEstadoTenant, 'ejecutar'>;
}

/**
 * Consola del operador (TR-RF-001 y 006). Cada operación comprueba primero que el actor sea del
 * tenant operador: ninguna lectura entre tenants corre antes.
 */
export class ConsolaTenants {
  constructor(private readonly dependencias: DependenciasConsola) {}

  async listar(actor: Actor, filtro: FiltroTenants): Promise<Listado<TenantListado>> {
    await this.dependencias.exigirOperador.ejecutar(actor);
    return this.dependencias.consulta.listar(filtro);
  }

  async detalle(actor: Actor, tenantId: string): Promise<TenantDetalle> {
    await this.dependencias.exigirOperador.ejecutar(actor);
    const detalle = await this.dependencias.consulta.detalle(tenantId);
    if (!detalle) throw new NotFoundError('El tenant no existe');
    return detalle;
  }

  /** `cambiado: false` si ya estaba en ese estado: no deja historial (spec 03). */
  async cambiarEstado(actor: Actor, comando: CambiarEstadoComando): Promise<{ cambiado: boolean; estado: EstadoTenant }> {
    await this.dependencias.exigirOperador.ejecutar(actor);
    const { cambiado } = await this.dependencias.cambiarEstadoTenant.ejecutar({
      tenantId: comando.tenantId,
      estadoNuevo: comando.estado,
      motivo: comando.motivo,
      actorId: actor.usuarioId,
    });
    return { cambiado, estado: comando.estado };
  }
}
