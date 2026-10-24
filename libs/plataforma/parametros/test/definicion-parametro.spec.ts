import { ValidationError } from '@vitrina/plataforma/kernel';
import { CodigoParametro } from '../src/domain/codigo-parametro.js';
import { DefinicionParametro, type DatosDefinicion } from '../src/domain/definicion-parametro.js';
import { AlcanceNoPermitidoError, AmbitoValorInvalidoError, DefinicionInvalidaError, ValorInvalidoError } from '../src/domain/errores.js';
import { ambitoValor } from '../src/domain/tipos.js';
import { ValidadorEsquemaAjv } from '../src/infrastructure/ajv/validador-esquema.ajv.js';

const esquemas = new ValidadorEsquemaAjv();

const propina = (cambios: Partial<DatosDefinicion> = {}): DatosDefinicion => ({
  codigo: 'rest.propina.porcentaje',
  productoCodigo: 'REST',
  descripcion: 'Porcentaje de propina sugerida',
  tipo: 'NUMERO',
  valorDefecto: 10,
  alcanceMaximo: 'SUCURSAL',
  esquema: { minimum: 0, maximum: 20 },
  ...cambios,
});

const detallesDe = (accion: () => unknown): readonly string[] => {
  try {
    accion();
  } catch (error) {
    if (error instanceof DefinicionInvalidaError) return error.detalles;
    throw error;
  }
  throw new Error('no falló');
};

describe('CodigoParametro', () => {
  it('acepta producto.ambito.nombre con el prefijo del producto', () => {
    expect(CodigoParametro.de('plat.sesion.minutos_inactividad', 'PLAT').valor).toBe('plat.sesion.minutos_inactividad');
  });

  it.each(['rest-propina-porcentaje', 'rest.propina', 'Rest.propina.porcentaje', `rest.propina.${'x'.repeat(80)}`])('rechaza %s', (codigo) => {
    expect(() => CodigoParametro.de(codigo, 'REST')).toThrow(ValidationError);
  });

  it('rechaza el prefijo de otro producto', () => {
    expect(() => CodigoParametro.de('plat.propina.porcentaje', 'REST')).toThrow('no pertenece al producto REST');
  });
});

describe('DefinicionParametro.crear (TR-RF-030, TR-RN-015)', () => {
  it('TR-CA-078: propina NUMERO con defecto 10 y alcance máximo SUCURSAL', () => {
    const definicion = DefinicionParametro.crear(propina(), esquemas);
    expect(definicion.alcanceMaximo).toBe('SUCURSAL');
    expect(definicion.valorDefecto).toBe(10);
    expect(definicion.obsoleto).toBe(false);
  });

  it('TR-CA-079: defecto «treinta» en NUMERO indica el tipo esperado', () => {
    const datos = propina({ codigo: 'plat.sesion.minutos_inactividad', productoCodigo: 'PLAT', valorDefecto: 'treinta', esquema: null });
    expect(detallesDe(() => DefinicionParametro.crear(datos, esquemas))).toEqual(['valor_defecto: Se esperaba un valor NUMERO']);
  });

  it('un defecto fuera del esquema rechaza la definición', () => {
    expect(detallesDe(() => DefinicionParametro.crear(propina({ valorDefecto: 25 }), esquemas))).toEqual([
      'valor_defecto: El valor debe estar entre 0 y 20',
    ]);
  });

  it('una palabra clave no soportada rechaza la definición', () => {
    const datos = propina({ esquema: { minimum: 0, multipleOf: 5 } });
    expect(detallesDe(() => DefinicionParametro.crear(datos, esquemas))).toEqual(['esquema: palabra clave no soportada: multipleOf']);
  });

  it('junta todos los errores', () => {
    const datos = propina({ codigo: 'plat.propina.x', descripcion: 'ab', tipo: 'FECHA' as never, alcanceMaximo: 'UNIDAD' as never });
    const detalles = detallesDe(() => DefinicionParametro.crear(datos, esquemas));
    expect(detalles).toHaveLength(4);
    expect(detalles.map((detalle) => detalle.split(':')[0])).toEqual(['codigo', 'descripcion', 'tipo', 'alcance_maximo']);
  });

  it('recorta la descripción', () => {
    expect(DefinicionParametro.crear(propina({ descripcion: '  Propina  ' }), esquemas).descripcion).toBe('Propina');
  });
});

