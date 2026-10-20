import { ValidationError } from '@vitrina/plataforma/kernel';
import { Empresa, type DatosEmpresa } from '../src/domain/empresa.js';
import { CodigoEstablecimiento, Ubigeo } from '../src/domain/valores.js';
import { EMPRESA, TENANT, empresa } from './support/fabricas.js';

const datos = (cambios: Partial<DatosEmpresa> = {}): DatosEmpresa => ({
  razonSocial: 'Sabores del Sur SAC',
  nombreComercial: 'Sabores',
  direccionFiscal: null,
  ubigeo: '040101',
  ...cambios,
});

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
        payload: { ruc: '20512345671', razon_social: 'Sabores del Sur SAC', nombre_comercial: 'Sabores' },
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
    e.editar(datos({ nombreComercial: 'Sabores Arequipa', ubigeo: null }));

    expect(e.ruc).toBe('20512345671');
    expect(e.datos).toEqual({ razonSocial: 'Sabores del Sur SAC', nombreComercial: 'Sabores Arequipa', direccionFiscal: null, ubigeo: null });
    expect(e.pullEvents().map((ev) => ev.eventType)).toEqual(['empresa.actualizada']);
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
