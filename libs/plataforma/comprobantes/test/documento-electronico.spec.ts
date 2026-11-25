import { monto } from '../src/domain/comprobante/dinero.js';
import { documentoDesdeComprobante } from '../src/domain/comprobante/documento-desde-comprobante.js';
import { exigirDatosEmisor } from '../src/domain/emisor-documento.js';
import { DatosComprobanteInvalidosError, DatosEmisorIncompletosError } from '../src/domain/errores.js';
import { montoEnLetras } from '../src/domain/monto-en-letras.js';
import { comprobante, EMPRESA, ESTABLECIMIENTO, FECHA, linea, RUC_ADQUIRENTE } from './support/comprobante-de-prueba.js';

describe('documentoDesdeComprobante', () => {
  it('TR-CA-136: factura F001-00000100 de 118.00 con IGV 18.00, emisor de ORG y hora de Lima', () => {
    const documento = documentoDesdeComprobante(comprobante(), EMPRESA, ESTABLECIMIENTO, '6');
    expect(documento).toMatchObject({
      tipo: '01',
      serie: 'F001',
      numero: 100,
      fechaEmision: FECHA,
      horaEmision: '10:04:05',
      tipoOperacion: '0101',
      moneda: 'PEN',
      formaPago: 'CONTADO',
      cuotas: [],
      tasaIgv: '0.1800',
      montoEnLetras: 'CIENTO DIECIOCHO CON 00/100 SOLES',
    });
    expect(documento.emisor).toEqual({ ...EMPRESA, codigoEstablecimiento: ESTABLECIMIENTO });
    expect(documento.adquirente).toEqual({ tipoDocumento: '6', numero: RUC_ADQUIRENTE, nombre: 'CLIENTE SAC' });
    expect(documento.totales).toEqual({ gravado: '100.00', exonerado: '0.00', inafecto: '0.00', igv: '18.00', total: '118.00' });
    expect(documento.lineas[0]).toEqual({
      orden: 1,
      codigo: 'P-1',
      descripcion: 'Lomo saltado',
      unidad: 'NIU',
      cantidad: '1.0000',
      valorUnitario: '60.0000',
      precioUnitario: '70.8000',
      afectacionIgv: '10',
      valorVenta: '60.00',
      igv: '10.80',
    });
  });

  it('boleta sin adquirente → CLIENTES VARIOS con el documento SUNAT 0', () => {
    const boleta = comprobante({ tipo: 'BOLETA', serie: 'B001', adquirente: null, lineas: [linea('1', '10')] }, 5);
    const documento = documentoDesdeComprobante(boleta, EMPRESA, '0000', '0');
    expect(documento).toMatchObject({ tipo: '03', serie: 'B001', numero: 5 });
    expect(documento.adquirente).toEqual({ tipoDocumento: '0', numero: '0', nombre: 'CLIENTES VARIOS' });
  });

  it('gravado, exonerado e inafecto: cada total por su afectación y el IGV solo de la gravada', () => {
    const lineas = [linea('1', '100'), linea('1', '50', 'EXONERADO'), linea('2', '10', 'INAFECTO')];
    const documento = documentoDesdeComprobante(comprobante({ lineas }), EMPRESA, ESTABLECIMIENTO, '6');
    expect(documento.totales).toEqual({ gravado: '100.00', exonerado: '50.00', inafecto: '20.00', igv: '18.00', total: '188.00' });
    expect(documento.lineas.map((item) => [item.afectacionIgv, item.igv, item.precioUnitario])).toEqual([
      ['10', '18.00', '118.0000'],
      ['20', '0.00', '50.0000'],
      ['30', '0.00', '10.0000'],
    ]);
  });

  it('crédito con dos cuotas: número, monto como texto y vencimiento', () => {
    const cuotas = [
      { numero: 1, monto: monto('59', 'monto'), fechaVencimiento: '2026-12-24' },
      { numero: 2, monto: monto('59', 'monto'), fechaVencimiento: '2027-01-24' },
    ];
    const documento = documentoDesdeComprobante(comprobante({ formaPago: 'CREDITO', cuotas }), EMPRESA, ESTABLECIMIENTO, '6');
    expect(documento.formaPago).toBe('CREDITO');
    expect(documento.cuotas).toEqual([
      { numero: 1, monto: '59.00', fechaVencimiento: '2026-12-24' },
      { numero: 2, monto: '59.00', fechaVencimiento: '2027-01-24' },
    ]);
  });

  it('en dólares, la leyenda dice DÓLARES AMERICANOS', () => {
    const documento = documentoDesdeComprobante(comprobante({ moneda: 'USD' }), EMPRESA, ESTABLECIMIENTO, '6');
    expect(documento.montoEnLetras).toBe('CIENTO DIECIOCHO CON 00/100 DÓLARES AMERICANOS');
  });
});

describe('exigirDatosEmisor', () => {
  it.each([
    ['ubigeo', { ...EMPRESA, ubigeo: null }, ESTABLECIMIENTO],
    ['domicilioFiscal', { ...EMPRESA, domicilioFiscal: '  ' }, ESTABLECIMIENTO],
    ['codigoEstablecimiento', EMPRESA, null],
  ])('sin %s → DATOS_EMISOR_INCOMPLETOS con el campo', (campo, empresa, establecimiento) => {
    const intento = () => exigirDatosEmisor(empresa, establecimiento);
    expect(intento).toThrow(DatosEmisorIncompletosError);
    try {
      intento();
    } catch (error) {
      expect(error).toMatchObject({ code: 'DATOS_EMISOR_INCOMPLETOS', campo });
    }
  });

  it('la empresa sin ubigeo impide armar el documento del comprobante', () => {
    expect(() => documentoDesdeComprobante(comprobante(), { ...EMPRESA, ubigeo: null }, ESTABLECIMIENTO, '6')).toThrow(DatosEmisorIncompletosError);
  });
});

describe('montoEnLetras', () => {
  const soles = (texto: string) => montoEnLetras(monto(texto, 'total'), 'PEN');

  it.each([
    ['0.05', 'CERO CON 05/100 SOLES'],
    ['1.00', 'UNO CON 00/100 SOLES'],
    ['21.50', 'VEINTIUNO CON 50/100 SOLES'],
    ['100.00', 'CIEN CON 00/100 SOLES'],
    ['118.00', 'CIENTO DIECIOCHO CON 00/100 SOLES'],
    ['716.99', 'SETECIENTOS DIECISÉIS CON 99/100 SOLES'],
    ['1000.00', 'MIL CON 00/100 SOLES'],
    ['1001.00', 'MIL UNO CON 00/100 SOLES'],
    ['21000.00', 'VEINTIÚN MIL CON 00/100 SOLES'],
    ['31500.00', 'TREINTA Y UN MIL QUINIENTOS CON 00/100 SOLES'],
    ['1000000.00', 'UN MILLÓN CON 00/100 SOLES'],
    ['2001001.10', 'DOS MILLONES MIL UNO CON 10/100 SOLES'],
    ['121000000.00', 'CIENTO VEINTIÚN MILLONES CON 00/100 SOLES'],
    ['999999999.99', 'NOVECIENTOS NOVENTA Y NUEVE MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE CON 99/100 SOLES'],
  ])('%s → %s', (texto, letras) => {
    expect(soles(texto)).toBe(letras);
  });

  it('dólares y fuera de rango', () => {
    expect(montoEnLetras(monto('2.30', 'total'), 'USD')).toBe('DOS CON 30/100 DÓLARES AMERICANOS');
    expect(() => soles('1000000000.00')).toThrow(DatosComprobanteInvalidosError);
  });
});
