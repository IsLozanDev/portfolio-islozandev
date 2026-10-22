import { NotFoundError, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { Perfil, type DatosPerfil } from '../domain/perfil.js';
import type { Rol } from '../domain/rol.js';
import type { ProductosContratados, RepositorioPerfiles, RepositorioRoles } from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

export interface PerfilRepos {
  perfiles: RepositorioPerfiles;
  roles: RepositorioRoles;
  productos: ProductosContratados;
}

export interface CrearPerfilComando extends DatosPerfil {
  roles: string[];
}

export interface CambiarRolesPerfilComando {
  perfilId: string;
  roles: string[];
}

async function cargarRoles(roles: RepositorioRoles, ids: readonly string[]): Promise<Rol[]> {
  const unicos = [...new Set(ids)];
  const encontrados = await roles.buscarVarios(unicos);
  if (encontrados.length !== unicos.length) throw new NotFoundError('Alguno de los roles no existe');
  return encontrados;
}

/** TR-RF-012: perfil de puesto con roles activos de productos contratados (TR-CA-034, TR-CA-035). */
export class CrearPerfil {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly eventos: EventPublisher,
    private readonly repos: PerfilRepos,
  ) {}

  ejecutar({ roles, ...datos }: CrearPerfilComando): Promise<{ perfilId: string }> {
    return this.uow.run(async () => {
      const perfil = Perfil.crear(
        this.ids.next(),
        this.contexto.current().tenantId,
        datos,
        await cargarRoles(this.repos.roles, roles),
        await this.repos.productos.vigentes(),
      );
      await this.repos.perfiles.guardar(perfil);
      await publicarEventos(this.eventos, perfil);
      return { perfilId: perfil.id };
    });
  }
}

export class CambiarRolesPerfil {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly eventos: EventPublisher,
    private readonly repos: PerfilRepos,
  ) {}

  async ejecutar({ perfilId, roles }: CambiarRolesPerfilComando): Promise<void> {
    await this.uow.run(async () => {
      const perfil = await this.repos.perfiles.buscar(perfilId);
      if (!perfil) throw new NotFoundError('El perfil no existe');
      perfil.cambiarRoles(await cargarRoles(this.repos.roles, roles), await this.repos.productos.vigentes());
      await this.repos.perfiles.guardar(perfil);
      await publicarEventos(this.eventos, perfil);
    });
  }
}
