import { validarRuc } from '../src/ruc.js';

describe('validarRuc', () => {
  it.each(['20601234565', '20512345671', '20498765433', '20131312955', '10467793549'])('acepta %s', (ruc) => {
    expect(validarRuc(ruc)).toBe(true);
  });

  it('rechaza un dígito verificador incorrecto (TR-CA-003)', () => {
    expect(validarRuc('20601234560')).toBe(false);
  });

  it('cubre los restos que dan verificador 0 y 1', () => {
    // suma % 11 = 1 → verificador 0; suma % 11 = 0 → verificador 1.
    expect(validarRuc('20000000010')).toBe(true);
    expect(validarRuc('20000000061')).toBe(true);
    expect(validarRuc('20000000011')).toBe(false);
    expect(validarRuc('20000000060')).toBe(false);
  });

  it.each([
    ['prefijo no permitido', '11601234565'],
    ['10 dígitos', '2060123456'],
    ['12 dígitos', '206012345651'],
    ['con letras', '2060123456A'],
    ['con espacios', ' 20601234565'],
    ['vacío', ''],
  ])('rechaza %s', (_caso, ruc) => {
    expect(validarRuc(ruc)).toBe(false);
  });
});
