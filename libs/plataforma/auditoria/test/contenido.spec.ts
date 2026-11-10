import { CAMPOS_ENMASCARADOS, enmascararCampos, VALOR_ENMASCARADO } from '../src/domain/enmascarado.js';
import { limitarTamano, TAMANO_MAXIMO_JSON_BYTES } from '../src/domain/tamano.js';

describe('enmascararCampos (TR-RNF-026)', () => {
  it('enmascara las claves por defecto en objetos anidados y arreglos, sin importar mayúsculas', () => {
    const usuario = { nombre: 'Ana', Clave: 's3cr3t', perfil: { DNI: '45879632', contactos: [{ token: 'abc', alias: 'casa' }] } };
    expect(enmascararCampos(usuario, CAMPOS_ENMASCARADOS)).toEqual({
      nombre: 'Ana',
      Clave: VALOR_ENMASCARADO,
      perfil: { DNI: VALOR_ENMASCARADO, contactos: [{ token: VALOR_ENMASCARADO, alias: 'casa' }] },
    });
  });

  it('no muta la entrada', () => {
    const entrada = { password: 'p', anidado: { secret: 's' } };
    const copia = structuredClone(entrada);
    enmascararCampos(entrada, CAMPOS_ENMASCARADOS);
    expect(entrada).toEqual(copia);
  });

  it('enmascara las claves extra de la llamada además de las por defecto', () => {
    const pago = { tarjeta: '4111 1111 1111 1111', clave: '1234', monto: 50 };
    expect(enmascararCampos(pago, [...CAMPOS_ENMASCARADOS, 'tarjeta'])).toEqual({ tarjeta: '***', clave: '***', monto: 50 });
  });

  it('enmascara el valor entero aunque sea un objeto, y deja igual primitivos, null y fechas', () => {
    const fecha = new Date('2026-11-09T10:00:00Z');
    expect(enmascararCampos({ secreto: { a: 1 }, fecha }, CAMPOS_ENMASCARADOS)).toEqual({ secreto: '***', fecha });
    expect(enmascararCampos('texto', CAMPOS_ENMASCARADOS)).toBe('texto');
    expect(enmascararCampos(null, CAMPOS_ENMASCARADOS)).toBeNull();
    expect(enmascararCampos(undefined, CAMPOS_ENMASCARADOS)).toBeUndefined();
  });
});

describe('limitarTamano', () => {
  it('deja igual un JSON de hasta 64 KB', () => {
    const justo = { texto: 'x'.repeat(TAMANO_MAXIMO_JSON_BYTES - '{"texto":""}'.length) };
    expect(limitarTamano(justo)).toBe(justo);
    expect(limitarTamano(undefined)).toBeUndefined();
  });

  it('un JSON de más de 64 KB queda como { _truncado, bytes }, contando bytes UTF-8', () => {
    const grande = { texto: 'ñ'.repeat(TAMANO_MAXIMO_JSON_BYTES / 2) };
    expect(limitarTamano(grande)).toEqual({ _truncado: true, bytes: TAMANO_MAXIMO_JSON_BYTES + '{"texto":""}'.length });
  });
});
