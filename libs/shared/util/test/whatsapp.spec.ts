import { validarWhatsapp } from '../src/whatsapp.js';

describe('validarWhatsapp', () => {
  it.each(['+51987654321', '+14155552671', '+12345678', '+123456789012345'])('acepta %s', (whatsapp) => {
    expect(validarWhatsapp(whatsapp)).toBe(true);
  });

  it.each([
    ['sin signo más', '987654321'],
    ['código de país que empieza en 0', '+0123456789'],
    ['con espacios', '+51 987 654 321'],
    ['7 dígitos', '+1234567'],
    ['16 dígitos', '+1234567890123456'],
    ['con letras', '+5198765432A'],
    ['vacío', ''],
  ])('rechaza %s', (_caso, whatsapp) => {
    expect(validarWhatsapp(whatsapp)).toBe(false);
  });
});
