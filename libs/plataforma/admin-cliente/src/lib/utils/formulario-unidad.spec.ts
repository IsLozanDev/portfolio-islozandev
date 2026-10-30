import { aAltaUnidad, aDatosUnidad, cargarUnidad, crearGrupoUnidad, fusionarAtributos } from './formulario-unidad';
import { ERROR_SUCURSAL_REQUERIDA, mensajeDeErrorOrganizacion } from './validadores-organizacion';

const CAJA = {
  id: 'u-caja',
  empresaId: 'e-sabores',
  sucursalId: 's-cayma',
  tipo: 'CAJA' as const,
  codigo: 'CAJA-01',
  nombre: 'Caja 1',
  padreId: 'u-salon',
  atributos: { impresora: 'EPSON-1', capacidad: 2, color: 'rojo' },
  activo: true,
  version: 2,
};

describe('formulario de unidad', () => {
  it('TR-CA-011: un CONSULTORIO sin sucursal da el error del dominio', () => {
    const grupo = crearGrupoUnidad();
    grupo.patchValue({ tipo: 'CONSULTORIO', sucursalId: null, codigo: 'C-01', nombre: 'Consultorio 1' });

    expect(grupo.valid).toBe(false);
    expect(grupo.hasError(ERROR_SUCURSAL_REQUERIDA)).toBe(true);
    expect(mensajeDeErrorOrganizacion(grupo.errors)).toBe('Solo los almacenes pueden registrarse sin sucursal');
  });

  it('TR-CA-012: un ALMACEN sin sucursal es válido y queda a nivel de empresa', () => {
    const grupo = crearGrupoUnidad();
    grupo.patchValue({ tipo: 'ALMACEN', sucursalId: null, codigo: 'ALM', nombre: 'Almacén central' });

    expect(grupo.valid).toBe(true);
    expect(aAltaUnidad(grupo, 'e-sabores')).toEqual({
      empresaId: 'e-sabores',
      sucursalId: null,
      tipo: 'ALMACEN',
      codigo: 'ALM',
      nombre: 'Almacén central',
      padreId: null,
      atributos: {},
    });
  });

  it('TR-CA-010: una CAJA con sucursal y padre arma el alta con sus atributos', () => {
    const grupo = crearGrupoUnidad();
    grupo.patchValue({ tipo: 'CAJA', sucursalId: 's-cayma', codigo: ' CAJA-01 ', nombre: 'Caja 1', padreId: 'u-salon', impresora: 'EPSON-1', capacidad: 2 });

    expect(grupo.valid).toBe(true);
    expect(aAltaUnidad(grupo, 'e-sabores')).toMatchObject({ sucursalId: 's-cayma', codigo: 'CAJA-01', padreId: 'u-salon', atributos: { impresora: 'EPSON-1', capacidad: 2 } });
  });

  it.each([
    [-1, 'min'],
    [1.5, 'capacidadEntera'],
  ])('la capacidad %p es inválida', (capacidad, error) => {
    const grupo = crearGrupoUnidad();
    grupo.controls.capacidad.setValue(capacidad);
    expect(grupo.controls.capacidad.hasError(error)).toBe(true);
  });

  it('fusionarAtributos conserva «color» y omite los campos vacíos', () => {
    expect(fusionarAtributos({ color: 'rojo', piso: '2', impresora: 'VIEJA' }, { impresora: 'EPSON-1', piso: undefined })).toEqual({ color: 'rojo', impresora: 'EPSON-1' });
  });

  it('al editar, tipo y sucursal quedan en solo lectura y los atributos se cargan en sus campos', () => {
    const grupo = crearGrupoUnidad();
    cargarUnidad(grupo, CAJA);

    expect(grupo.controls.tipo.disabled).toBe(true);
    expect(grupo.controls.sucursalId.disabled).toBe(true);
    expect(grupo.getRawValue()).toMatchObject({ impresora: 'EPSON-1', capacidad: 2, piso: '' });
  });

  it('aDatosUnidad al editar conserva las claves que la UI no conoce', () => {
    const grupo = crearGrupoUnidad();
    cargarUnidad(grupo, CAJA);
    grupo.patchValue({ nombre: 'Caja principal', capacidad: null, piso: '1' });

    expect(aDatosUnidad(grupo, CAJA.atributos)).toEqual({
      codigo: 'CAJA-01',
      nombre: 'Caja principal',
      padreId: 'u-salon',
      atributos: { color: 'rojo', impresora: 'EPSON-1', piso: '1' },
    });
  });
});
