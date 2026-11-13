import { rutasRedactadas, TEXTO_REDACTADO, valorCensurado } from '../src/domain/campos-redactados.js';
import { hashDocumento } from '../src/domain/hash-documento.js';

const SAL = 'sal-de-plataforma-de-prueba-0123456789';
const DNI = '45678912';

describe('hashDocumento (TR-RNF-111)', () => {
  test('el mismo número con la misma sal da el mismo hash', () => {
    expect(hashDocumento(DNI, SAL)).toBe(hashDocumento(DNI, SAL));
  });

  test('con otra sal el hash cambia', () => {
    expect(hashDocumento(DNI, SAL)).not.toBe(hashDocumento(DNI, 'otra-sal-de-plataforma-0123456789'));
  });

  test('el resultado no contiene el número y es SHA-256 hex', () => {
    const hash = hashDocumento(DNI, SAL);
    expect(hash).not.toContain(DNI);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('rutasRedactadas', () => {
  test('cubre cada campo en la raíz y hasta dos niveles de anidación', () => {
    const rutas = rutasRedactadas();
    expect(rutas).toEqual(expect.arrayContaining(['password', '*.password', '*.*.password', '*.*.dni']));
  });

  test('los nombres con guion van entre corchetes', () => {
    expect(rutasRedactadas()).toEqual(expect.arrayContaining(['["set-cookie"]', '*.*["set-cookie"]']));
  });
});

describe('valorCensurado', () => {
  test('un documento sale como su hash', () => {
    expect(valorCensurado(DNI, ['usuario', 'dni'], SAL)).toBe(hashDocumento(DNI, SAL));
    expect(valorCensurado(20123456789, ['ruc'], SAL)).toBe(hashDocumento('20123456789', SAL));
  });

  test('un campo sensible que no es documento sale redactado', () => {
    expect(valorCensurado('secreto', ['req', 'password'], SAL)).toBe(TEXTO_REDACTADO);
  });

  test('un documento que no es texto ni número sale redactado', () => {
    expect(valorCensurado({ numero: DNI }, ['documento'], SAL)).toBe(TEXTO_REDACTADO);
  });
});
