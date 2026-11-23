import { denominacionDe, esDocumentoDeJuridica, inicialesDe, inicialesDeTexto, nombreCompletoDe } from './denominacion';

const JUANA = { nombres: 'Juana', apellidoPaterno: 'Quispe', apellidoMaterno: 'Mamani', razonSocial: null };
const SIN_MATERNO = { nombres: 'John', apellidoPaterno: 'Smith', apellidoMaterno: null, razonSocial: null };
const MISTI = { nombres: null, apellidoPaterno: null, apellidoMaterno: null, razonSocial: 'Inversiones Misti E.I.R.L.' };

describe('denominación', () => {
  it('natural «apellidos, nombres»; jurídica, la razón social', () => {
    expect(denominacionDe(JUANA)).toBe('Quispe Mamani, Juana');
    expect(denominacionDe(SIN_MATERNO)).toBe('Smith, John');
    expect(denominacionDe(MISTI)).toBe('Inversiones Misti E.I.R.L.');
  });

  it('nombre completo en orden de lectura', () => {
    expect(nombreCompletoDe(JUANA)).toBe('Juana Quispe Mamani');
    expect(nombreCompletoDe(MISTI)).toBe('Inversiones Misti E.I.R.L.');
  });

  it('iniciales para el avatar', () => {
    expect(inicialesDe(JUANA)).toBe('JQ');
    expect(inicialesDe(MISTI)).toBe('IN');
    expect(inicialesDeTexto('Quispe Mamani, Juana')).toBe('JQ');
    expect(inicialesDeTexto('Distribuidora Andina del Sur S.A.C.')).toBe('DI');
  });

  it('el alta deduce JURIDICA para RUC 20… y NATURAL para el resto', () => {
    expect(esDocumentoDeJuridica('RUC', '20554433228')).toBe(true);
    expect(esDocumentoDeJuridica('RUC', '10427890126')).toBe(false);
    expect(esDocumentoDeJuridica('DNI', '20123456')).toBe(false);
    expect(esDocumentoDeJuridica('CE', '001234567')).toBe(false);
    expect(esDocumentoDeJuridica('PASAPORTE', 'AB123456')).toBe(false);
  });
});
