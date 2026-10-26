import { rutaDeRetorno } from './navegacion';

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
