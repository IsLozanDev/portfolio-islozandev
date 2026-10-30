import { rutaDeRetorno, urlDeVuelta } from './navegacion';

describe('rutaDeRetorno', () => {
  it('acepta una ruta interna con su query', () => {
    expect(rutaDeRetorno('/caja?turno=1', '/')).toBe('/caja?turno=1');
  });

  it.each([
    ['sin valor', null],
    ['vacío', ''],
    ['URL absoluta', 'https://otro.sitio/caja'],
    ['esquema javascript', 'javascript:alert(1)'],
    ['protocolo relativo', '//otro.sitio'],
    ['barra invertida', '/\\otro.sitio'],
    ['ruta relativa', 'caja'],
  ])('con %s devuelve la ruta por defecto', (_caso, valor) => {
    expect(rutaDeRetorno(valor, '/')).toBe('/');
  });
});

describe('urlDeVuelta (U-06)', () => {
  const ORIGENES = ['http://consola.vitrina.test:4201'];

  it('acepta una URL absoluta de un origen de la lista, con su ruta y su query', () => {
    expect(urlDeVuelta('http://consola.vitrina.test:4201/consola/tenants?estado=ACTIVO', ORIGENES)).toBe('http://consola.vitrina.test:4201/consola/tenants?estado=ACTIVO');
  });

  it.each([
    ['sin valor', null],
    ['vacío', ''],
    ['otro sitio', 'https://malo.test'],
    ['esquema javascript', 'javascript:alert(1)'],
    ['sin esquema', '//consola.vitrina.test:4201'],
    ['ruta relativa', '/consola/tenants'],
    ['otro puerto', 'http://consola.vitrina.test:4202/consola'],
    ['otro esquema del mismo host', 'https://consola.vitrina.test:4201/consola'],
    ['subdominio parecido', 'http://consola.vitrina.test.malo.test:4201/'],
  ])('rechaza %s', (_caso, valor) => {
    expect(urlDeVuelta(valor, ORIGENES)).toBeNull();
  });

  it('sin orígenes permitidos nunca hay vuelta', () => {
    expect(urlDeVuelta('http://consola.vitrina.test:4201/', [])).toBeNull();
  });
});
