import type { ModuloDelArbol, OpcionDelArbol } from '../models/catalogo-permisos';

/** Estado del checkbox de una opción o un módulo del árbol de permisos. */
export type EstadoGrupo = 'marcado' | 'parcial' | 'vacio';

export function codigosDeOpcion(opcion: OpcionDelArbol): string[] {
  return opcion.permisos.map((permiso) => permiso.codigo);
}

export function codigosDeModulo(modulo: ModuloDelArbol): string[] {
  return modulo.opciones.flatMap(codigosDeOpcion);
}

export function estadoDelGrupo(codigos: readonly string[], seleccionados: ReadonlySet<string>): EstadoGrupo {
  const marcados = codigos.filter((codigo) => seleccionados.has(codigo)).length;
  if (marcados === 0) return 'vacio';
  return marcados === codigos.length ? 'marcado' : 'parcial';
}

/** Un grupo marcado se vacía; uno vacío o parcial se marca entero. No muta `seleccionados`. */
export function alternarGrupo(codigos: readonly string[], seleccionados: ReadonlySet<string>): Set<string> {
  const nuevos = new Set(seleccionados);
  if (estadoDelGrupo(codigos, seleccionados) === 'marcado') {
    for (const codigo of codigos) nuevos.delete(codigo);
    return nuevos;
  }
  for (const codigo of codigos) nuevos.add(codigo);
  return nuevos;
}

/** Lo que se envía a la API: orden estable por código. */
export function permisosOrdenados(seleccionados: ReadonlySet<string>): string[] {
  return [...seleccionados].sort();
}

/** No muta `seleccionados`. */
export function alternarPermiso(codigo: string, seleccionados: ReadonlySet<string>): Set<string> {
  const nuevos = new Set(seleccionados);
  if (nuevos.has(codigo)) nuevos.delete(codigo);
  else nuevos.add(codigo);
  return nuevos;
}
