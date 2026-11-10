import type { Clock, TenantContext } from '@vitrina/plataforma/kernel';
import type { AlcanceActor, DirectorioSeg, SucursalDirectorio, UsuarioDirectorio } from '@vitrina/plataforma/seguridad';
import { SucursalFueraDeAlcanceError } from '../domain/errores.js';
import type { FiltroAuditoria } from '../domain/filtro-auditoria.js';
import type { AlcanceLectura, EventoAuditoriaResumen, FiltroResuelto } from './ports/lectura-auditoria.port.js';

/** Un texto tan genérico que pasa de 500 personas se acota con más letras. */
export const MAXIMO_USUARIOS_POR_BUSQUEDA = 500;

export interface DependenciasAlcance {
  contexto: TenantContext;
  reloj: Clock;
  alcanceActor: AlcanceActor;
  directorio: DirectorioSeg;
}

/**
 * Con alcance TENANT para el permiso se ve todo el tenant, también lo que no tiene sucursal. Sin él,
 * solo la sucursal de X-Sucursal-Id, que PermisoGuard ya verificó (TR-CA-214).
 */
export async function alcanceDelActor(dependencias: DependenciasAlcance, permiso: string): Promise<AlcanceLectura> {
  const { actorId, branchId } = dependencias.contexto.current();
  if (actorId && (await dependencias.alcanceActor.alcanzaTenant(actorId, permiso, dependencias.reloj.now()))) return {};
  if (!branchId) throw new SucursalFueraDeAlcanceError();
  return { sucursalForzada: branchId };
}

/** Solo con alcance TENANT: el resultado de integridad es de todo el tenant. */
export async function exigirAlcanceTenant(dependencias: DependenciasAlcance, permiso: string): Promise<void> {
  const alcance = await alcanceDelActor(dependencias, permiso);
  if (alcance.sucursalForzada) throw new SucursalFueraDeAlcanceError();
}

/**
 * Agrega el alcance y los ids de quienes coinciden con `usuario`. null si el texto no encuentra a nadie:
 * la consulta responde vacía sin ir a la tabla. Pedir otra sucursal sin alcance TENANT es 403.
 */
export async function resolverFiltro(dependencias: DependenciasAlcance, filtro: FiltroAuditoria, permiso: string): Promise<FiltroResuelto | null> {
  const alcance = await alcanceDelActor(dependencias, permiso);
  if (alcance.sucursalForzada && filtro.sucursalId && filtro.sucursalId !== alcance.sucursalForzada) throw new SucursalFueraDeAlcanceError();

  const { usuario, ...resto } = filtro;
  if (usuario === undefined) return { ...resto, ...alcance };
  const usuarioIds = await dependencias.directorio.buscarUsuarios(usuario, MAXIMO_USUARIOS_POR_BUSQUEDA);
  return usuarioIds.length === 0 ? null : { ...resto, ...alcance, usuarioIds };
}

export interface NombresDeEventos {
  usuarios: ReadonlyMap<string, UsuarioDirectorio>;
  sucursales: ReadonlyMap<string, SucursalDirectorio>;
}

/** Una llamada por tipo para toda la página: nombres de quien actuó y de la sucursal. */
export async function nombresDe(directorio: DirectorioSeg, eventos: readonly EventoAuditoriaResumen[]): Promise<NombresDeEventos> {
  const [usuarios, sucursales] = await Promise.all([
    directorio.usuarios(idsDistintos(eventos.map((evento) => evento.usuarioId))),
    directorio.sucursales(idsDistintos(eventos.map((evento) => evento.sucursalId))),
  ]);
  return {
    usuarios: new Map(usuarios.map((usuario) => [usuario.id, usuario])),
    sucursales: new Map(sucursales.map((sucursal) => [sucursal.id, sucursal])),
  };
}

function idsDistintos(ids: readonly (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}
