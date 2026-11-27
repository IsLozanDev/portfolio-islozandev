import { aProveedorFe } from './proveedor-fe';

describe('aProveedorFe', () => {
  it('SUNAT tiene URL fija por ambiente: no pide URL', () => {
    const sunat = aProveedorFe({
      codigo: 'SUNAT',
      nombre: 'SUNAT directo (SEE-Del Contribuyente)',
      atributos: { requiere_certificado: true, dominios_permitidos: ['e-beta.sunat.gob.pe'], url_produccion: 'https://e-factura.sunat.gob.pe/x' },
    });
    expect(sunat).toEqual({ codigo: 'SUNAT', nombre: 'SUNAT directo (SEE-Del Contribuyente)', requiereCertificado: true, pideUrl: false, esSunat: true });
  });

  it('con dominios y sin URL fija pide URL; sin el atributo exige certificado; sin dominios no pide URL', () => {
    expect(aProveedorFe({ codigo: 'NUBEFACT', nombre: 'Nubefact', atributos: { requiere_certificado: false, dominios_permitidos: ['api.nubefact.com'] } })).toMatchObject({
      requiereCertificado: false,
      pideUrl: true,
      esSunat: false,
    });
    expect(aProveedorFe({ codigo: 'OTRO', nombre: 'Otro', atributos: {} })).toMatchObject({ requiereCertificado: true, pideUrl: false });
  });
});
