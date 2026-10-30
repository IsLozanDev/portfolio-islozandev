import { validarRuc } from './ruc';

describe('validarRuc (copia de shared/util)', () => {
  it.each(['20512345671', '20498765433', '20601234565'])('%s es válido', (ruc) => {
    expect(validarRuc(ruc)).toBe(true);
  });

  // 20512345678 es el RUC del SRS (TR-CA-004): no pasa el módulo 11.
  it.each(['20512345678', '20601234560', '2051234567', '30512345671', '2051234567a'])('%s no es válido', (ruc) => {
    expect(validarRuc(ruc)).toBe(false);
  });
});
