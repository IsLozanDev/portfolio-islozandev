import { aDatosSucursal, cargarSucursal, crearGrupoSucursal, faltaEstablecimiento } from './formulario-sucursal';
import { mensajeDeErrorOrganizacion } from './validadores-organizacion';

const CENTRO = {
  id: 's-centro',
  empresaId: 'e-sabores',
  codigo: 'CENTRO',
  nombre: 'Centro',
  codigoEstablecimientoSunat: '0000',
  direccion: null,
  ubigeo: '040101',
  telefono: null,
  zonaHoraria: 'America/Lima',
  esPrincipal: true,
  activo: true,
  version: 1,
};

describe('formulario de sucursal', () => {
  it('TR-CA-007: «Cayma» con 0002 y 040103 es válida y usa America/Lima por defecto', () => {
    const grupo = crearGrupoSucursal();
    grupo.patchValue({ codigo: 'CAYMA', nombre: 'Cayma', codigoEstablecimientoSunat: '0002', ubigeo: '040103' });

    expect(grupo.valid).toBe(true);
    expect(aDatosSucursal(grupo)).toEqual({
      codigo: 'CAYMA',
      nombre: 'Cayma',
      codigoEstablecimientoSunat: '0002',
      direccion: null,
      ubigeo: '040103',
      telefono: null,
      zonaHoraria: 'America/Lima',
    });
  });

  it('TR-RN-003: 0000 en una sucursal que no es la principal es inválido', () => {
    const grupo = crearGrupoSucursal();
    grupo.controls.codigoEstablecimientoSunat.setValue('0000');
    expect(mensajeDeErrorOrganizacion(grupo.controls.codigoEstablecimientoSunat.errors)).toBe('El establecimiento 0000 corresponde a la sucursal principal');
  });

  it.each(['002', '00a2', '00002'])('el establecimiento «%s» no tiene 4 dígitos', (establecimiento) => {
    const grupo = crearGrupoSucursal();
    grupo.controls.codigoEstablecimientoSunat.setValue(establecimiento);
    expect(mensajeDeErrorOrganizacion(grupo.controls.codigoEstablecimientoSunat.errors)).toBe('El establecimiento SUNAT tiene 4 dígitos');
  });

  it('el nombre tiene al menos 3 caracteres', () => {
    const grupo = crearGrupoSucursal();
    grupo.controls.nombre.setValue('Ca');
    expect(grupo.controls.nombre.hasError('minlength')).toBe(true);
  });

  it('en la principal el establecimiento queda fijo en 0000, sin error, y se envía', () => {
    const grupo = crearGrupoSucursal();
    cargarSucursal(grupo, CENTRO);

    expect(grupo.controls.codigoEstablecimientoSunat.disabled).toBe(true);
    expect(grupo.valid).toBe(true);
    expect(aDatosSucursal(grupo).codigoEstablecimientoSunat).toBe('0000');
  });

  it('brecha 5: la que dejó de ser principal y no tiene establecimiento lo pide; la principal no', () => {
    expect(faltaEstablecimiento({ ...CENTRO, esPrincipal: false, codigoEstablecimientoSunat: null })).toBe(true);
    expect(faltaEstablecimiento(CENTRO)).toBe(false);
    expect(faltaEstablecimiento({ ...CENTRO, esPrincipal: false, codigoEstablecimientoSunat: '0002' })).toBe(false);
  });

  it('al editar una no principal el establecimiento se puede cambiar', () => {
    const grupo = crearGrupoSucursal();
    cargarSucursal(grupo, { ...CENTRO, esPrincipal: false, codigoEstablecimientoSunat: null });

    expect(grupo.controls.codigoEstablecimientoSunat.enabled).toBe(true);
    expect(grupo.controls.codigoEstablecimientoSunat.value).toBe('');
  });
});
