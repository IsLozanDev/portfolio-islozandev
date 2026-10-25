import { ValidadorEsquemaAjv } from '../src/infrastructure/ajv/validador-esquema.ajv.js';

const ajv = new ValidadorEsquemaAjv();

describe('ValidadorEsquemaAjv: subconjunto soportado', () => {
  it('acepta las palabras clave permitidas, también anidadas', () => {
    expect(ajv.soporta({ minimum: 0, maximum: 20 })).toEqual([]);
    expect(ajv.soporta({ type: 'object', required: ['a'], properties: { a: { type: 'string', pattern: '^[A-Z]+$' } } })).toEqual([]);
    expect(ajv.soporta({ type: 'array', items: { enum: [1, 2] } })).toEqual([]);
  });

  it('lista las no soportadas con su ruta', () => {
    expect(ajv.soporta({ minimum: 0, multipleOf: 5, properties: { a: { format: 'email' } }, items: { $ref: '#' } })).toEqual([
      'palabra clave no soportada: multipleOf',
      'palabra clave no soportada: properties.a.format',
      'palabra clave no soportada: items.$ref',
    ]);
  });

  it('un esquema mal formado no se soporta', () => {
    expect(ajv.soporta({ minimum: 'cero' })[0]).toMatch(/^esquema mal formado/);
  });
});

describe('ValidadorEsquemaAjv: mensajes en español', () => {
  it.each([
    [{ minimum: 0, maximum: 20 }, 25, 'El valor debe estar entre 0 y 20'],
    [{ minimum: 0, maximum: 20 }, -1, 'El valor debe estar entre 0 y 20'],
    [{ minimum: 5 }, 4, 'El valor debe ser mayor o igual a 5'],
    [{ maximum: 480 }, 500, 'El valor debe ser menor o igual a 480'],
    [{ enum: ['PEN', 'USD'] }, 'EUR', 'El valor debe ser uno de: PEN, USD'],
    [{ pattern: '^[A-Z]{3}$' }, 'pen', 'El valor no tiene el formato esperado'],
    [{ minLength: 2, maxLength: 4 }, 'abcde', 'El texto debe tener entre 2 y 4 caracteres'],
    [{ minLength: 2 }, 'a', 'El texto debe tener al menos 2 caracteres'],
    [{ maxLength: 3 }, 'abcd', 'El texto debe tener como máximo 3 caracteres'],
    [{ type: 'object', required: ['moneda'] }, {}, 'Falta la propiedad moneda'],
    [{ type: 'object', properties: { mesas: { minimum: 1 } } }, { mesas: 0 }, 'El valor en /mesas debe ser mayor o igual a 1'],
    [{ type: 'array' }, { a: 1 }, 'El valor no cumple el esquema (type)'],
  ])('%j con %j', (esquema, valor, esperado) => {
    expect(ajv.validar(esquema, valor)).toBe(esperado);
  });

  it('devuelve null si cumple', () => {
    expect(ajv.validar({ minimum: 0, maximum: 20 }, 20)).toBeNull();
  });
});
