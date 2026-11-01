import type { RolDisponible } from '../models/perfil';

/** Los roles del perfil que siguen en `roles-disponibles`; los demás (inactivos, de un producto vencido, fuera del techo) se quitan al guardar. */
export function rolesQueSiguenDisponibles(roles: readonly string[], disponibles: readonly RolDisponible[]): Set<string> {
  const idsDisponibles = new Set(disponibles.map((rol) => rol.id));
  return new Set(roles.filter((rolId) => idsDisponibles.has(rolId)));
}
