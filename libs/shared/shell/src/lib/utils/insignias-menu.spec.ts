import type { NodoMenu } from '../models/nodo-menu';
import { horaEnLima } from './hora-lima';
import { insigniaDe } from './insignias-menu';

const hoja = (codigo: string): NodoMenu => ({ codigo, nombre: codigo, ruta: `/${codigo}`, icono: 'circle', hijos: [] });
const SEGURIDAD: NodoMenu = {
  codigo: 'plat.seguridad',
  nombre: 'Seguridad',
  ruta: null,
  icono: 'admin_panel_settings',
  hijos: [hoja('plat.seguridad.usuarios'), hoja('plat.seguridad.soporte')],
};

describe('insigniaDe', () => {
  it('una hoja muestra la suya y un grupo la suma de su subárbol', () => {
    const insignias = { 'plat.seguridad.soporte': 3 };
    expect(insigniaDe(hoja('plat.seguridad.soporte'), insignias)).toBe(3);
    expect(insigniaDe(hoja('plat.seguridad.usuarios'), insignias)).toBe(0);
    expect(insigniaDe(SEGURIDAD, insignias)).toBe(3);
  });

  it('sin insignias todo es 0', () => {
    expect(insigniaDe(SEGURIDAD, {})).toBe(0);
  });
});

describe('horaEnLima', () => {
  it('muestra la hora de Lima en 24 h, sin importar la zona del navegador', () => {
    expect(horaEnLima(new Date('2026-11-04T21:30:00Z'))).toBe('16:30');
    expect(horaEnLima(new Date('2026-11-04T05:05:00Z'))).toBe('00:05');
  });
});
