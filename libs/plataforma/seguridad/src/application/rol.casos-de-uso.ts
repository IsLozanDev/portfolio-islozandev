import { NotFoundError, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { ProductoNoContratadoError, RolPredefinidoNoEditableError } from '../domain/errores.js';
import { Rol, type DatosRol } from '../domain/rol.js';
import type { CatalogoPermisos, ProductosContratados, RepositorioRoles } from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

export interface RolRepos {
  roles: RepositorioRoles;
  catalogo: CatalogoPermisos;
  productos: ProductosContratados;
}

export interface CrearRolComando extends DatosRol {
  productoCodigo: string;
  permisos: string[];
}

export interface CopiarRolComando extends DatosRol {
  origenId: string;
  /** Si viene, reemplaza los permisos copiados (TR-CA-031: copiar y quitar uno). */
  permisos?: string[];
}

export interface CambiarPermisosRolComando {
  rolId: string;
  permisos: string[];
}

export interface InactivarRolComando {
  rolId: string;
  confirmado: boolean;
}

/** Precondición de TR-RF-011: suscripción vigente al producto del rol. PLAT no se contrata. */
async function exigirContratado(productos: ProductosContratados, productoCodigo: string): Promise<void> {
  if (productoCodigo !== 'PLAT' && !(await productos.vigentes()).includes(productoCodigo)) {
    throw new ProductoNoContratadoError(productoCodigo);
  }
}

async function buscarRol(roles: RepositorioRoles, id: string): Promise<Rol> {
  const rol = await roles.buscar(id);
  if (!rol) throw new NotFoundError('El rol no existe');
  return rol;
}

/** TR-RF-011: rol propio del tenant con permisos de un producto contratado. */
export class CrearRol {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly eventos: EventPublisher,
    private readonly repos: RolRepos,
  ) {}

  ejecutar({ productoCodigo, permisos, ...datos }: CrearRolComando): Promise<{ rolId: string }> {
    return this.uow.run(async () => {
      await exigirContratado(this.repos.productos, productoCodigo);
      const catalogo = await this.repos.catalogo.permisos(permisos);
      const rol = Rol.crear(this.ids.next(), this.contexto.current().tenantId, productoCodigo, datos, permisos, catalogo);

      await this.repos.roles.guardar(rol);
      await publicarEventos(this.eventos, rol);
      return { rolId: rol.id };
    });
  }
}

/** TR-CA-031: copia un rol predefinido o propio, con sus permisos o con los indicados. */
export class CopiarRol {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly eventos: EventPublisher,
    private readonly repos: RolRepos,
  ) {}

  ejecutar({ origenId, permisos, ...datos }: CopiarRolComando): Promise<{ rolId: string }> {
    return this.uow.run(async () => {
      const origen = await buscarRol(this.repos.roles, origenId);
      await exigirContratado(this.repos.productos, origen.productoCodigo);
      const rol = Rol.copiarDe(this.ids.next(), this.contexto.current().tenantId, origen, datos);
      if (permisos !== undefined) rol.cambiarPermisos(permisos, await this.repos.catalogo.permisos(permisos));

      await this.repos.roles.guardar(rol);
      await publicarEventos(this.eventos, rol);
      return { rolId: rol.id };
    });
  }
}

export class CambiarPermisosRol {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly eventos: EventPublisher,
    private readonly repos: Pick<RolRepos, 'roles' | 'catalogo'>,
  ) {}

  /** TR-CA-032: un predefinido falla con «Los roles predefinidos no se editan; cree una copia». */
  async ejecutar({ rolId, permisos }: CambiarPermisosRolComando): Promise<void> {
    await this.uow.run(async () => {
      const rol = await buscarRol(this.repos.roles, rolId);
      rol.cambiarPermisos(permisos, await this.repos.catalogo.permisos(permisos));
      await this.repos.roles.guardar(rol);
      await publicarEventos(this.eventos, rol);
    });
  }
}

export interface ResultadoInactivar {
  requiereConfirmacion: boolean;
  afectados: number;
}

/** TR-CA-033: sin `confirmado` no cambia nada y devuelve a cuántos usuarios afecta. */
export class InactivarRol {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly eventos: EventPublisher,
    private readonly roles: RepositorioRoles,
  ) {}

  ejecutar({ rolId, confirmado }: InactivarRolComando): Promise<ResultadoInactivar> {
    return this.uow.run(async () => {
      const rol = await buscarRol(this.roles, rolId);
      if (rol.esPredefinido) throw new RolPredefinidoNoEditableError();
      const afectados = await this.roles.contarMembresiasAfectadas(rolId);
      if (!confirmado) return { requiereConfirmacion: true, afectados };

      rol.inactivar(afectados);
      await this.roles.guardar(rol);
      await publicarEventos(this.eventos, rol);
      return { requiereConfirmacion: false, afectados };
    });
  }
}
