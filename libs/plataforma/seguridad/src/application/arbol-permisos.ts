import type { ElementoDelMenu, FilaCatalogo, PermisoDelCatalogo } from './ports/lectura-roles.js';

export type PermisoDelArbol = PermisoDelCatalogo;

export interface OpcionDelArbol {
  codigo: string;
  nombre: string;
  permisos: PermisoDelArbol[];
}

export interface ModuloDelArbol {
  codigo: string;
  nombre: string;
  opciones: OpcionDelArbol[];
}

/** Árbol módulo → opción → permiso del editor de roles (TR-RF-011); `otros` son los permisos sin opción. */
export interface ArbolPermisos {
  productoCodigo: string;
  modulos: ModuloDelArbol[];
  otros: PermisoDelArbol[];
}

interface Ubicacion {
  modulo: ElementoDelMenu;
  opcion: ElementoDelMenu;
}

interface ModuloEnArmado extends ElementoDelMenu {
  opciones: Map<string, ElementoDelMenu & { permisos: PermisoDelArbol[] }>;
}

/** Cada permiso cuelga de una sola opción: la primera por orden de módulo, de opción y código de opción. */
export function armarArbolPermisos(productoCodigo: string, filas: readonly FilaCatalogo[]): ArbolPermisos {
  const modulos = new Map<string, ModuloEnArmado>();
  const otros: PermisoDelArbol[] = [];

  for (const [permiso, ubicaciones] of agruparPorPermiso(filas)) {
    const primera = ubicaciones.sort(porOrdenDelMenu)[0];
    if (!primera) {
      otros.push(permiso);
      continue;
    }
    opcionEnArmado(modulos, primera).permisos.push(permiso);
  }

  return {
    productoCodigo,
    modulos: [...modulos.values()].sort(porOrden).map((modulo) => ({
      codigo: modulo.codigo,
      nombre: modulo.nombre,
      opciones: [...modulo.opciones.values()].sort(porOrden).map((opcion) => ({
        codigo: opcion.codigo,
        nombre: opcion.nombre,
        permisos: opcion.permisos.sort(porCodigo),
      })),
    })),
    otros: otros.sort(porCodigo),
  };
}

function agruparPorPermiso(filas: readonly FilaCatalogo[]): Map<PermisoDelArbol, Ubicacion[]> {
  const porCodigoDePermiso = new Map<string, { permiso: PermisoDelArbol; ubicaciones: Ubicacion[] }>();
  for (const { permiso, modulo, opcion } of filas) {
    const grupo = porCodigoDePermiso.get(permiso.codigo) ?? { permiso, ubicaciones: [] };
    if (modulo && opcion) grupo.ubicaciones.push({ modulo, opcion });
    porCodigoDePermiso.set(permiso.codigo, grupo);
  }
  return new Map([...porCodigoDePermiso.values()].map(({ permiso, ubicaciones }) => [permiso, ubicaciones]));
}

function opcionEnArmado(modulos: Map<string, ModuloEnArmado>, { modulo, opcion }: Ubicacion): ElementoDelMenu & { permisos: PermisoDelArbol[] } {
  const moduloEnArmado = modulos.get(modulo.codigo) ?? { ...modulo, opciones: new Map() };
  modulos.set(modulo.codigo, moduloEnArmado);
  const opcionEnArmado = moduloEnArmado.opciones.get(opcion.codigo) ?? { ...opcion, permisos: [] };
  moduloEnArmado.opciones.set(opcion.codigo, opcionEnArmado);
  return opcionEnArmado;
}

function porOrdenDelMenu(a: Ubicacion, b: Ubicacion): number {
  return a.modulo.orden - b.modulo.orden || a.opcion.orden - b.opcion.orden || a.opcion.codigo.localeCompare(b.opcion.codigo);
}

function porOrden(a: ElementoDelMenu, b: ElementoDelMenu): number {
  return a.orden - b.orden || a.codigo.localeCompare(b.codigo);
}

function porCodigo(a: PermisoDelArbol, b: PermisoDelArbol): number {
  return a.codigo.localeCompare(b.codigo);
}
