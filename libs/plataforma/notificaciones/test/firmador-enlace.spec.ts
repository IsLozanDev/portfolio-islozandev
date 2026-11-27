import { createHmac } from 'node:crypto';
import { vencimientoEnlace, type CargaEnlace } from '../src/domain/enlace-preferencias.js';
import { FirmadorEnlaceHmac } from '../src/infrastructure/crypto/firmador-enlace.hmac.js';
import { AHORA, TENANT_A } from './support/dobles.js';

const CLAVE = 'clave-de-prueba-de-al-menos-32-caracteres';
const OTRA_CLAVE = 'otra-clave-de-prueba-de-al-menos-32-caracteres';
const PERSONA = '46000000-0000-7000-8000-0000000000f1';
const UN_DIA_MS = 86_400_000;

const carga = (cambios: Partial<CargaEnlace> = {}): CargaEnlace => ({
  tenantId: TENANT_A,
  canal: 'CORREO',
  destinoHash: 'sha256:ana',
  personaId: PERSONA,
  venceEn: vencimientoEnlace(AHORA),
  ...cambios,
});

/** Firma con la clave correcta un cuerpo arbitrario: la firma coincide, la forma no. */
function firmadoConForma(cuerpo: unknown): string {
  const codificado = Buffer.from(JSON.stringify(cuerpo), 'utf8').toString('base64url');
  return `${codificado}.${createHmac('sha256', CLAVE).update(codificado).digest('base64url')}`;
}

describe('FirmadorEnlaceHmac', () => {
  const firmador = new FirmadorEnlaceHmac(CLAVE);

  it('verifica el token que firmó y devuelve la misma carga', () => {
    const token = firmador.firmar(carga());

    expect(firmador.verificar(token, AHORA)).toEqual(carga());
  });

  it('sin persona la carga vuelve sin personaId', () => {
    const sinPersona = carga();
    delete sinPersona.personaId;
    const token = firmador.firmar(sinPersona);

    expect(firmador.verificar(token, AHORA)).toEqual(sinPersona);
  });

  it('el token no lleva el correo en claro', () => {
    const token = firmador.firmar(carga());

    expect(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8')).not.toContain('@');
  });

  it('TR-CA-194: un byte alterado en la carga o en la firma → null', () => {
    const token = firmador.firmar(carga());
    const [cuerpo, firma] = token.split('.') as [string, string];
    const alterar = (texto: string): string => `${texto[0] === 'A' ? 'B' : 'A'}${texto.slice(1)}`;

    expect(firmador.verificar(`${alterar(cuerpo)}.${firma}`, AHORA)).toBeNull();
    expect(firmador.verificar(`${cuerpo}.${alterar(firma)}`, AHORA)).toBeNull();
  });

  it('a los 30 días el token vence → null', () => {
    const token = firmador.firmar(carga());

    expect(firmador.verificar(token, new Date(AHORA.getTime() + 30 * UN_DIA_MS - 1))).not.toBeNull();
    expect(firmador.verificar(token, new Date(AHORA.getTime() + 30 * UN_DIA_MS))).toBeNull();
  });

  it('firmado con otra clave → null', () => {
    const token = new FirmadorEnlaceHmac(OTRA_CLAVE).firmar(carga());

    expect(firmador.verificar(token, AHORA)).toBeNull();
  });

  it.each(['', 'sin-punto', 'a.b.c', '.', 'no-es-base64.ni-esto'])('formato roto %p → null sin lanzar', (token) => {
    expect(firmador.verificar(token, AHORA)).toBeNull();
  });

  it.each([
    ['no es JSON', 'texto'],
    ['tenant que no es UUID', { ...carga(), tenantId: 'tenant', venceEn: AHORA.getTime() + UN_DIA_MS }],
    ['canal no habilitado', { ...carga(), canal: 'SMS', venceEn: AHORA.getTime() + UN_DIA_MS }],
    ['hash vacío', { ...carga(), destinoHash: '', venceEn: AHORA.getTime() + UN_DIA_MS }],
    ['persona que no es UUID', { ...carga(), personaId: 'ana', venceEn: AHORA.getTime() + UN_DIA_MS }],
    ['vencimiento que no es número', { ...carga(), venceEn: 'mañana' }],
    ['nulo', null],
  ])('firma válida con %s → null', (_caso, cuerpo) => {
    expect(firmador.verificar(firmadoConForma(cuerpo), AHORA)).toBeNull();
  });
});
