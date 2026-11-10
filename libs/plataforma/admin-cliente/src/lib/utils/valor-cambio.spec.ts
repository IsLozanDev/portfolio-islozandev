import { textoDeValor } from './valor-cambio';

describe('textoDeValor (spec 20c)', () => {
  it.each([
    ['null', null, '—'],
    ['undefined', undefined, '—'],
    ['texto', 'ANULADA', 'ANULADA'],
    ['número', 86.5, '86.5'],
    ['cero', 0, '0'],
    ['booleano', false, 'false'],
    ['objeto', { medio: 'EFECTIVO' }, '{"medio":"EFECTIVO"}'],
    ['arreglo', [1, 2], '[1,2]'],
  ])('%s', (_caso, valor, esperado) => {
    expect(textoDeValor(valor)).toBe(esperado);
  });
});
