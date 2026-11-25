import { ErrorPersonas } from '../models/error-personas';
import { resultadoDeOperacion } from './cambios-ficha';

describe('resultadoDeOperacion', () => {
  it('un 409 PERSONA_FUSIONADA pide recargar: al releer, la API devuelve la conservada (spec 40)', async () => {
    const resultado = await resultadoDeOperacion(async () => {
      throw new ErrorPersonas('PERSONA_FUSIONADA', 'La persona ya se fusionó', 409, null, { personaConservadaId: 'per-c' });
    });
    expect(resultado).toEqual({ tipo: 'recargar', aviso: 'La persona cambió; se recargaron sus datos' });
  });

  it('otro error queda como mensaje de la sección', async () => {
    const resultado = await resultadoDeOperacion(async () => {
      throw new ErrorPersonas('CONTACTO_DUPLICADO', 'x', 409);
    });
    expect(resultado).toEqual({ tipo: 'error', mensaje: 'La persona ya tiene ese contacto.' });
  });
});
