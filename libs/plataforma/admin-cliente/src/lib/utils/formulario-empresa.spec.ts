import { aDatosEdicionEmpresa, aDatosEmpresa, cargarEmpresa, crearGrupoEmpresa, rucDe } from './formulario-empresa';
import { mensajeDeErrorOrganizacion } from './validadores-organizacion';

const CAYMA = { codigo: '040103', distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };

const SABORES = {
  id: 'e-sabores',
  ruc: '20512345671',
  razonSocial: 'Sabores del Sur SAC',
  nombreComercial: null,
  direccionFiscal: 'Av. Ejército 101',
  ubigeo: '040101',
  telefono: '+51987654321',
  correo: null,
  sitioWeb: 'https://sabores.pe',
  logoArchivoId: null,
  activo: true,
  version: 3,
};

describe('formulario de empresa', () => {
  it('TR-CA-004: RUC 20512345671 y razón social bastan', () => {
    const grupo = crearGrupoEmpresa();
    grupo.patchValue({ ruc: '20512345671', razonSocial: 'Sabores del Sur SAC' });
    expect(grupo.valid).toBe(true);
  });

  it('TR-RN-002: 20512345678 no pasa el módulo 11 y muestra «RUC inválido»', () => {
    const grupo = crearGrupoEmpresa();
    grupo.patchValue({ ruc: '20512345678', razonSocial: 'Sabores del Sur SAC' });

    expect(grupo.valid).toBe(false);
    expect(mensajeDeErrorOrganizacion(grupo.controls.ruc.errors)).toBe('RUC inválido');
  });

  it('un distrito escrito sin elegirlo de la lista no deja guardar; vacío vale (spec 17d)', () => {
    const grupo = crearGrupoEmpresa();
    grupo.patchValue({ ruc: '20512345671', razonSocial: 'Sabores del Sur SAC' });
    grupo.controls.ubigeo.setValue('cayma');
    expect(grupo.valid).toBe(false);

    grupo.controls.ubigeo.setValue(null);
    expect(grupo.valid).toBe(true);
  });

  it('el distrito elegido viaja por su código; deshabilitado, el código guardado tal cual', () => {
    const grupo = crearGrupoEmpresa();
    grupo.patchValue({ razonSocial: 'Sabores del Sur SAC', ubigeo: CAYMA });
    expect(aDatosEmpresa(grupo).ubigeo).toBe('040103');

    cargarEmpresa(grupo, SABORES, '040101');
    grupo.controls.ubigeo.disable();
    expect(grupo.valid).toBe(true);
    expect(aDatosEmpresa(grupo).ubigeo).toBe('040101');
  });

  it('razón social de 201 caracteres es inválida', () => {
    const grupo = crearGrupoEmpresa();
    grupo.controls.razonSocial.setValue('S'.repeat(201));
    expect(grupo.controls.razonSocial.hasError('maxlength')).toBe(true);
  });

  it('al editar, el RUC queda en solo lectura y los nulos se muestran vacíos', () => {
    const grupo = crearGrupoEmpresa();
    cargarEmpresa(grupo, SABORES, CAYMA);

    expect(grupo.controls.ruc.disabled).toBe(true);
    expect(rucDe(grupo)).toBe('20512345671');
    expect(grupo.controls.nombreComercial.value).toBe('');
  });

  it('aDatosEmpresa recorta y manda los opcionales vacíos como null', () => {
    const grupo = crearGrupoEmpresa();
    grupo.patchValue({ ruc: '20512345671', razonSocial: '  Sabores del Sur SAC ', nombreComercial: '   ', direccionFiscal: ' Av. Ejército 101 ', ubigeo: null });

    expect(aDatosEmpresa(grupo)).toEqual({
      razonSocial: 'Sabores del Sur SAC',
      nombreComercial: null,
      direccionFiscal: 'Av. Ejército 101',
      ubigeo: null,
      telefono: null,
      correo: null,
      sitioWeb: null,
    });
  });

  it('al editar carga el contacto: el teléfono en E.164 y los nulos vacíos', () => {
    const grupo = crearGrupoEmpresa();
    cargarEmpresa(grupo, SABORES, CAYMA);

    expect(grupo.getRawValue()).toMatchObject({ telefono: '+51987654321', correo: '', sitioWeb: 'https://sabores.pe' });
  });

  it('el correo viaja en minúsculas y recortado', () => {
    const grupo = crearGrupoEmpresa();
    grupo.patchValue({ razonSocial: 'Sabores del Sur SAC', correo: ' Ventas@Empresa.PE ' });

    expect(aDatosEmpresa(grupo).correo).toBe('ventas@empresa.pe');
  });

  it.each([
    ['un correo sin @', 'correo', 'ventas.empresa.pe', 'Ingrese un correo válido.'],
    ['un sitio con http://', 'sitioWeb', 'http://empresa.pe', 'Ingrese una dirección que empiece con https://'],
    ['un celular incompleto', 'telefono', '987 65', 'Celular de 9 dígitos que empieza con 9, o fijo con código de área'],
  ] as const)('%s no deja guardar y muestra su mensaje', (_caso, campo, valor, mensaje) => {
    const grupo = crearGrupoEmpresa();
    grupo.patchValue({ ruc: '20512345671', razonSocial: 'Sabores del Sur SAC', [campo]: valor });

    expect(grupo.valid).toBe(false);
    expect(mensajeDeErrorOrganizacion(grupo.controls[campo].errors)).toBe(mensaje);
  });

  it('la edición lleva el logo del formulario: el guardado, uno nuevo o null para quitarlo', () => {
    const grupo = crearGrupoEmpresa();
    cargarEmpresa(grupo, { ...SABORES, logoArchivoId: 'logo-1' }, CAYMA);
    expect(aDatosEdicionEmpresa(grupo).logoArchivoId).toBe('logo-1');

    grupo.controls.logoArchivoId.setValue(null);
    expect(aDatosEdicionEmpresa(grupo)).toMatchObject({ logoArchivoId: null, ubigeo: '040103' });
  });
});
