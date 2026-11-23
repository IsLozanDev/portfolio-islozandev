import { clasificarEntrada } from './clasificar-entrada';

describe('clasificarEntrada', () => {
  it('vacío o solo espacios → VACIA', () => {
    expect(clasificarEntrada('')).toEqual({ clase: 'VACIA' });
    expect(clasificarEntrada('   ')).toEqual({ clase: 'VACIA' });
  });

  it('en Auto, 8 dígitos son DNI y 11 dígitos válidos son RUC', () => {
    expect(clasificarEntrada('45781236')).toEqual({ clase: 'DOCUMENTO', tipo: 'DNI', numero: '45781236' });
    expect(clasificarEntrada('20100070970')).toEqual({ clase: 'DOCUMENTO', tipo: 'RUC', numero: '20100070970' });
    expect(clasificarEntrada('4578 1236')).toEqual({ clase: 'DOCUMENTO', tipo: 'DNI', numero: '45781236' });
  });

  it('un RUC con mal dígito verificador es INVALIDA con su motivo, sin llamar a la API', () => {
    expect(clasificarEntrada('20100070971')).toEqual({
      clase: 'INVALIDA',
      tipo: 'RUC',
      motivo: 'DIGITO_VERIFICADOR',
      mensaje: 'El RUC no es válido: revisa el dígito verificador',
    });
    expect(clasificarEntrada('30100070970')).toMatchObject({ clase: 'INVALIDA', motivo: 'PREFIJO' });
  });

  it('otros dígitos, desde 4, son NUMERO; menos, CORTA', () => {
    expect(clasificarEntrada('98765')).toEqual({ clase: 'NUMERO', valor: '98765' });
    expect(clasificarEntrada('987-654-321')).toEqual({ clase: 'NUMERO', valor: '987654321' });
    expect(clasificarEntrada('123')).toEqual({ clase: 'CORTA', mensaje: 'Escribe al menos 4 dígitos' });
  });

  it('con @ es CORREO en minúsculas', () => {
    expect(clasificarEntrada('Ana@')).toEqual({ clase: 'CORREO', valor: 'ana@' });
    expect(clasificarEntrada('a@')).toEqual({ clase: 'CORTA', mensaje: 'Escribe al menos 3 caracteres' });
  });

  it('el resto es TEXTO desde 3 letras', () => {
    expect(clasificarEntrada('Quíspe')).toEqual({ clase: 'TEXTO', valor: 'Quíspe' });
    expect(clasificarEntrada('ju')).toEqual({ clase: 'CORTA', mensaje: 'Escribe al menos 3 letras' });
  });

  it('con un tipo elegido manda el tipo', () => {
    expect(clasificarEntrada('001234567', 'CE')).toEqual({ clase: 'DOCUMENTO', tipo: 'CE', numero: '001234567' });
    expect(clasificarEntrada('ab123456', 'PASAPORTE')).toEqual({ clase: 'DOCUMENTO', tipo: 'PASAPORTE', numero: 'AB123456' });
    expect(clasificarEntrada('4578', 'DNI')).toEqual({ clase: 'CORTA', mensaje: 'El DNI tiene 8 dígitos' });
    expect(clasificarEntrada('4578123A', 'DNI')).toMatchObject({ clase: 'INVALIDA', motivo: 'CARACTERES', mensaje: 'El DNI solo lleva dígitos' });
    expect(clasificarEntrada('457812361', 'DNI')).toMatchObject({ clase: 'INVALIDA', motivo: 'LONGITUD' });
    expect(clasificarEntrada('001-234', 'CE')).toEqual({ clase: 'DOCUMENTO', tipo: 'CE', numero: '001234' });
  });
});
