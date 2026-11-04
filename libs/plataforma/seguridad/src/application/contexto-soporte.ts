import { PERMISOS_VETADOS_SOPORTE } from '../domain/permisos-seg.js';
import type { OpcionMenu, PermisosResueltos } from './ports/permisos.port.js';

const VETADOS = new Set(PERMISOS_VETADOS_SOPORTE);

/**
 * Con soporte vigente, el agente no ve lo que el interceptor le negaría: quita los permisos vetados y
 * las opciones que solo dependen de ellos. Una agrupadora sin opciones visibles debajo también se quita.
 */
export function contextoDeSoporte(resueltos: PermisosResueltos, permisosPorOpcion: ReadonlyMap<string, readonly string[]>): PermisosResueltos {
  const permisos = resueltos.permisos.filter((permiso) => !VETADOS.has(permiso));
  const disponibles = new Set(permisos);
  const visibles = resueltos.menu.filter((opcion) => {
    const requeridos = permisosPorOpcion.get(opcion.codigo) ?? [];
    return requeridos.length === 0 || requeridos.some((permiso) => disponibles.has(permiso));
  });
  return { permisos, menu: sinAgrupadorasVacias(visibles, permisosPorOpcion) };
}

/** Una agrupadora (sin ruta ni permisos) queda si le queda alguna opción hija. */
function sinAgrupadorasVacias(menu: readonly OpcionMenu[], permisosPorOpcion: ReadonlyMap<string, readonly string[]>): OpcionMenu[] {
  const conHijos = new Set(menu.map((opcion) => opcion.padre).filter((padre): padre is string => padre !== null));
  return menu.filter((opcion) => opcion.ruta !== null || (permisosPorOpcion.get(opcion.codigo) ?? []).length > 0 || conHijos.has(opcion.codigo));
}
