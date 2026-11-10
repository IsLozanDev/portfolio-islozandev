import { cubre, type Ambito } from '../domain/alcance.js';
import type { Asignacion, Fecha } from '../domain/asignacion.js';
import type { Rol } from '../domain/rol.js';
import { fechaLocal } from './otorgar-asignacion.js';
import type { AlcanceActor, DestinoAlcance } from './ports/alcance-actor.port.js';
import type { MembresiaLeida, MembresiasLectura, RepositorioAsignaciones, RepositorioPerfiles, RepositorioRoles, UbicacionesOrg } from './ports/repositorios.js';

export interface ReposAlcance {
  membresias: MembresiasLectura;
  asignaciones: RepositorioAsignaciones;
  ubicaciones: UbicacionesOrg;
}

/** Para saber qué permisos da una asignación TENANT (spec 20b). */
export interface ReposAlcanceActor extends ReposAlcance {
  roles: Pick<RepositorioRoles, 'buscarVarios'>;
  perfiles: Pick<RepositorioPerfiles, 'buscar'>;
}

async function membresiaActiva(repos: ReposAlcance, usuarioId: string): Promise<MembresiaLeida | null> {
  const membresia = await repos.membresias.deUsuario(usuarioId);
  return membresia?.estado === 'ACTIVO' ? membresia : null;
}

/**
 * true si el actor, con membresía ACTIVO en el tenant del contexto, es propietario o tiene para
 * cada destino una asignación vigente propia que lo cubre (TR-RN-007, TR-CA-026). Sin destinos
 * (miembro sin asignaciones) solo actúa quien tiene alcance TENANT: nada lo acota a una sucursal.
 */
export async function actorCubre(repos: ReposAlcance, usuarioId: string, destinos: readonly Ambito[], hoy: Fecha): Promise<boolean> {
  const membresia = await membresiaActiva(repos, usuarioId);
  if (!membresia) return false;
  if (membresia.esPropietario) return true;

  const propias = await Promise.all(
    (await repos.asignaciones.vigentesDe(membresia.id, hoy)).map((a) => repos.ubicaciones.resolver(a.ubicacion)),
  );
  if (destinos.length === 0) return propias.some((propia) => propia.alcance === 'TENANT');
  return destinos.every((destino) => propias.some((propia) => cubre(propia, destino)));
}

/** AlcanceActor para otros componentes (spec 09): completa la empresa de una sucursal y aplica actorCubre. */
export class AlcanceActorSeg implements AlcanceActor {
  constructor(private readonly repositorios: ReposAlcanceActor) {}

  async cubre(usuarioId: string, destino: DestinoAlcance, ahora: Date): Promise<boolean> {
    const ambitoDestino = await this.repositorios.ubicaciones.resolver({ ...destino, unidadId: null });
    return actorCubre(this.repositorios, usuarioId, [ambitoDestino], fechaLocal(ahora));
  }

  async alcanzaTenant(usuarioId: string, permiso: string, ahora: Date): Promise<boolean> {
    const membresia = await membresiaActiva(this.repositorios, usuarioId);
    if (!membresia) return false;
    if (membresia.esPropietario) return true;

    const deTenant = (await this.repositorios.asignaciones.vigentesDe(membresia.id, fechaLocal(ahora))).filter(
      (asignacion) => asignacion.alcance === 'TENANT',
    );
    for (const asignacion of deTenant) {
      const roles = await this.rolesDe(asignacion);
      if (roles.some((rol) => rol.activo && rol.permisos.includes(permiso))) return true;
    }
    return false;
  }

  private async rolesDe(asignacion: Asignacion): Promise<Rol[]> {
    if (asignacion.rolId) return this.repositorios.roles.buscarVarios([asignacion.rolId]);
    if (!asignacion.perfilId) return [];
    const perfil = await this.repositorios.perfiles.buscar(asignacion.perfilId);
    return perfil ? this.repositorios.roles.buscarVarios(perfil.roles) : [];
  }
}
