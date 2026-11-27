import { emisorDePrueba } from '../../testing/emisor-de-prueba';
import type { ProveedorFe } from '../models/proveedor-fe';
import { aCargaConfigurar, cargarEmisor, crearGrupoProveedor, exigirUrlSegun } from './formulario-emisor';

const SUNAT: ProveedorFe = { codigo: 'SUNAT', nombre: 'SUNAT directo', requiereCertificado: true, pideUrl: false, esSunat: true };
const PSE: ProveedorFe = { codigo: 'NUBEFACT', nombre: 'Nubefact', requiereCertificado: false, pideUrl: true, esSunat: false };

describe('formulario del proveedor', () => {
  it('carga el emisor sin la clave y arma el PUT sin clave ni URL si no se escribieron o no se piden', () => {
    const grupo = crearGrupoProveedor();
    cargarEmisor(grupo, emisorDePrueba());
    expect(grupo.getRawValue()).toMatchObject({ proveedor: 'SUNAT', usuario: 'MODDATOS', clave: '' });

    expect(aCargaConfigurar(grupo, SUNAT, emisorDePrueba())).toEqual({
      proveedor: 'SUNAT',
      usuario_proveedor: 'MODDATOS',
      regimen_igv: 'GENERAL',
      leyenda_pie: null,
      version: 3,
    });
  });

  it('manda la clave escrita y la URL si el proveedor la pide; sin emisor, sin version', () => {
    const grupo = crearGrupoProveedor();
    grupo.setValue({ proveedor: 'NUBEFACT', usuario: ' usuario ', clave: 'secreta', url: 'https://api.nubefact.com/x', regimenIgv: 'GENERAL', leyendaPie: '' });
    expect(aCargaConfigurar(grupo, PSE, null)).toEqual({
      proveedor: 'NUBEFACT',
      usuario_proveedor: 'usuario',
      clave: 'secreta',
      regimen_igv: 'GENERAL',
      leyenda_pie: null,
      url_proveedor: 'https://api.nubefact.com/x',
    });
  });

  it('la URL es obligatoria solo con un proveedor que la pide', () => {
    const grupo = crearGrupoProveedor();
    exigirUrlSegun(grupo, PSE);
    expect(grupo.controls.url.hasError('required')).toBe(true);
    exigirUrlSegun(grupo, SUNAT);
    expect(grupo.controls.url.valid).toBe(true);
  });

  it('en PRODUCCION bloquea el proveedor y la URL', () => {
    const grupo = crearGrupoProveedor();
    cargarEmisor(grupo, emisorDePrueba({ estado: 'PRODUCCION' }));
    expect(grupo.controls.proveedor.disabled).toBe(true);
    expect(grupo.controls.url.disabled).toBe(true);
    expect(grupo.controls.usuario.enabled).toBe(true);
  });
});
