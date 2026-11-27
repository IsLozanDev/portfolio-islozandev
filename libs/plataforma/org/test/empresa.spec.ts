import { ValidationError } from '@vitrina/plataforma/kernel';
import { Empresa, type DatosEmpresa } from '../src/domain/empresa.js';
import { CorreoInvalidoError, SitioWebInvalidoError, TelefonoInvalidoError } from '../src/domain/errores.js';
import { LogoValidado } from '../src/domain/logo.js';
import { CodigoEstablecimiento, CorreoEmpresa, formatoTelefono, SitioWeb, Telefono, Ubigeo } from '../src/domain/valores.js';
import { EMPRESA, TENANT, empresa } from './support/fabricas.js';

const datos = (cambios: Partial<DatosEmpresa> = {}): DatosEmpresa => ({
  razonSocial: 'Sabores del Sur SAC',
  nombreComercial: 'Sabores',
  direccionFiscal: null,
  ubigeo: '040101',
  telefono: null,
  correo: null,
  sitioWeb: null,
  ...cambios,
});

const LOGO = '0190a8e0-0000-7000-8000-00000000a001';
const OTRO_LOGO = '0190a8e0-0000-7000-8000-00000000a002';

describe('Empresa', () => {
  it('se crea activa y levanta empresa.creada', () => {
    const e = Empresa.crear(EMPRESA, TENANT, '20512345671', datos({ razonSocial: '  Sabores del Sur SAC ' }));

    expect(e.activo).toBe(true);
    expect(e.datos.razonSocial).toBe('Sabores del Sur SAC');
    expect(e.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'empresa.creada',
        aggregateType: 'empresa',
        aggregateVersion: 1,
        payload: { ruc: '20512345671', razon_social: 'Sabores del Sur SAC', nombre_comercial: 'Sabores', logo_archivo_id: null },
      }),
    ]);
  });

  it('TR-CA-003: un RUC con dígito verificador inválido se rechaza con «RUC inválido»', () => {
    expect(() => Empresa.crear(EMPRESA, TENANT, '20601234560', datos())).toThrow(new ValidationError('RUC inválido'));
  });

  it.each([
    ['razón social vacía', { razonSocial: '  ' }],
    ['razón social de 201', { razonSocial: 'x'.repeat(201) }],
    ['nombre comercial de 151', { nombreComercial: 'x'.repeat(151) }],
    ['dirección de 251', { direccionFiscal: 'x'.repeat(251) }],
    ['ubigeo con letras', { ubigeo: '04010A' }],
  ])('rechaza %s', (_caso, cambio) => {
    expect(() => Empresa.crear(EMPRESA, TENANT, '20512345671', datos(cambio))).toThrow(ValidationError);
  });

  it('editar conserva el RUC y levanta empresa.actualizada', () => {
    const e = empresa();
    e.editar(datos({ nombreComercial: 'Sabores Arequipa', ubigeo: null }), null);

    expect(e.ruc).toBe('20512345671');
    expect(e.datos).toEqual(datos({ nombreComercial: 'Sabores Arequipa', ubigeo: null }));
    expect(e.pullEvents().map((ev) => ev.eventType)).toEqual(['empresa.actualizada']);
  });

  it('se crea con teléfono, correo y web normalizados y sin logo', () => {
    const e = Empresa.crear(
      EMPRESA,
      TENANT,
      '20512345671',
      datos({ telefono: '987 654 321', correo: ' Ventas@Empresa.PE ', sitioWeb: 'https://www.empresa.pe' }),
    );

    expect(e.datos).toMatchObject({ telefono: '+51987654321', correo: 'ventas@empresa.pe', sitioWeb: 'https://www.empresa.pe' });
    expect(e.logoArchivoId).toBeNull();
  });

  it('contacto vacío se guarda como null', () => {
    const e = Empresa.crear(EMPRESA, TENANT, '20512345671', datos({ telefono: ' ', correo: '', sitioWeb: null }));
    expect(e.datos).toMatchObject({ telefono: null, correo: null, sitioWeb: null });
  });

  it.each([
    ['teléfono incompleto', { telefono: '98765' }, TelefonoInvalidoError],
    ['correo sin @', { correo: 'ventas.empresa.pe' }, CorreoInvalidoError],
    ['web sin https://', { sitioWeb: 'www.empresa.pe' }, SitioWebInvalidoError],
  ])('rechaza %s con su código', (_caso, cambio, error) => {
    expect(() => Empresa.crear(EMPRESA, TENANT, '20512345671', datos(cambio))).toThrow(error);
  });

  describe('logo al editar', () => {
    it('asigna un logo validado y lo lleva en empresa.actualizada', () => {
      const e = empresa();
      e.editar(datos(), LogoValidado.confirmado(LOGO));

      expect(e.logoArchivoId).toBe(LOGO);
      expect(e.pullEvents()[0].payload).toMatchObject({ logo_archivo_id: LOGO });
    });

    it('sin cambiar el logo no necesita validarlo', () => {
      const e = empresa({ logoArchivoId: LOGO });
      e.editar(datos({ nombreComercial: 'Sabores Arequipa' }), LOGO);

      expect(e.logoArchivoId).toBe(LOGO);
    });

    it('quita el logo con null', () => {
      const e = empresa({ logoArchivoId: LOGO });
      e.editar(datos(), null);

      expect(e.logoArchivoId).toBeNull();
    });

    it('un logo nuevo sin validar se rechaza y no cambia nada', () => {
      const e = empresa({ logoArchivoId: LOGO });

      expect(() => e.editar(datos({ nombreComercial: 'Otro' }), OTRO_LOGO)).toThrow('Un logo nuevo debe llegar validado');
      expect(e.logoArchivoId).toBe(LOGO);
      expect(e.datos.nombreComercial).toBeNull();
      expect(e.pullEvents()).toEqual([]);
    });
  });
});

