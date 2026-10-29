import type { ContextoUsuario } from '@vitrina/shared/auth';
import { construirArbolMenu, filtrarMenuPorPrefijo, ICONO_POR_DEFECTO } from './arbol-menu';

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

describe('filtrarMenuPorPrefijo', () => {
  const menuDelProducto = [
    opcion('plat.admin', { ruta: null }),
    opcion('plat.admin.usuarios', { padre: 'plat.admin', ruta: '/admin/usuarios' }),
    opcion('plat.consola', { ruta: null }),
    opcion('plat.consola.tenants', { padre: 'plat.consola', ruta: '/consola/tenants' }),
  ];
  const codigosDelArbol = (prefijo: string | undefined) => construirArbolMenu(filtrarMenuPorPrefijo(menuDelProducto, prefijo)).map((nodo) => nodo.codigo);

  it('sin prefijo deja el menú entero', () => {
    expect(codigosDelArbol(undefined)).toEqual(['plat.admin', 'plat.consola']);
  });

  it('con /admin no aparece la consola', () => {
    expect(codigosDelArbol('/admin')).toEqual(['plat.admin']);
  });

  it('con /consola solo aparece Consola > Tenants', () => {
    const arbol = construirArbolMenu(filtrarMenuPorPrefijo(menuDelProducto, '/consola'));

    expect(arbol.map((nodo) => nodo.codigo)).toEqual(['plat.consola']);
    expect(arbol[0].hijos.map((nodo) => nodo.ruta)).toEqual(['/consola/tenants']);
  });
});
