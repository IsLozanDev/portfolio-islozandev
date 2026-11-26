import { CODIGOS_ERROR_FE, mensajeErrorFe } from '../models/mensajes-emisor';
import { TAMANO_MAXIMO_CERTIFICADO_BYTES, validarArchivoCertificado } from './validar-certificado';

const KB = 1024;

describe('validarArchivoCertificado', () => {
  it('acepta .pfx y .p12 de hasta 50 KB, sin importar mayúsculas', () => {
    expect(validarArchivoCertificado({ name: 'empresa.pfx', size: TAMANO_MAXIMO_CERTIFICADO_BYTES })).toBeNull();
    expect(validarArchivoCertificado({ name: 'EMPRESA.P12', size: 3 * KB })).toBeNull();
  });

  it('archivo de 51 KB o .txt: rechazado con su mensaje', () => {
    const grande = validarArchivoCertificado({ name: 'empresa.pfx', size: 51 * KB });
    expect(grande).toBe(CODIGOS_ERROR_FE.archivoDemasiadoGrande);
    expect(mensajeErrorFe(grande ?? '')).toBe('El archivo supera los 50 KB.');
    const texto = validarArchivoCertificado({ name: 'clave.txt', size: KB });
    expect(texto).toBe(CODIGOS_ERROR_FE.archivoCertificadoInvalido);
    expect(mensajeErrorFe(texto ?? '')).toBe('El archivo no es un certificado .pfx válido.');
  });
});
