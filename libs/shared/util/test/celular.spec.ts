import { validarCelular } from '../src/celular.js';

describe('validarCelular', () => {
  it('TR-CA-106: acepta 987654321', () => {
    expect(validarCelular('987654321')).toBe(true);
  });

  it('TR-CA-106: rechaza 51987654', () => {
    expect(validarCelular('51987654')).toBe(false);
  });

  it.each([
    ['no inicia con 9', '887654321'],
    ['8 dígitos', '98765432'],
    ['10 dígitos', '9876543210'],
    ['con prefijo de país', '+51987654321'],
    ['con letras', '98765432A'],
    ['con espacios', '987 654 321'],
    ['vacío', ''],
  ])('rechaza %s', (_caso, celular) => {
    expect(validarCelular(celular)).toBe(false);
  });
});
