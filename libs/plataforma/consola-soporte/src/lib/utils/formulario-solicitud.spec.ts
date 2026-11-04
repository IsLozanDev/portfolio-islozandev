import { aSolicitudDeAcceso, crearGrupoSolicitud, ERROR_TENANT_NO_ELEGIDO, HORAS_POR_DEFECTO, nombreDeTenant } from './formulario-solicitud';

const TENANT = { id: 't-polleria', codigo: 'polleria-dona-rosa', nombre: 'Pollería Doña Rosa' };

describe('formulario de solicitud', () => {
  it('arranca en solo lectura y 2 horas, inválido', () => {
    const grupo = crearGrupoSolicitud();

    expect(grupo.getRawValue()).toMatchObject({ modo: 'LECTURA', horas: 2 });
    expect(HORAS_POR_DEFECTO).toBe(2);
    expect(grupo.invalid).toBe(true);
  });

  it('el texto escrito en el tenant no vale: hay que elegir una opción', () => {
    const grupo = crearGrupoSolicitud();
    grupo.controls.tenant.setValue('pollería');
    expect(grupo.controls.tenant.hasError(ERROR_TENANT_NO_ELEGIDO)).toBe(true);

    grupo.controls.tenant.setValue(TENANT);
    expect(grupo.controls.tenant.valid).toBe(true);
  });

  it.each([
    ['SOP-12345', 'pattern'],
    ['SOP-123456X', 'pattern'],
    ['', 'required'],
  ])('ticket «%s» → %s', (ticket, error) => {
    const grupo = crearGrupoSolicitud();
    grupo.controls.ticket.setValue(ticket);
    expect(grupo.controls.ticket.hasError(error)).toBe(true);
  });

  it('motivo de 10 a 300 caracteres', () => {
    const grupo = crearGrupoSolicitud();
    grupo.controls.motivo.setValue('corto');
    expect(grupo.controls.motivo.hasError('minlength')).toBe(true);
    grupo.controls.motivo.setValue('x'.repeat(301));
    expect(grupo.controls.motivo.hasError('maxlength')).toBe(true);
  });

  it('arma la solicitud con el id del tenant y el texto recortado', () => {
    const grupo = crearGrupoSolicitud();
    grupo.setValue({ tenant: TENANT, ticket: 'SOP-000123', motivo: '  Revisar cierre de caja  ', modo: 'ESCRITURA', horas: 4 });

    expect(grupo.valid).toBe(true);
    expect(aSolicitudDeAcceso(grupo)).toEqual({ tenantId: 't-polleria', ticket: 'SOP-000123', motivo: 'Revisar cierre de caja', modo: 'ESCRITURA', horas: 4 });
  });

  it('muestra el tenant elegido con su código', () => {
    expect(nombreDeTenant(TENANT)).toBe('Pollería Doña Rosa (polleria-dona-rosa)');
    expect(nombreDeTenant('pollería')).toBe('pollería');
    expect(nombreDeTenant(null)).toBe('');
  });
});
