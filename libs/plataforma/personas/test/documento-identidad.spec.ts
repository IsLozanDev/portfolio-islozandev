import { DocumentoIdentidad } from '../src/domain/documento-identidad.js';
import { DocumentoInvalidoPersonaError, TipoDocumentoNoAdmitidoError } from '../src/domain/errores.js';

describe('DocumentoIdentidad', () => {
  it.each([
    ['DNI', '45781236'],
    ['CE', '001234567'],
    ['RUC', '20100070970'],
    ['RUC', '10467793549'],
    ['PASAPORTE', 'AB1234567890'],
  ])('acepta %s %s', (tipo, numero) => {
    const documento = DocumentoIdentidad.crear(tipo, numero);

    expect(documento).toMatchObject({ tipo, numero });
  });

  it.each(['DOC_0', 'PAS', 'dni', ''])('rechaza el tipo %s por no admitido', (tipo) => {
    expect(() => DocumentoIdentidad.crear(tipo, '45781236')).toThrow(TipoDocumentoNoAdmitidoError);
  });

  it.each([
    ['DNI', '4578123A', 'CARACTERES'],
    ['DNI', '4578123', 'LONGITUD'],
    ['RUC', '30601234567', 'PREFIJO'],
    ['RUC', '20601234560', 'DIGITO_VERIFICADOR'],
    ['CE', '', 'LONGITUD'],
    ['PASAPORTE', 'AB-123', 'CARACTERES'],
    ['PASAPORTE', 'AB12345678901', 'LONGITUD'],
  ])('rechaza %s %s con motivo %s', (tipo, numero, motivo) => {
    const crear = () => DocumentoIdentidad.crear(tipo, numero);

    expect(crear).toThrow(DocumentoInvalidoPersonaError);
    expect(crear).toThrow(expect.objectContaining({ code: 'DOCUMENTO_INVALIDO', motivo }));
  });

  it('el error de documento inválido no lleva el número (TR-RNF-026)', () => {
    expect(() => DocumentoIdentidad.crear('DNI', '4578123A')).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('4578123A') }),
    );
  });

  it.each([
    ['DNI', '45781236', true],
    ['RUC', '20100070970', true],
    ['CE', '001234567', false],
    ['PASAPORTE', 'AB123456', false],
  ])('%s %s consultable: %s', (tipo, numero, consultable) => {
    expect(DocumentoIdentidad.crear(tipo, numero).esConsultable()).toBe(consultable);
  });

  it('distingue el prefijo solo en un RUC', () => {
    expect(DocumentoIdentidad.crear('RUC', '20100070970').esRucConPrefijo(['20'])).toBe(true);
    expect(DocumentoIdentidad.crear('RUC', '10467793549').esRucConPrefijo(['20'])).toBe(false);
    expect(DocumentoIdentidad.crear('DNI', '20100070').esRucConPrefijo(['20'])).toBe(false);
  });

  it('reconstituye sin validar', () => {
    expect(DocumentoIdentidad.reconstituir('CE', 'X1')).toMatchObject({ tipo: 'CE', numero: 'X1' });
  });
});
