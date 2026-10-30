import { aDatosEmpresa, cargarEmpresa, crearGrupoEmpresa, rucDe } from './formulario-empresa';
import { mensajeDeErrorOrganizacion } from './validadores-organizacion';

const SABORES = {
  id: 'e-sabores',
  ruc: '20512345671',
  razonSocial: 'Sabores del Sur SAC',
  nombreComercial: null,
  direccionFiscal: 'Av. Ejército 101',
  ubigeo: '040101',
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

  it('un ubigeo de 5 dígitos es inválido; vacío vale', () => {
    const grupo = crearGrupoEmpresa();
    grupo.controls.ubigeo.setValue('04010');
    expect(mensajeDeErrorOrganizacion(grupo.controls.ubigeo.errors)).toBe('El ubigeo tiene 6 dígitos');

    grupo.controls.ubigeo.setValue('');
    expect(grupo.controls.ubigeo.errors).toBeNull();
  });

  it('razón social de 201 caracteres es inválida', () => {
    const grupo = crearGrupoEmpresa();
    grupo.controls.razonSocial.setValue('S'.repeat(201));
    expect(grupo.controls.razonSocial.hasError('maxlength')).toBe(true);
  });

  it('al editar, el RUC queda en solo lectura y los nulos se muestran vacíos', () => {
    const grupo = crearGrupoEmpresa();
    cargarEmpresa(grupo, SABORES);

    expect(grupo.controls.ruc.disabled).toBe(true);
    expect(rucDe(grupo)).toBe('20512345671');
    expect(grupo.controls.nombreComercial.value).toBe('');
  });

  it('aDatosEmpresa recorta y manda los opcionales vacíos como null', () => {
    const grupo = crearGrupoEmpresa();
    grupo.patchValue({ ruc: '20512345671', razonSocial: '  Sabores del Sur SAC ', nombreComercial: '   ', direccionFiscal: ' Av. Ejército 101 ', ubigeo: '' });

    expect(aDatosEmpresa(grupo)).toEqual({ razonSocial: 'Sabores del Sur SAC', nombreComercial: null, direccionFiscal: 'Av. Ejército 101', ubigeo: null });
  });
});
