import { MENSAJE_VALIDACION_GENERICO, mensajeDeValidacion } from './mensaje-de-validacion';

describe('mensajeDeValidacion', () => {
  it('sin errores devuelve null', () => {
    expect(mensajeDeValidacion(null)).toBeNull();
    expect(mensajeDeValidacion({})).toBeNull();
  });

  it.each([
    [{ required: true }, 'Este campo es obligatorio.'],
    [{ email: true }, 'Ingrese un correo válido.'],
    [{ minlength: { requiredLength: 3, actualLength: 1 } }, 'Ingrese al menos 3 caracteres.'],
    [{ maxlength: { requiredLength: 50, actualLength: 51 } }, 'Ingrese como máximo 50 caracteres.'],
    [{ min: { min: 1, actual: 0 } }, 'El valor mínimo es 1.'],
    [{ max: { max: 99, actual: 100 } }, 'El valor máximo es 99.'],
    [{ pattern: { requiredPattern: '^\\d+$', actualValue: 'a' } }, 'El formato no es válido.'],
  ])('%j → %s', (errores, mensaje) => {
    expect(mensajeDeValidacion(errores)).toBe(mensaje);
  });

  it('usa el primer error', () => {
    expect(mensajeDeValidacion({ required: true, email: true })).toBe('Este campo es obligatorio.');
  });

  it('un validador desconocido da el mensaje genérico', () => {
    expect(mensajeDeValidacion({ rucInvalido: true })).toBe(MENSAJE_VALIDACION_GENERICO);
  });
});
