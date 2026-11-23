import { CertificadoLeido } from '../src/domain/certificado-leido.js';
import {
  ArchivoCertificadoInvalidoError,
  CertificadoOtroRucError,
  CertificadoSinRucError,
  CertificadoVencidoError,
  ClaveCertificadoIncorrectaError,
} from '../src/domain/errores.js';
import { LectorCertificadoForge } from '../src/infrastructure/forge/lector-certificado.forge.js';
import { bytesAleatorios, CLAVE_PFX, crearPfx, enDias, OTRO_RUC, RUC_EMPRESA, sujetoConRuc, textoPlano } from './support/certificados.js';

const AHORA = new Date('2026-11-22T15:00:00.000Z');
const SESENTA_KB = 60 * 1024;
const HEX_64 = /^[0-9a-f]{64}$/;

describe('LectorCertificadoForge (node-forge)', () => {
  const lector = new LectorCertificadoForge();

  it('abre un .pfx PBES2/AES-256 vigente del RUC 20601234561: RUC, fechas y huella SHA-256 del DER', () => {
    const vence = enDias(AHORA, 200);
    const leido = lector.leer(crearPfx(AHORA, { venceEn: vence }), CLAVE_PFX);

    expect(leido).toBeInstanceOf(CertificadoLeido);
    expect(leido.ruc).toBe(RUC_EMPRESA);
    expect(Math.abs(leido.venceEn.getTime() - vence.getTime())).toBeLessThan(1000);
    expect(leido.huellaSha256).toMatch(HEX_64);
    expect(() => leido.validarPara(RUC_EMPRESA, AHORA)).not.toThrow();
  });

  it('abre un .pfx 3DES antiguo', () => {
    expect(lector.leer(crearPfx(AHORA, { algoritmo: '3des' }), CLAVE_PFX).ruc).toBe(RUC_EMPRESA);
  });

  it('toma el certificado de la llave aunque el contenedor traiga la cadena', () => {
    const leido = lector.leer(crearPfx(AHORA, { conCadena: true }), CLAVE_PFX);
    expect(leido.ruc).toBe(RUC_EMPRESA);
  });

  it('dos .pfx distintos tienen huellas distintas; el mismo .pfx, la misma', () => {
    const pfx = crearPfx(AHORA);
    expect(lector.leer(pfx, CLAVE_PFX).huellaSha256).toBe(lector.leer(pfx, CLAVE_PFX).huellaSha256);
    expect(lector.leer(crearPfx(AHORA), CLAVE_PFX).huellaSha256).not.toBe(lector.leer(pfx, CLAVE_PFX).huellaSha256);
  });

  it('el RUC en OU con texto `RUC:20601234561`', () => {
    const sujeto = [
      { name: 'commonName', value: 'JUAN PEREZ' },
      { shortName: 'OU', value: `RUC:${RUC_EMPRESA}` },
    ];
    expect(lector.leer(crearPfx(AHORA, { sujeto }), CLAVE_PFX).ruc).toBe(RUC_EMPRESA);
  });

  it('un .pfx de otro RUC se lee, pero no vale para la empresa (TR-CA-134)', () => {
    const leido = lector.leer(crearPfx(AHORA, { sujeto: sujetoConRuc(OTRO_RUC) }), CLAVE_PFX);
    expect(() => leido.validarPara(RUC_EMPRESA, AHORA)).toThrow(CertificadoOtroRucError);
  });

  it('un .pfx vencido se lee, pero no vale', () => {
    const leido = lector.leer(crearPfx(AHORA, { emitidoEn: enDias(AHORA, -400), venceEn: enDias(AHORA, -1) }), CLAVE_PFX);
    expect(() => leido.validarPara(RUC_EMPRESA, AHORA)).toThrow(CertificadoVencidoError);
  });

  it('sin RUC en el sujeto → CertificadoSinRucError', () => {
    expect(() => lector.leer(crearPfx(AHORA, { sujeto: [{ name: 'commonName', value: 'SIN RUC' }] }), CLAVE_PFX)).toThrow(CertificadoSinRucError);
  });

  it('clave incorrecta → ClaveCertificadoIncorrectaError, sin la clave en el mensaje', () => {
    const intento = () => lector.leer(crearPfx(AHORA), 'otra-clave');
    expect(intento).toThrow(ClaveCertificadoIncorrectaError);
    expect(intento).not.toThrow(/otra-clave/);
  });

  it('un archivo de texto o 60 KB al azar → ArchivoCertificadoInvalidoError', () => {
    expect(() => lector.leer(textoPlano(), CLAVE_PFX)).toThrow(ArchivoCertificadoInvalidoError);
    expect(() => lector.leer(bytesAleatorios(SESENTA_KB), CLAVE_PFX)).toThrow(ArchivoCertificadoInvalidoError);
  });
});
