import type { RolDisponible } from '../models/perfil';
import { agruparRolesPorProducto } from './roles-por-producto';

const rol = (id: string, productoCodigo: string, productoNombre: string): RolDisponible => ({
  id,
  codigo: id.toUpperCase(),
  nombre: id,
  productoCodigo,
  productoNombre,
  predefinido: true,
});

describe('agruparRolesPorProducto', () => {
  it('un grupo por producto, en el orden en que llegan los roles', () => {
    const roles = [rol('gestor', 'ECO', 'Comercio'), rol('cajero', 'LIB', 'Librería'), rol('vendedor', 'LIB', 'Librería'), rol('admin', 'PLAT', 'Plataforma')];

    expect(agruparRolesPorProducto(roles)).toEqual([
      { productoCodigo: 'ECO', productoNombre: 'Comercio', roles: [roles[0]] },
      { productoCodigo: 'LIB', productoNombre: 'Librería', roles: [roles[1], roles[2]] },
      { productoCodigo: 'PLAT', productoNombre: 'Plataforma', roles: [roles[3]] },
    ]);
  });

  it('sin roles no hay grupos', () => {
    expect(agruparRolesPorProducto([])).toEqual([]);
  });
});
