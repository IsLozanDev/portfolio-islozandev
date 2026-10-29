import type { ModuloDelArbol } from '../models/catalogo-permisos';
import { alternarGrupo, alternarPermiso, codigosDeModulo, codigosDeOpcion, estadoDelGrupo } from './seleccion-permisos';

const permiso = (codigo: string) => ({ codigo, descripcion: codigo, sensible: false, alcanceMinimo: 'UNIDAD' as const });

const SALON: ModuloDelArbol = {
  codigo: 'salon',
  nombre: 'Salón',
  opciones: [
    { codigo: 'rest.salon.pedidos', nombre: 'Pedidos', permisos: [permiso('rest.pedido.tomar'), permiso('rest.pedido.anular')] },
    { codigo: 'rest.salon.mesas', nombre: 'Mesas', permisos: [permiso('rest.mesa.ver')] },
  ],
};
const PEDIDOS = SALON.opciones[0];

describe('seleccion-permisos', () => {
  it('codigosDeOpcion y codigosDeModulo juntan los permisos del grupo', () => {
    expect(codigosDeOpcion(PEDIDOS)).toEqual(['rest.pedido.tomar', 'rest.pedido.anular']);
    expect(codigosDeModulo(SALON)).toEqual(['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver']);
  });

  it.each([
    [[], 'vacio'],
    [['rest.pedido.tomar'], 'parcial'],
    [['rest.pedido.tomar', 'rest.pedido.anular'], 'marcado'],
    [['rest.mesa.ver'], 'vacio'],
  ])('con %o seleccionados la opción Pedidos está %s', (seleccionados, estado) => {
    expect(estadoDelGrupo(codigosDeOpcion(PEDIDOS), new Set(seleccionados))).toBe(estado);
  });

  it('alternar un grupo vacío o parcial lo marca entero y conserva lo de fuera', () => {
    const seleccionados = new Set(['rest.pedido.tomar', 'rest.caja.cerrar']);

    const resultado = alternarGrupo(codigosDeModulo(SALON), seleccionados);

    expect([...resultado].sort()).toEqual(['rest.caja.cerrar', 'rest.mesa.ver', 'rest.pedido.anular', 'rest.pedido.tomar']);
    expect([...seleccionados]).toEqual(['rest.pedido.tomar', 'rest.caja.cerrar']);
  });

  it('alternar un grupo marcado lo vacía', () => {
    const resultado = alternarGrupo(codigosDeOpcion(PEDIDOS), new Set(['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver']));

    expect([...resultado]).toEqual(['rest.mesa.ver']);
  });

  it('desmarcar un permiso de un grupo marcado lo deja parcial', () => {
    const resultado = alternarPermiso('rest.pedido.anular', new Set(codigosDeOpcion(PEDIDOS)));

    expect(estadoDelGrupo(codigosDeOpcion(PEDIDOS), resultado)).toBe('parcial');
    expect(alternarPermiso('rest.pedido.anular', resultado).has('rest.pedido.anular')).toBe(true);
  });
});
