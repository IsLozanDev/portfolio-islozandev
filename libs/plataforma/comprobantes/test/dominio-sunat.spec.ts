import type { AtributosItem, ResultadoValidacion } from '@vitrina/plataforma/catalogos';
import { UsuarioSolInvalidoError } from '../src/domain/errores.js';
import { urlSegunAmbiente } from '../src/domain/url-proveedor.js';
import { exigirUsuarioSol, usuarioWsSecurity } from '../src/domain/usuario-sol.js';
import { ProveedoresFeCatalogo } from '../src/infrastructure/catalogos/proveedores-fe.catalogo.js';

const URL_BETA = 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';
const URL_PRODUCCION = 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService';
const RUC = '20601234561';

const catalogoCon = (atributos: AtributosItem) => ({
  validarItem: (): Promise<ResultadoValidacion> => Promise.resolve({ valido: true, motivo: null, atributos, nombre: 'SUNAT', codigoExterno: null }),
});

describe('urlSegunAmbiente (spec 51c)', () => {
  const sunat = { urlBeta: URL_BETA, urlProduccion: URL_PRODUCCION };

  it('con url_produccion en el ítem usa la URL del ambiente', () => {
    expect(urlSegunAmbiente(sunat, 'BETA')).toBe(URL_BETA);
    expect(urlSegunAmbiente(sunat, 'PRODUCCION')).toBe(URL_PRODUCCION);
  });

  it('sin url_produccion devuelve null: manda la url_proveedor del emisor', () => {
    expect(urlSegunAmbiente({ urlBeta: null, urlProduccion: null }, 'BETA')).toBeNull();
    expect(urlSegunAmbiente({ urlBeta: URL_BETA, urlProduccion: null }, 'PRODUCCION')).toBeNull();
  });
});

describe('usuario secundario SOL (spec 51c)', () => {
  it('acepta alfanumérico en mayúsculas y quita espacios', () => {
    expect(exigirUsuarioSol(' MODDATOS ')).toBe('MODDATOS');
    expect(exigirUsuarioSol('FACT01')).toBe('FACT01');
  });

  it.each([
    ['minúsculas', 'moddatos'],
    ['con el RUC delante', `${RUC}MODDATOS`],
    ['con símbolos', 'MOD-DATOS'],
    ['vacío', '   '],
  ])('%s → USUARIO_SOL_INVALIDO sin el usuario en el mensaje', (_caso, usuario) => {
    expect(() => exigirUsuarioSol(usuario)).toThrow(UsuarioSolInvalidoError);
    try {
      exigirUsuarioSol(usuario);
    } catch (error) {
      expect((error as Error).message).not.toContain(usuario.trim() || '\u0000');
    }
  });

  it('el Username de WS-Security es RUC + usuario', () => {
    expect(usuarioWsSecurity(RUC, 'MODDATOS')).toBe('20601234561MODDATOS');
  });
});

describe('ProveedoresFeCatalogo: URL por ambiente', () => {
  it('lee url_beta y url_produccion del ítem', async () => {
    const proveedores = new ProveedoresFeCatalogo(
      catalogoCon({ requiere_certificado: true, url_beta: URL_BETA, url_produccion: URL_PRODUCCION, dominios_permitidos: ['e-beta.sunat.gob.pe'] }),
    );
    await expect(proveedores.obtener('SUNAT')).resolves.toMatchObject({ urlBeta: URL_BETA, urlProduccion: URL_PRODUCCION });
  });

  it('sin los atributos o con algo que no es texto, null', async () => {
    const proveedores = new ProveedoresFeCatalogo(catalogoCon({ url_beta: null, url_produccion: 5 }));
    await expect(proveedores.obtener('NUBEFACT')).resolves.toMatchObject({ urlBeta: null, urlProduccion: null });
  });
});
