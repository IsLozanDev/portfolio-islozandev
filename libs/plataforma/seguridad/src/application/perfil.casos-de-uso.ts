import { NotFoundError, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { RolFueraDelTechoError } from '../domain/errores.js';
import { Perfil, type DatosPerfil } from '../domain/perfil.js';
import type { Rol } from '../domain/rol.js';
import type { CatalogoPermisos, ProductosContratados, RepositorioPerfiles, RepositorioRoles } from './ports/repositorios.js';
import { permisosPlatDelCliente, PRODUCTO_PLATAFORMA } from './productos-del-cliente.js';
import { publicarEventos } from './publicar-eventos.js';

export interface PerfilRepos {
  perfiles: RepositorioPerfiles;
  roles: RepositorioRoles;
  productos: ProductosContratados;
  catalogo: Pick<CatalogoPermisos, 'permisosDeRolPredefinido'>;
}

export interface CrearPerfilComando extends DatosPerfil {
  roles: string[];
}

export interface CopiarPerfilComando extends DatosPerfil {
  origenId: string;
  /** Si viene, reemplaza los roles copiados. */
  roles?: string[];
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

/** Lanza RolFueraDelTechoError si un rol PLAT (predefinido o propio) tiene un permiso fuera de PLAT_PROPIETARIO. */
function exigirRolesDentroDelTecho(roles: readonly Rol[], permitidos: ReadonlySet<string>): void {
  const fueraDelTecho = roles.find(
    (rol) => rol.productoCodigo === PRODUCTO_PLATAFORMA && rol.permisos.some((permiso) => !permitidos.has(permiso)),
  );
  if (fueraDelTecho) throw new RolFueraDelTechoError(fueraDelTecho.datos.codigo);
}

/** Roles del perfil, ya validados contra el techo PLAT del cliente (spec 16c). */
async function cargarRolesDelCliente(repos: PerfilRepos, ids: readonly string[]): Promise<Rol[]> {
  const roles = await cargarRoles(repos.roles, ids);
  exigirRolesDentroDelTecho(roles, await permisosPlatDelCliente(repos.catalogo));
  return roles;
}

async function buscarPerfil(perfiles: RepositorioPerfiles, id: string): Promise<Perfil> {
  const perfil = await perfiles.buscar(id);
  if (!perfil) throw new NotFoundError('El perfil no existe');
  return perfil;
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
        await cargarRolesDelCliente(this.repos, roles),
        await this.repos.productos.vigentes(),
      );
      await this.repos.perfiles.guardar(perfil);
      await publicarEventos(this.eventos, perfil);
      return { perfilId: perfil.id };
    });
  }
}

/** Copia un perfil predefinido o propio, con sus roles o con los indicados. El conjunto final siempre se valida (spec 16c). */
export class CopiarPerfil {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly eventos: EventPublisher,
    private readonly repos: PerfilRepos,
  ) {}

  ejecutar({ origenId, roles, ...datos }: CopiarPerfilComando): Promise<{ perfilId: string }> {
    return this.uow.run(async () => {
      const origen = await buscarPerfil(this.repos.perfiles, origenId);
      const perfil = Perfil.copiarDe(
        this.ids.next(),
        this.contexto.current().tenantId,
        origen,
        datos,
        await cargarRolesDelCliente(this.repos, roles ?? origen.roles),
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
      const perfil = await buscarPerfil(this.repos.perfiles, perfilId);
      perfil.cambiarRoles(await cargarRolesDelCliente(this.repos, roles), await this.repos.productos.vigentes());
      await this.repos.perfiles.guardar(perfil);
      await publicarEventos(this.eventos, perfil);
    });
  }
}
