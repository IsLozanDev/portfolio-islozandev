import type { EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { Tenant } from '../domain/tenant.js';
import type { RepositorioTenants } from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

export interface CrearTenantComando {
  /** El alta (spec 12) lo genera antes para abrir la transacción en el contexto del tenant nuevo. */
  id?: string;
  codigo: string;
  nombre: string;
  estado: 'PRUEBA' | 'ACTIVO';
}

/**
 * Alta mínima: el alta completa con siembra y propietario la orquesta `apps/api` (spec 12).
 * Corre en el contexto del tenant nuevo porque la RLS de org.tenant es por id.
 */
export class CrearTenant {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly eventos: EventPublisher,
    private readonly tenants: RepositorioTenants,
  ) {}

  async ejecutar(comando: CrearTenantComando): Promise<{ tenantId: string }> {
    const { id = this.ids.next(), ...datos } = comando;
    const tenant = Tenant.crear({ id, ...datos });
    await this.contexto.run({ tenantId: tenant.id }, () =>
      this.uow.run(async () => {
        await this.tenants.guardar(tenant);
        await publicarEventos(this.eventos, tenant);
      }),
    );
    return { tenantId: tenant.id };
  }
}
