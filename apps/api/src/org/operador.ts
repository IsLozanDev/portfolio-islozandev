import { ForbiddenError, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import type { RepositorioTenants } from '@vitrina/plataforma/org';
import type { Principal } from '@vitrina/plataforma/seguridad';

export class OperadorRequeridoError extends ForbiddenError {
  override readonly code = 'OPERADOR_REQUERIDO';

  constructor() {
    super('Solo el tenant operador puede administrar tenants');
  }
}

export interface Actor {
  usuarioId: string;
  tenantId: string;
}

export function actorDe(principal: Principal): Actor {
  return { usuarioId: principal.usuarioId, tenantId: principal.tenantId ?? '' };
}

export interface DependenciasOperador {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  tenants: Pick<RepositorioTenants, 'buscar'>;
  /** Código del tenant operador (ORG_TENANT_OPERADOR). */
  tenantOperador: string;
}

/**
 * El permiso no basta para administrar tenants: los roles predefinidos son globales y un propietario
 * de cliente puede asignarse PLAT_ADMIN_TENANTS. El actor debe estar en el tenant operador (spec 12).
 */
export class ExigirOperador {
  constructor(private readonly dependencias: DependenciasOperador) {}

  async ejecutar(actor: Pick<Actor, 'tenantId'>): Promise<void> {
    const { contexto, unidadDeTrabajo, tenants, tenantOperador } = this.dependencias;
    const tenantDelActor = await contexto.run({ tenantId: actor.tenantId }, () => unidadDeTrabajo.run(() => tenants.buscar(actor.tenantId)));
    if (tenantDelActor?.codigo !== tenantOperador) throw new OperadorRequeridoError();
  }
}
