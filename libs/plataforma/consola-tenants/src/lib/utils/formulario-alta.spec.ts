import { MENSAJES_ALTA } from '../models/mensajes-consola';
import { aSolicitudAlta, crearFormularioAlta, ERROR_SERVIDOR, mensajeDeError } from './formulario-alta';

/** TR-CA-001 con el RUC válido de los specs 03 y 12. */
function polleriaDonaRosa() {
  const formulario = crearFormularioAlta();
  formulario.setValue({
    tenant: { codigo: 'polleria-dona-rosa', nombre: 'Pollería Doña Rosa', productoCodigo: 'REST', plan: 'BASICO', modalidad: 'PRUEBA', vigenteHasta: null },
    empresa: {
      ruc: '20601234565',
      razonSocial: 'Pollería Doña Rosa S.A.C.',
      nombreComercial: '',
      correoPropietario: 'rosa.quispe@gmail.com',
      nombrePropietario: 'Rosa Quispe',
    },
  });
  return formulario;
}

describe('formulario de alta de tenant', () => {
  it('con los datos de TR-CA-001 es válido y arma la solicitud sin opcionales vacíos', () => {
    const formulario = polleriaDonaRosa();

    expect(formulario.valid).toBe(true);
    expect(aSolicitudAlta(formulario.getRawValue())).toEqual({
      codigo: 'polleria-dona-rosa',
      nombre: 'Pollería Doña Rosa',
      productoCodigo: 'REST',
      plan: 'BASICO',
      modalidad: 'PRUEBA',
      vigenteHasta: undefined,
      ruc: '20601234565',
      razonSocial: 'Pollería Doña Rosa S.A.C.',
      nombreComercial: undefined,
      correoPropietario: 'rosa.quispe@gmail.com',
      nombrePropietario: 'Rosa Quispe',
    });
  });

  it.each(['Polleria-Dona-Rosa', 'polleria dona rosa', 'polleria--rosa', '-polleria'])('el código «%s» no es válido', (codigo) => {
    const { codigo: control } = polleriaDonaRosa().controls.tenant.controls;
    control.setValue(codigo);

    expect(mensajeDeError(control.errors)).toBe(MENSAJES_ALTA.codigoFormato);
  });

  it('TR-CA-003: el RUC 20601234560 es «RUC inválido»; el 20601234565 pasa', () => {
    const { ruc } = polleriaDonaRosa().controls.empresa.controls;
    ruc.setValue('20601234560');
    expect(mensajeDeError(ruc.errors)).toBe(MENSAJES_ALTA.rucInvalido);

    ruc.setValue('20601234565');
    expect(ruc.valid).toBe(true);
  });

  it('en modalidad ACTIVO exige vigente hasta y la envía como fecha calendario', () => {
    const formulario = polleriaDonaRosa();
    const { modalidad, vigenteHasta } = formulario.controls.tenant.controls;
    modalidad.setValue('ACTIVO');
    vigenteHasta.updateValueAndValidity();
    expect(vigenteHasta.hasError('required')).toBe(true);

    vigenteHasta.setValue(new Date(2027, 9, 28));
    expect(formulario.valid).toBe(true);
    expect(aSolicitudAlta(formulario.getRawValue()).vigenteHasta).toBe('2027-10-28');
  });

  it('el error del servidor se muestra con el mensaje de la API', () => {
    expect(mensajeDeError({ [ERROR_SERVIDOR]: 'El código de tenant ya existe' })).toBe('El código de tenant ya existe');
  });
});
