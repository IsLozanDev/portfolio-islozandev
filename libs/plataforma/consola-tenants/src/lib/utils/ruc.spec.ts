import { validarRuc } from './ruc';

describe('validarRuc (copia de shared/util)', () => {
  it.each(['20601234565', '20512345671', '20498765433'])('%s es válido', (ruc) => {
    expect(validarRuc(ruc)).toBe(true);
  });

  it.each(['20601234560', '20601234561', '2060123456', '30601234565', '2060123456a'])('%s no es válido', (ruc) => {
    expect(validarRuc(ruc)).toBe(false);
  });
});
