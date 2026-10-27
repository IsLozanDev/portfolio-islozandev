import type { ContextoUsuario } from '@vitrina/shared/auth';
import { construirArbolMenu, ICONO_POR_DEFECTO } from './arbol-menu';

type OpcionMenu = ContextoUsuario['menu'][number];

function opcion(codigo: string, cambios: Partial<OpcionMenu> = {}): OpcionMenu {
  return { codigo, padre: null, nombre: codigo, ruta: `/${codigo}`, icono: 'home', orden: 0, ...cambios };
}

describe('construirArbolMenu', () => {
  it('sin opciones devuelve un árbol vacío', () => {
    expect(construirArbolMenu([])).toEqual([]);
  });

  it('ordena hermanos por orden y luego por nombre', () => {
    const arbol = construirArbolMenu([
      opcion('c', { nombre: 'Caja', orden: 2 }),
      opcion('b', { nombre: 'Bodega', orden: 1 }),
      opcion('a', { nombre: 'Almacén', orden: 2 }),
    ]);

    expect(arbol.map((nodo) => nodo.nombre)).toEqual(['Bodega', 'Almacén', 'Caja']);
  });

  it('anida tres niveles y quita la ruta de los grupos', () => {
    const arbol = construirArbolMenu([
      opcion('admin', { ruta: '/admin' }),
      opcion('seguridad', { padre: 'admin', ruta: null }),
      opcion('roles', { padre: 'seguridad', ruta: '/roles' }),
    ]);

    expect(arbol).toHaveLength(1);
    expect(arbol[0].ruta).toBeNull();
    expect(arbol[0].hijos[0].codigo).toBe('seguridad');
    expect(arbol[0].hijos[0].hijos[0]).toMatchObject({ codigo: 'roles', ruta: '/roles', hijos: [] });
  });

  it('una opción con padre ausente va a la raíz', () => {
    const arbol = construirArbolMenu([opcion('usuarios', { padre: 'admin-sin-permiso' })]);

    expect(arbol.map((nodo) => nodo.codigo)).toEqual(['usuarios']);
  });

  it('omite un nodo sin hijos ni ruta', () => {
    const arbol = construirArbolMenu([opcion('vacio', { ruta: null }), opcion('inicio')]);

    expect(arbol.map((nodo) => nodo.codigo)).toEqual(['inicio']);
  });

  it('sin icono usa el icono por defecto', () => {
    expect(construirArbolMenu([opcion('inicio', { icono: null })])[0].icono).toBe(ICONO_POR_DEFECTO);
  });
});
