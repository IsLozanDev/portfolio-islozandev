import type { Empresa } from '../../domain/empresa.js';
import type { Sucursal } from '../../domain/sucursal.js';
import type { ProductoCodigo, Suscripcion } from '../../domain/suscripcion.js';
import type { CambioEstadoTenant, Tenant } from '../../domain/tenant.js';
import type { UnidadOperativa } from '../../domain/unidad-operativa.js';

// Todas las operaciones corren dentro de UnitOfWork.run y solo ven el tenant del contexto.
// guardar inserta si el agregado es nuevo y, si no, actualiza con bloqueo optimista por version:
// ConflictError si otro lo cambió desde que se leyó.

export interface RepositorioTenants {
  buscar(id: string): Promise<Tenant | null>;
  guardar(tenant: Tenant): Promise<void>;
  registrarCambioEstado(id: string, tenantId: string, cambio: CambioEstadoTenant, actorId: string | null): Promise<void>;
}

export interface RepositorioSuscripciones {
  buscar(productoCodigo: ProductoCodigo): Promise<Suscripcion | null>;
  listar(): Promise<Suscripcion[]>;
  guardar(suscripcion: Suscripcion): Promise<void>;
}

export interface RepositorioEmpresas {
  buscar(id: string): Promise<Empresa | null>;
  guardar(empresa: Empresa): Promise<void>;
}

export interface RepositorioSucursales {
  buscar(id: string): Promise<Sucursal | null>;
  buscarPrincipal(empresaId: string): Promise<Sucursal | null>;
  /** Activas de todo el tenant: es lo que cuenta contra el tope del plan (TR-RN-006). */
  contarActivas(): Promise<number>;
  guardar(sucursal: Sucursal): Promise<void>;
}

export interface RepositorioUnidades {
  buscar(id: string): Promise<UnidadOperativa | null>;
  guardar(unidad: UnidadOperativa): Promise<void>;
}
