import type { CambioOrden, ColumnaTabla, DefinicionFiltro, ValorFiltros } from '@vitrina/shared/ui';

export type EstadoUsuario = 'ACTIVO' | 'SUSPENDIDO';

export interface UsuarioDeMuestra {
  id: string;
  nombre: string;
  correo: string;
  estado: EstadoUsuario;
}

const CANTIDAD_USUARIOS = 37;
const CADA_CUANTOS_SUSPENDIDO = 4;
const NOMBRES = ['Rosa', 'Carmen', 'Jorge', 'Luis', 'Ana', 'Pedro', 'Lucía', 'Miguel', 'Sofía', 'Diego'];
const APELLIDOS = ['Quispe', 'Flores', 'Huamán', 'Rojas', 'Torres', 'Díaz', 'Mendoza', 'Vargas'];

/** Datos fijos de la página de muestra: no hay API detrás. */
export const USUARIOS_DE_MUESTRA: readonly UsuarioDeMuestra[] = Array.from({ length: CANTIDAD_USUARIOS }, (_, indice) => {
  const nombre = `${NOMBRES[indice % NOMBRES.length]} ${APELLIDOS[indice % APELLIDOS.length]}`;
  return {
    id: `usuario-${indice + 1}`,
    nombre,
    correo: `usuario${indice + 1}@vitrina.pe`,
    estado: indice % CADA_CUANTOS_SUSPENDIDO === 0 ? 'SUSPENDIDO' : 'ACTIVO',
  };
});

export const COLUMNAS_USUARIOS: ColumnaTabla<UsuarioDeMuestra>[] = [
  { clave: 'nombre', titulo: 'Nombre', ordenable: true },
  { clave: 'correo', titulo: 'Correo' },
  { clave: 'estado', titulo: 'Estado' },
];

export const FILTROS_USUARIOS: DefinicionFiltro[] = [
  {
    clave: 'estado',
    etiqueta: 'Estado',
    opciones: [
      { valor: 'ACTIVO', etiqueta: 'Activo' },
      { valor: 'SUSPENDIDO', etiqueta: 'Suspendido' },
    ],
  },
];

/** Hace en memoria lo que haría la API: filtrar y ordenar. */
export function filtrarYOrdenar(usuarios: readonly UsuarioDeMuestra[], filtros: ValorFiltros, orden: CambioOrden | null): UsuarioDeMuestra[] {
  const busqueda = filtros.busqueda.trim().toLocaleLowerCase('es');
  const estado = filtros['estado'];
  const filtrados = usuarios.filter((usuario) => tieneEstado(usuario, estado) && coincideConBusqueda(usuario, busqueda));
  if (!orden?.direccion) return filtrados;
  const sentido = orden.direccion === 'asc' ? 1 : -1;
  return [...filtrados].sort((uno, otro) => sentido * uno.nombre.localeCompare(otro.nombre, 'es'));
}

function tieneEstado(usuario: UsuarioDeMuestra, estado: string | null): boolean {
  return !estado || usuario.estado === estado;
}

function coincideConBusqueda(usuario: UsuarioDeMuestra, busqueda: string): boolean {
  return !busqueda || usuario.nombre.toLocaleLowerCase('es').includes(busqueda) || usuario.correo.includes(busqueda);
}
