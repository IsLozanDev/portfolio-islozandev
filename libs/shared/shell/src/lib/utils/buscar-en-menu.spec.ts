import type { NodoMenu } from '../models/nodo-menu';
import { buscarCoincidencia, buscarEnMenu, gruposDeRuta, normalizarTexto } from './buscar-en-menu';

function hoja(codigo: string, nombre: string, ruta: string, icono = 'circle'): NodoMenu {
  return { codigo, nombre, ruta, icono, hijos: [] };
}

function grupo(codigo: string, nombre: string, hijos: NodoMenu[], icono = 'folder'): NodoMenu {
  return { codigo, nombre, ruta: null, icono, hijos };
}

const arbol: NodoMenu[] = [
  hoja('inicio', 'Inicio', '/', 'home'),
  hoja('caja', 'Caja', '/caja', 'point_of_sale'),
  grupo(
    'ventas',
    'Ventas',
    [hoja('pedidos', 'Pedidos', '/ventas/pedidos'), grupo('comprobantes', 'Comprobantes', [hoja('boletas', 'Boletas', '/ventas/comprobantes/boletas'), hoja('cajas-cerradas', 'Cierres de caja', '/ventas/comprobantes/cierres')])],
    'receipt_long',
  ),
  grupo('salon', 'Salón', [hoja('mesas', 'Mesas', '/salon/mesas'), hoja('reservas', 'Reservas', '/salon/reservas')], 'table_restaurant'),
];

const codigos = (consulta: string) => buscarEnMenu(arbol, consulta).map((resultado) => resultado.codigo);

describe('normalizarTexto', () => {
  it('quita tildes y pasa a minúsculas', () => {
    expect(normalizarTexto('Salón Ñandú')).toBe('salon nandu');
  });

  it('conserva la longitud de un texto en NFC', () => {
    const texto = 'Configuración de órdenes';
    expect(normalizarTexto(texto)).toHaveLength(texto.length);
  });
});

describe('buscarEnMenu', () => {
  it('con consulta vacía o solo espacios no devuelve nada', () => {
    expect(buscarEnMenu(arbol, '')).toEqual([]);
    expect(buscarEnMenu(arbol, '   ')).toEqual([]);
  });

  it('no distingue tildes ni mayúsculas', () => {
    expect(codigos('SALON')).toEqual(['mesas', 'reservas']);
    expect(codigos('salón')).toEqual(['mesas', 'reservas']);
  });

  it('marca la coincidencia en el nombre', () => {
    const [resultado] = buscarEnMenu(arbol, ' bol ');
    expect(resultado).toEqual({
      codigo: 'boletas',
      nombre: 'Boletas',
      ruta: '/ventas/comprobantes/boletas',
      icono: 'receipt_long',
      grupos: ['Ventas', 'Comprobantes'],
      coincidencia: { inicio: 0, fin: 3 },
    });
  });

  it('una coincidencia por grupo no marca el nombre', () => {
    const [mesas] = buscarEnMenu(arbol, 'salon');
    expect(mesas.coincidencia).toBeNull();
    expect(mesas.grupos).toEqual(['Salón']);
    expect(mesas.icono).toBe('table_restaurant');
  });

  it('conserva el orden del árbol, con hojas y grupos que coinciden', () => {
    expect(codigos('caja')).toEqual(['caja', 'cajas-cerradas']);
  });

  it('recorre un árbol de tres niveles', () => {
    expect(codigos('comprobantes')).toEqual(['boletas', 'cajas-cerradas']);
    expect(buscarEnMenu(arbol, 'cierres')[0].grupos).toEqual(['Ventas', 'Comprobantes']);
  });

  it('un nodo de primer nivel con ruta usa su icono y no tiene grupos', () => {
    const [caja] = buscarEnMenu(arbol, 'caja');
    expect(caja).toMatchObject({ icono: 'point_of_sale', grupos: [], coincidencia: { inicio: 0, fin: 4 } });
  });

  it('un nombre en NFD se devuelve en NFC con índices válidos', () => {
    const nombreNfd = 'Configuración'.normalize('NFD');
    const [resultado] = buscarEnMenu([hoja('config', nombreNfd, '/config')], 'racion');
    expect(resultado.nombre).toBe('Configuración'.normalize('NFC'));
    const { inicio, fin } = resultado.coincidencia ?? { inicio: 0, fin: 0 };
    expect(resultado.nombre.slice(inicio, fin)).toBe('ración');
  });

  it('sin coincidencias devuelve vacío', () => {
    expect(buscarEnMenu(arbol, 'zzz')).toEqual([]);
  });
});

describe('buscarCoincidencia', () => {
  it('ubica la consulta sin tildes ni mayúsculas', () => {
    expect(buscarCoincidencia('Ventas › Salón', ' SALON ')).toEqual({ inicio: 9, fin: 14 });
  });

  it('sin consulta o sin coincidencia devuelve null', () => {
    expect(buscarCoincidencia('Salón', '  ')).toBeNull();
    expect(buscarCoincidencia('Salón', 'caja')).toBeNull();
  });
});

describe('gruposDeRuta', () => {
  it('devuelve los ancestros del nodo activo', () => {
    expect([...gruposDeRuta(arbol, '/ventas/comprobantes/boletas')]).toEqual(['ventas', 'comprobantes']);
  });

  it('una subruta activa el nodo y se ignoran consulta y fragmento', () => {
    expect([...gruposDeRuta(arbol, '/salon/mesas/12?vista=plano#detalle')]).toEqual(['salon']);
  });

  it('la raíz solo está activa en sí misma', () => {
    const conRaizEnGrupo = [grupo('general', 'General', [hoja('inicio', 'Inicio', '/')])];
    expect([...gruposDeRuta(conRaizEnGrupo, '/')]).toEqual(['general']);
    expect([...gruposDeRuta(conRaizEnGrupo, '/caja')]).toEqual([]);
  });

  it('un prefijo sin barra no activa el nodo', () => {
    expect([...gruposDeRuta(arbol, '/salon/mesas-extra')]).toEqual([]);
  });

  it('un nodo de primer nivel activo no expande grupos', () => {
    expect([...gruposDeRuta(arbol, '/caja')]).toEqual([]);
  });
});
