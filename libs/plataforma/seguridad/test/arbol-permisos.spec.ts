import { armarArbolPermisos } from '../src/application/arbol-permisos.js';
import type { ElementoDelMenu, FilaCatalogo, PermisoDelCatalogo } from '../src/application/ports/lectura-roles.js';

const permiso = (codigo: string, sensible = false): PermisoDelCatalogo => ({ codigo, descripcion: `Descripción de ${codigo}`, sensible, alcanceMinimo: 'UNIDAD' });
const menu = (codigo: string, orden: number): ElementoDelMenu => ({ codigo, nombre: codigo.toUpperCase(), orden });

const SALON = menu('salon', 1);
const CAJA = menu('caja', 2);
const PEDIDOS = menu('rest.salon.pedidos', 1);
const MESAS = menu('rest.salon.mesas', 2);
const CIERRE = menu('rest.caja.cierre', 1);

const fila = (codigo: string, modulo: ElementoDelMenu | null, opcion: ElementoDelMenu | null, sensible = false): FilaCatalogo => ({
  permiso: permiso(codigo, sensible),
  modulo,
  opcion,
});

describe('armarArbolPermisos (spec 16b)', () => {
  it('agrupa módulo → opción → permiso, ordenados por orden y código', () => {
    const arbol = armarArbolPermisos('REST', [
      fila('rest.caja.cerrar', CAJA, CIERRE),
      fila('rest.pedido.tomar', SALON, PEDIDOS),
      fila('rest.pedido.anular', SALON, PEDIDOS, true),
      fila('rest.mesa.ver', SALON, MESAS),
    ]);

    expect(arbol).toEqual({
      productoCodigo: 'REST',
      modulos: [
        {
          codigo: 'salon',
          nombre: 'SALON',
          opciones: [
            { codigo: 'rest.salon.pedidos', nombre: 'REST.SALON.PEDIDOS', permisos: [permiso('rest.pedido.anular', true), permiso('rest.pedido.tomar')] },
            { codigo: 'rest.salon.mesas', nombre: 'REST.SALON.MESAS', permisos: [permiso('rest.mesa.ver')] },
          ],
        },
        { codigo: 'caja', nombre: 'CAJA', opciones: [{ codigo: 'rest.caja.cierre', nombre: 'REST.CAJA.CIERRE', permisos: [permiso('rest.caja.cerrar')] }] },
      ],
      otros: [],
    });
  });

  it('un permiso en dos opciones aparece solo en la primera por orden de módulo y de opción', () => {
    const arbol = armarArbolPermisos('REST', [fila('rest.pedido.tomar', CAJA, CIERRE), fila('rest.pedido.tomar', SALON, MESAS), fila('rest.pedido.tomar', SALON, PEDIDOS)]);

    expect(arbol.modulos).toEqual([{ codigo: 'salon', nombre: 'SALON', opciones: [{ codigo: 'rest.salon.pedidos', nombre: 'REST.SALON.PEDIDOS', permisos: [permiso('rest.pedido.tomar')] }] }]);
  });

  it('con el mismo orden decide el código de la opción', () => {
    const arbol = armarArbolPermisos('REST', [fila('rest.pedido.tomar', SALON, menu('rest.salon.zeta', 1)), fila('rest.pedido.tomar', SALON, menu('rest.salon.alfa', 1))]);

    expect(arbol.modulos[0].opciones.map((opcion) => opcion.codigo)).toEqual(['rest.salon.alfa']);
  });

  it('los permisos sin opción van a otros, y no ahí si además tienen una opción vigente', () => {
    const arbol = armarArbolPermisos('REST', [
      fila('rest.reporte.ver', null, null),
      fila('rest.carta.ver', null, null),
      fila('rest.mesa.ver', null, null),
      fila('rest.mesa.ver', SALON, MESAS),
    ]);

    expect(arbol.otros).toEqual([permiso('rest.carta.ver'), permiso('rest.reporte.ver')]);
    expect(arbol.modulos[0].opciones[0].permisos).toEqual([permiso('rest.mesa.ver')]);
  });

  it('sin filas no hay módulos ni otros', () => {
    expect(armarArbolPermisos('GYM', [])).toEqual({ productoCodigo: 'GYM', modulos: [], otros: [] });
  });
});
