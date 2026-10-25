import { NumeroCorrelativo } from '../src/domain/numero-correlativo.js';

describe('NumeroCorrelativo', () => {
  it('TR-CA-093: B002 con 125 en 8 dígitos es B002-00000125', () => {
    const numero = NumeroCorrelativo.de('B002', 125n, 8);
    expect(numero.formateado).toBe('B002-00000125');
    expect(numero).toMatchObject({ serie: 'B002', numero: 125n });
  });

  it('TR-CA-096: A con 1 en 3 dígitos es A-001', () => {
    expect(NumeroCorrelativo.de('A', 1n, 3).formateado).toBe('A-001');
  });

  it('el máximo de 8 dígitos no se recorta', () => {
    expect(NumeroCorrelativo.de('F001', 99_999_999n, 8).formateado).toBe('F001-99999999');
  });
});