describe('DefinicionParametro.validarValor por tipo', () => {
  const definicionDe = (tipo: DatosDefinicion['tipo'], valorDefecto: unknown) =>
    DefinicionParametro.crear(propina({ tipo, valorDefecto, esquema: null }), esquemas);

  it.each([
    ['TEXTO', 'PEN', 'hola', 5],
    ['NUMERO', 1, 2.5, '2'],
    ['BOOLEANO', true, false, 'true'],
    ['JSON', { a: 1 }, [1, 2], 'x'],
  ] as const)('%s acepta su tipo y rechaza otro', (tipo, defecto, valido, invalido) => {
    const definicion = definicionDe(tipo, defecto);
    expect(() => definicion.validarValor(valido, esquemas)).not.toThrow();
    expect(() => definicion.validarValor(invalido, esquemas)).toThrow(new ValorInvalidoError(`Se esperaba un valor ${tipo}`));
  });

  it('NUMERO rechaza NaN e infinito; JSON rechaza null', () => {
    expect(() => definicionDe('NUMERO', 1).validarValor(Number.NaN, esquemas)).toThrow(ValorInvalidoError);
    expect(() => definicionDe('NUMERO', 1).validarValor(Number.POSITIVE_INFINITY, esquemas)).toThrow(ValorInvalidoError);
    expect(() => definicionDe('JSON', {}).validarValor(null, esquemas)).toThrow(ValorInvalidoError);
  });

  it('TR-CA-082: 25 con rango 0 a 20', () => {
    const definicion = DefinicionParametro.crear(propina(), esquemas);
    expect(() => definicion.validarValor(25, esquemas)).toThrow(new ValorInvalidoError('El valor debe estar entre 0 y 20'));
    expect(() => definicion.validarValor(0, esquemas)).not.toThrow();
  });
});

describe('DefinicionParametro.admite (TR-RN-014)', () => {
  it('TR-CA-081: máximo EMPRESA rechaza SUCURSAL', () => {
    const moneda = DefinicionParametro.crear(
      propina({ codigo: 'plat.factura.moneda_defecto', productoCodigo: 'PLAT', tipo: 'TEXTO', valorDefecto: 'PEN', alcanceMaximo: 'EMPRESA', esquema: null }),
      esquemas,
    );
    expect(() => moneda.admite('SUCURSAL')).toThrow(new AlcanceNoPermitidoError('EMPRESA'));
    expect(() => moneda.admite('SUCURSAL')).toThrow('Este parámetro se configura como máximo a nivel de empresa');
    expect(() => moneda.admite('EMPRESA')).not.toThrow();
    expect(() => moneda.admite('TENANT')).not.toThrow();
  });

  it('máximo TENANT solo admite TENANT', () => {
    const definicion = DefinicionParametro.crear(propina({ alcanceMaximo: 'TENANT' }), esquemas);
    expect(() => definicion.admite('EMPRESA')).toThrow('a nivel de tenant');
  });
});

describe('DefinicionParametro.difiereDe', () => {
  const base = DefinicionParametro.crear(propina(), esquemas);

  it('igual con el esquema en otro orden de claves', () => {
    expect(base.difiereDe(DefinicionParametro.crear(propina({ esquema: { maximum: 20, minimum: 0 } }), esquemas))).toBe(false);
  });

  it.each([
    ['descripcion', { descripcion: 'Otra descripción' }],
    ['defecto', { valorDefecto: 12 }],
    ['alcance máximo', { alcanceMaximo: 'EMPRESA' as const }],
    ['esquema', { esquema: { minimum: 0, maximum: 30 } }],
  ])('distinta por %s', (_campo, cambios) => {
    expect(base.difiereDe(DefinicionParametro.crear(propina(cambios), esquemas))).toBe(true);
  });
});

describe('ambitoValor', () => {
  const SUCURSAL = '0193f3a0-0000-7000-8000-000000000101';
  it('acepta los ámbitos coherentes', () => {
    expect(ambitoValor('TENANT')).toEqual({ alcance: 'TENANT', empresaId: null, sucursalId: null });
    expect(ambitoValor('SUCURSAL', null, SUCURSAL).sucursalId).toBe(SUCURSAL);
  });

  it.each([
    ['TENANT', SUCURSAL, null],
    ['EMPRESA', null, null],
    ['SUCURSAL', SUCURSAL, SUCURSAL],
  ] as const)('rechaza %s con empresa %s y sucursal %s', (alcance, empresa, sucursal) => {
    expect(() => ambitoValor(alcance, empresa, sucursal)).toThrow(AmbitoValorInvalidoError);
  });
});
