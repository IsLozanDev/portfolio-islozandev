import { validarDocumento, type MotivoInvalidez, type TipoDocumento } from '../src/documento.js';

describe('validarDocumento', () => {
  it('TR-CA-112: acepta el RUC 20100070970', () => {
    expect(validarDocumento('RUC', '20100070970')).toEqual({ valido: true });
  });

  it('TR-CA-113: rechaza el RUC 30601234567 por prefijo', () => {
    expect(validarDocumento('RUC', '30601234567')).toEqual({ valido: false, motivo: 'PREFIJO' });
  });

  it('TR-CA-114: rechaza el DNI 4578123A por caracteres', () => {
    expect(validarDocumento('DNI', '4578123A')).toEqual({ valido: false, motivo: 'CARACTERES' });
  });

  it.each<[TipoDocumento, string]>([
    ['DNI', '45781236'],
    ['RUC', '20601234565'],
    ['RUC', '10467793549'],
    ['CE', '001234567'],
    ['CE', 'X1'],
    ['PAS', 'AB1234567890'],
    ['PAS', 'p1'],
  ])('acepta %s %s', (tipo, numero) => {
    expect(validarDocumento(tipo, numero)).toEqual({ valido: true });
  });

  it.each<[TipoDocumento, string, MotivoInvalidez]>([
    ['DNI', '4578123', 'LONGITUD'],
    ['DNI', '457812361', 'LONGITUD'],
    ['DNI', '', 'LONGITUD'],
    ['DNI', ' 45781236', 'CARACTERES'],
    ['RUC', '2060123456A', 'CARACTERES'],
    ['RUC', '2060123456', 'LONGITUD'],
    ['RUC', '206012345651', 'LONGITUD'],
    ['RUC', '11601234565', 'PREFIJO'],
    ['RUC', '20601234560', 'DIGITO_VERIFICADOR'],
    ['CE', '00123-4567', 'CARACTERES'],
    ['CE', '', 'LONGITUD'],
    ['CE', '1234567890123', 'LONGITUD'],
    ['PAS', 'AB 123', 'CARACTERES'],
    ['PAS', '', 'LONGITUD'],
    ['PAS', 'ABCDEFGHIJKLM', 'LONGITUD'],
  ])('rechaza %s %j por %s', (tipo, numero, motivo) => {
    expect(validarDocumento(tipo, numero)).toEqual({ valido: false, motivo });
  });

  it('aplica las reglas en orden: caracteres antes que longitud y prefijo', () => {
    expect(validarDocumento('RUC', '3060123456A7')).toEqual({ valido: false, motivo: 'CARACTERES' });
    expect(validarDocumento('RUC', '306012345')).toEqual({ valido: false, motivo: 'LONGITUD' });
  });
});
