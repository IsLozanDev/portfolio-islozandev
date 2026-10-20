import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { Suscripcion, type DatosSuscripcion, type ProductoCodigo } from '../domain/suscripcion.js';
import type { EstadoTenant } from '../domain/tenant.js';
import { buscarTenant } from './comunes.js';
import type { RepositorioSucursales, RepositorioSuscripciones, RepositorioTenants } from './ports/repositorios.js';
import type { UsoUsuariosPort } from './ports/uso-usuarios.port.js';
import { publicarEventos } from './publicar-eventos.js';

// Los dos los usa el administrador de plataforma (APP-01) sobre un tenant que no es el suyo:
// el comando trae el tenant y el caso de uso lo pone en el contexto, como CrearTenant.

export interface GestionarSuscripcionComando extends DatosSuscripcion {
  tenantId: string;
  productoCodigo: ProductoCodigo;
}

export interface CambiarEstadoTenantComando {
  tenantId: string;
  estadoNuevo: EstadoTenant;
  motivo: string;
  /** Por defecto, ahora. */
  fechaEfectiva?: Date;
  actorId?: string | null;
}

/** TR-RF-005: crea la suscripción del producto o cambia la existente. */
export class GestionarSuscripcion {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly eventos: EventPublisher,
    private readonly repos: { tenants: RepositorioTenants; suscripciones: RepositorioSuscripciones; sucursales: RepositorioSucursales },
    private readonly usoUsuarios: UsoUsuariosPort,
  ) {}

  ejecutar({ tenantId, productoCodigo, ...datos }: GestionarSuscripcionComando): Promise<{ suscripcionId: string; nueva: boolean }> {
    return this.contexto.run({ tenantId }, () =>
      this.uow.run(async () => {
        (await buscarTenant(this.repos.tenants, this.contexto)).exigirNoDadoDeBaja();
        const uso = {
          sucursalesActivas: await this.repos.sucursales.contarActivas(),
          usuariosActivos: await this.usoUsuarios.activos(tenantId, productoCodigo),
        };

        const existente = await this.repos.suscripciones.buscar(productoCodigo);
        const suscripcion = existente ?? Suscripcion.crear(this.ids.next(), tenantId, productoCodigo, datos, uso);
        if (existente) existente.cambiar(datos, uso);

        await this.repos.suscripciones.guardar(suscripcion);
        await publicarEventos(this.eventos, suscripcion);
        return { suscripcionId: suscripcion.id, nueva: existente === null };
      }),
    );
  }
}

/** TR-RF-006: aplica la transición, la deja en el historial y publica el evento. */
export class CambiarEstadoTenant {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly reloj: Clock,
    private readonly eventos: EventPublisher,
    private readonly tenants: RepositorioTenants,
  ) {}

  /** `cambiado: false` si el tenant ya estaba en ese estado: el reintento no deja rastro (TR-RNF-008). */
  ejecutar(comando: CambiarEstadoTenantComando): Promise<{ cambiado: boolean }> {
    return this.contexto.run({ tenantId: comando.tenantId }, () =>
      this.uow.run(async () => {
        const tenant = await buscarTenant(this.tenants, this.contexto);
        const cambio = tenant.cambiarEstado(comando.estadoNuevo, comando.motivo, comando.fechaEfectiva ?? this.reloj.now());
        if (!cambio) return { cambiado: false };

        await this.tenants.guardar(tenant);
        await this.tenants.registrarCambioEstado(this.ids.next(), tenant.id, cambio, comando.actorId ?? null);
        await publicarEventos(this.eventos, tenant);
        return { cambiado: true };
      }),
    );
  }
}
