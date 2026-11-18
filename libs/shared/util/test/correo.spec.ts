import { validarCorreo } from '../src/correo.js';

const LONGITUD_MAXIMA = 254;
const DOMINIO = '@vitrina.pe';

describe('validarCorreo', () => {
  it.each(['juana@vitrina.pe', 'juana.quispe+caja@mail.vitrina.pe', 'a@b.co'])('acepta %s', (correo) => {
    expect(validarCorreo(correo)).toBe(true);
  });

  it('acepta un correo de 254 caracteres', () => {
    const correo = 'a'.repeat(LONGITUD_MAXIMA - DOMINIO.length) + DOMINIO;
    expect(validarCorreo(correo)).toBe(true);
  });

  it('rechaza un correo de 255 caracteres', () => {
    const correo = 'a'.repeat(LONGITUD_MAXIMA - DOMINIO.length + 1) + DOMINIO;
    expect(validarCorreo(correo)).toBe(false);
  });

  it.each([
    ['sin arroba', 'juana.vitrina.pe'],
    ['sin dominio de nivel superior', 'juana@vitrina'],
    ['sin parte local', '@vitrina.pe'],
    ['con dos arrobas', 'juana@@vitrina.pe'],
    ['con espacios', 'juana quispe@vitrina.pe'],
    ['vacío', ''],
  ])('rechaza %s', (_caso, correo) => {
    expect(validarCorreo(correo)).toBe(false);
  });
});