describe('Telefono', () => {
  it.each([
    ['987 654 321', '+51987654321'],
    ['(01) 555-0101', '+5115550101'],
    ['054 123456', '+5154123456'],
    ['+51 987654321', '+51987654321'],
    ['+51 (01) 555-0101', '+5115550101'],
    ['51123456', '+5151123456'],
  ])('normaliza «%s» a %s', (texto, e164) => {
    expect(Telefono.de(texto).valor).toBe(e164);
  });

  it.each(['98765432', '0987654321', '12ab', '98765', '', '+1 987654321'])('rechaza «%s» con TELEFONO_INVALIDO', (texto) => {
    expect(() => Telefono.de(texto)).toThrow(TelefonoInvalidoError);
    expect(() => Telefono.de(texto)).toThrow(expect.objectContaining({ code: 'TELEFONO_INVALIDO' }));
  });

  it.each([
    ['+51987654321', '987 654 321'],
    ['+5115550101', '(01) 555-0101'],
    ['+5154123456', '(054) 123-456'],
    ['anexo 12', 'anexo 12'],
  ])('formatoTelefono(%s) es «%s»', (e164, texto) => {
    expect(formatoTelefono(e164)).toBe(texto);
  });
});

describe('CorreoEmpresa y SitioWeb', () => {
  it('el correo pasa a minúsculas', () => {
    expect(CorreoEmpresa.de('Ventas@Empresa.PE').valor).toBe('ventas@empresa.pe');
  });

  it.each(['ventas', 'ventas@empresa', 'a b@empresa.pe', `${'a'.repeat(250)}@x.pe`])('rechaza el correo «%s»', (correo) => {
    expect(() => CorreoEmpresa.de(correo)).toThrow(CorreoInvalidoError);
  });

  it('acepta https:// y rechaza http:// o sin esquema', () => {
    expect(SitioWeb.de(' https://ejemplo.pe ').valor).toBe('https://ejemplo.pe');
    expect(() => SitioWeb.de('http://empresa.pe')).toThrow(SitioWebInvalidoError);
    expect(() => SitioWeb.de('www.empresa.pe')).toThrow(SitioWebInvalidoError);
    expect(() => SitioWeb.de(`https://${'a'.repeat(193)}.pe`)).toThrow(SitioWebInvalidoError);
  });
});

describe('Value objects', () => {
  it('Ubigeo y CodigoEstablecimiento opcionales devuelven null con vacío', () => {
    expect(Ubigeo.opcional(null)).toBeNull();
    expect(Ubigeo.opcional('')).toBeNull();
    expect(CodigoEstablecimiento.opcional(undefined)).toBeNull();
  });

  it.each(['002', '00002', 'A002'])('CodigoEstablecimiento rechaza «%s»', (codigo) => {
    expect(() => CodigoEstablecimiento.de(codigo)).toThrow(ValidationError);
  });
});
