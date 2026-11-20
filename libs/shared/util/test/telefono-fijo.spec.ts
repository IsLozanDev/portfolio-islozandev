import { validarTelefonoFijo } from '../src/telefono-fijo.js';

describe('validarTelefonoFijo', () => {
  it.each(['054234567', '234567', '014567890'])('acepta %s', (fijo) => {
    expect(validarTelefonoFijo(fijo)).toBe(true);
  });

  it.each([
    ['5 dígitos', '12345'],
    ['10 dígitos', '0542345678'],
    ['con guion', '054-234567'],
    ['con espacios', '054 234567'],
    ['con letras', '05423456A'],
    ['vacío', ''],
  ])('rechaza %s', (_caso, fijo) => {
    expect(validarTelefonoFijo(fijo)).toBe(false);
  });
});
