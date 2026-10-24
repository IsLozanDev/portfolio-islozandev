import { cubre, type Ambito } from '../domain/alcance.js';
import type { Fecha } from '../domain/asignacion.js';
import type { MembresiasLectura, RepositorioAsignaciones, UbicacionesOrg } from './ports/repositorios.js';

export interface ReposAlcance {
  membresias: MembresiasLectura;
  asignaciones: RepositorioAsignaciones;
  ubicaciones: UbicacionesOrg;
}

/**
 * true si el actor, con membresía ACTIVO en el tenant del contexto, es propietario o tiene para
 * cada destino una asignación vigente propia que lo cubre (TR-RN-007, TR-CA-026). Sin destinos
 * (miembro sin asignaciones) solo actúa quien tiene alcance TENANT: nada lo acota a una sucursal.
 */
export async function actorCubre(repos: ReposAlcance, usuarioId: string, destinos: readonly Ambito[], hoy: Fecha): Promise<boolean> {
  const membresia = await repos.membresias.deUsuario(usuarioId);
  if (!membresia || membresia.estado !== 'ACTIVO') return false;
  if (membresia.esPropietario) return true;

  const propias = await Promise.all(
    (await repos.asignaciones.vigentesDe(membresia.id, hoy)).map((a) => repos.ubicaciones.resolver(a.ubicacion)),
  );
  if (destinos.length === 0) return propias.some((propia) => propia.alcance === 'TENANT');
  return destinos.every((destino) => propias.some((propia) => cubre(propia, destino)));
}
