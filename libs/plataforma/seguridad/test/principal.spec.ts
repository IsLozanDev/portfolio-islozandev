import { mfaEn, mfaVigente, type EntradaAmr, type Principal } from '../src/domain/principal.js';
import { AutenticacionNoDisponibleError, MfaRequeridaError, TokenInvalidoError } from '../src/domain/errores.js';

const AHORA = new Date('2026-11-03T15:00:00Z');
const hace = (seg: number) => AHORA.getTime() / 1000 - seg;

const principal = (aal: Principal['aal'], amr: EntradaAmr[]): Principal => ({
  usuarioId: '0193f3a0-0000-7000-8000-000000000001',
  tenantId: null,
  tipo: 'EXTERNO',
  aal,
  sesionId: 's-1',
  amr,
});

describe('mfaVigente', () => {
  it('aal1 nunca es vigente, aunque traiga totp reciente', () => {
    expect(mfaVigente(principal('aal1', [{ method: 'totp', timestamp: hace(60) }]), AHORA, 900)).toBe(false);
  });

  it('aal2 sin entrada MFA no es vigente', () => {
    expect(mfaVigente(principal('aal2', [{ method: 'password', timestamp: hace(10) }]), AHORA, 900)).toBe(false);
  });

  it('totp de hace 5 min es vigente (TR-CA-047)', () => {
    expect(mfaVigente(principal('aal2', [{ method: 'totp', timestamp: hace(300) }]), AHORA, 900)).toBe(true);
  });

  it('totp de hace 40 min no es vigente (TR-CA-048)', () => {
    expect(mfaVigente(principal('aal2', [{ method: 'totp', timestamp: hace(2400) }]), AHORA, 900)).toBe(false);
  });

  it('con varios factores gana el más reciente', () => {
    const p = principal('aal2', [
      { method: 'totp', timestamp: hace(2400) },
      { method: 'webauthn', timestamp: hace(120) },
      { method: 'password', timestamp: hace(3000) },
    ]);
    expect(mfaVigente(p, AHORA, 900)).toBe(true);
  });

  it('password reciente no cuenta como MFA', () => {
    const p = principal('aal2', [
      { method: 'password', timestamp: hace(5) },
      { method: 'totp', timestamp: hace(1000) },
    ]);
    expect(mfaVigente(p, AHORA, 900)).toBe(false);
  });

  it('el límite exacto de 900 s es vigente y 901 s no', () => {
    expect(mfaVigente(principal('aal2', [{ method: 'phone', timestamp: hace(900) }]), AHORA, 900)).toBe(true);
    expect(mfaVigente(principal('aal2', [{ method: 'phone', timestamp: hace(901) }]), AHORA, 900)).toBe(false);
  });

  it('respeta una ventana configurada menor', () => {
    expect(mfaVigente(principal('aal2', [{ method: 'totp', timestamp: hace(120) }]), AHORA, 60)).toBe(false);
  });
});

describe('mfaEn', () => {
  it('devuelve la hora del factor MFA más reciente', () => {
    const p = principal('aal2', [
      { method: 'totp', timestamp: hace(600) },
      { method: 'totp', timestamp: hace(300) },
    ]);
    expect(mfaEn(p)).toEqual(new Date(AHORA.getTime() - 300_000));
  });

  it('devuelve null sin factor MFA', () => {
    expect(mfaEn(principal('aal1', []))).toBeNull();
    expect(mfaEn(principal('aal1', [{ method: 'oauth', timestamp: hace(1) }]))).toBeNull();
  });
});

describe('errores', () => {
  it('exponen el código y conservan el motivo para el log', () => {
    const e = new TokenInvalidoError('firma');
    expect(e.code).toBe('TOKEN_INVALIDO');
    expect(e.motivo).toBe('firma');
    expect(new MfaRequeridaError(900)).toMatchObject({ code: 'MFA_REQUERIDA', maxEdadSeg: 900 });
    expect(new AutenticacionNoDisponibleError().code).toBe('AUTENTICACION_NO_DISPONIBLE');
  });
});
