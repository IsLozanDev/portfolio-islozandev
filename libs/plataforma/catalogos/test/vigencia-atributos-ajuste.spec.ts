import { AjusteItem } from '../src/domain/ajuste-item.js';
import { mismosAtributos, validarAtributos } from '../src/domain/atributos-item.js';
import { ItemInvalidoError } from '../src/domain/errores.js';
import { Vigencia } from '../src/domain/vigencia.js';

const mensajeDe = (accion: () => unknown): string => {
  try {
    accion();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('no falló');
};

describe('Vigencia', () => {
  const anio2026 = Vigencia.de('2026-01-01', '2026-12-31');

  it('es inclusiva en ambos extremos', () => {
    expect(anio2026.incluye('2026-01-01')).toBe(true);
    expect(anio2026.incluye('2026-12-31')).toBe(true);
    expect(anio2026.incluye('2025-12-31')).toBe(false);
    expect(anio2026.incluye('2027-01-01')).toBe(false);
  });

  it('TR-CA-062: desde 2027-01-01 no incluye el 2026-10-10 y sí el 2027-01-01', () => {
    const futura = Vigencia.de('2027-01-01', null);
    expect(futura.incluye('2026-10-10')).toBe(false);
    expect(futura.incluye('2027-01-01')).toBe(true);
    expect(futura.incluye('2099-01-01')).toBe(true);
  });

  it('un solo día es válido', () => {
    expect(Vigencia.de('2026-05-01', '2026-05-01').incluye('2026-05-01')).toBe(true);
  });

  it('rechaza un fin anterior al inicio', () => {
    expect(mensajeDe(() => Vigencia.de('2026-05-02', '2026-05-01'))).toBe('La vigencia final no puede ser anterior a la inicial');
  });

  it.each(['2026-02-30', '2026-1-1', 'mañana'])('rechaza la fecha inicial %s', (desde) => {
    expect(mensajeDe(() => Vigencia.de(desde, null))).toBe('La vigencia inicial no es una fecha válida');
  });

  it('rechaza una fecha final inválida', () => {
    expect(mensajeDe(() => Vigencia.de('2026-01-01', '2026-13-01'))).toBe('La vigencia final no es una fecha válida');
  });

  it('igualA compara inicio y fin', () => {
    expect(anio2026.igualA(Vigencia.de('2026-01-01', '2026-12-31'))).toBe(true);
    expect(anio2026.igualA(Vigencia.de('2026-01-01', null))).toBe(false);
  });
});

describe('validarAtributos', () => {
  it('TR-CA-060: conserva las claves conocidas y las demás', () => {
    expect(validarAtributos({ longitud: 8, regex: '^[0-9]{8}$', valida_reniec: true, mascara: '########', color: 'azul' })).toEqual({
      longitud: 8,
      regex: '^[0-9]{8}$',
      valida_reniec: true,
      mascara: '########',
      color: 'azul',
    });
  });

  it('un objeto vacío es válido', () => {
    expect(validarAtributos({})).toEqual({});
  });

  it.each([
    ['un arreglo', [], 'Los atributos deben ser un objeto JSON'],
    ['null', null, 'Los atributos deben ser un objeto JSON'],
    ['longitud 0', { longitud: 0 }, 'El atributo longitud debe ser un entero de 1 a 100'],
    ['longitud 101', { longitud: 101 }, 'El atributo longitud debe ser un entero de 1 a 100'],
    ['longitud decimal', { longitud: 8.5 }, 'El atributo longitud debe ser un entero de 1 a 100'],
    ['longitud texto', { longitud: '8' }, 'El atributo longitud debe ser un entero de 1 a 100'],
    ['regex de 201', { regex: 'a'.repeat(201) }, 'El atributo regex debe ser un texto de hasta 200 caracteres'],
    ['regex numérica', { regex: 8 }, 'El atributo regex debe ser un texto de hasta 200 caracteres'],
    ['regex que no compila', { regex: '(abc' }, 'El atributo regex no es una expresión regular válida'],
    ['valida_reniec texto', { valida_reniec: 'si' }, 'El atributo valida_reniec debe ser verdadero o falso'],
    ['mascara de 51', { mascara: '#'.repeat(51) }, 'El atributo mascara debe ser un texto de hasta 50 caracteres'],
    ['más de 4 KB', { notas: 'x'.repeat(4100) }, 'Los atributos no pueden superar 4 KB'],
  ] as const)('rechaza %s', (_caso, atributos, mensaje) => {
    const error = (() => {
      try {
        validarAtributos(atributos);
      } catch (capturado) {
        return capturado as Error;
      }
      throw new Error('no falló');
    })();
    expect(error).toBeInstanceOf(ItemInvalidoError);
    expect(error.message).toBe(mensaje);
  });

  it('admite los límites', () => {
    expect(() => validarAtributos({ longitud: 1, regex: 'a'.repeat(200), mascara: '#'.repeat(50) })).not.toThrow();
    expect(() => validarAtributos({ longitud: 100 })).not.toThrow();
  });

  it('mismosAtributos ignora el orden de las claves, también anidadas', () => {
    expect(mismosAtributos({ a: 1, b: { c: [1, 2], d: 2 } }, { b: { d: 2, c: [1, 2] }, a: 1 })).toBe(true);
    expect(mismosAtributos({ a: 1 }, { a: 2 })).toBe(false);
    expect(mismosAtributos({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});

describe('AjusteItem (TR-RF-025)', () => {
  it('visible sin orden ni alias es neutro', () => {
    expect(AjusteItem.de({ visible: true, orden: null, alias: null }).esNeutro()).toBe(true);
  });

  it.each([
    { visible: false, orden: null, alias: null },
    { visible: true, orden: 0, alias: null },
    { visible: true, orden: null, alias: 'Yape QR' },
  ])('%o no es neutro', (datos) => {
    expect(AjusteItem.de(datos).esNeutro()).toBe(false);
  });

  it.each(['', 'a'.repeat(201)])('rechaza el alias "%s"', (alias) => {
    expect(mensajeDe(() => AjusteItem.de({ visible: true, orden: null, alias }))).toBe('El alias debe tener de 1 a 200 caracteres');
  });

  it('igualA compara los tres campos', () => {
    const oculto = AjusteItem.de({ visible: false, orden: null, alias: null });
    expect(oculto.igualA(AjusteItem.de({ visible: false, orden: null, alias: null }))).toBe(true);
    expect(oculto.igualA(AjusteItem.de({ visible: false, orden: 1, alias: null }))).toBe(false);
  });
});
