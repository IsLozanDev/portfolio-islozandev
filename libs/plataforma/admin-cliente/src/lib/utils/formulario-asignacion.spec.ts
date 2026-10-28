import { aFormularioAsignacion, crearGrupoAsignacion, ERROR_UBICACION_REQUERIDA, ERROR_VIGENCIA_INVALIDA, fechaCalendario } from './formulario-asignacion';

describe('formulario de asignación', () => {
  it('UNIDAD envía solo la unidad aunque estén elegidas su empresa y su sucursal (TR-RN-008)', () => {
    const grupo = crearGrupoAsignacion();
    grupo.setValue({
      asignable: 'rol:r-cajero',
      alcance: 'UNIDAD',
      empresaId: 'e-1',
      sucursalId: 's-mir',
      unidadId: 'u-caja-02',
      vigenteDesde: new Date(2026, 9, 15),
      vigenteHasta: new Date(2026, 9, 31),
    });

    expect(grupo.valid).toBe(true);
    expect(aFormularioAsignacion(grupo)).toEqual({
      rolId: 'r-cajero',
      perfilId: null,
      alcance: 'UNIDAD',
      empresaId: null,
      sucursalId: null,
      unidadId: 'u-caja-02',
      vigenteDesde: '2026-10-15',
      vigenteHasta: '2026-10-31',
    });
  });

  it('el selector guarda rol o perfil, nunca los dos (TR-CA-037)', () => {
    const grupo = crearGrupoAsignacion();
    grupo.patchValue({ asignable: 'rol:r-cajero', alcance: 'TENANT' });
    grupo.controls.asignable.setValue('perfil:p-turno');

    expect(aFormularioAsignacion(grupo)).toMatchObject({ rolId: null, perfilId: 'p-turno' });
  });

  it('sin rol ni perfil el grupo es inválido', () => {
    const grupo = crearGrupoAsignacion();
    grupo.patchValue({ alcance: 'TENANT' });

    expect(grupo.controls.asignable.hasError('required')).toBe(true);
  });

  it('hasta anterior a desde da vigenciaInvalida (TR-CA-038); el mismo día vale', () => {
    const grupo = crearGrupoAsignacion();
    grupo.patchValue({ asignable: 'rol:r-cajero', alcance: 'TENANT', vigenteDesde: new Date(2026, 9, 20), vigenteHasta: new Date(2026, 9, 19) });
    expect(grupo.hasError(ERROR_VIGENCIA_INVALIDA)).toBe(true);

    grupo.patchValue({ vigenteHasta: new Date(2026, 9, 20) });
    expect(grupo.hasError(ERROR_VIGENCIA_INVALIDA)).toBe(false);
  });

  it('sin desde, hasta se compara con hoy', () => {
    const grupo = crearGrupoAsignacion();
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    grupo.patchValue({ asignable: 'rol:r-cajero', alcance: 'TENANT', vigenteHasta: ayer });

    expect(grupo.hasError(ERROR_VIGENCIA_INVALIDA)).toBe(true);
  });

  it.each([
    ['EMPRESA', 'empresaId'],
    ['SUCURSAL', 'sucursalId'],
    ['UNIDAD', 'unidadId'],
  ] as const)('%s exige %s', (alcance, campo) => {
    const grupo = crearGrupoAsignacion();
    grupo.patchValue({ asignable: 'rol:r-cajero', alcance });
    expect(grupo.hasError(ERROR_UBICACION_REQUERIDA)).toBe(true);

    grupo.controls[campo].setValue('id-1');
    expect(grupo.hasError(ERROR_UBICACION_REQUERIDA)).toBe(false);
  });

  it('fechaCalendario usa el día local que eligió el usuario', () => {
    expect(fechaCalendario(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
