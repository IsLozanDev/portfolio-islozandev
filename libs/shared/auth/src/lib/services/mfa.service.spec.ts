import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApiError } from '@supabase/supabase-js';
import { contextoDePrueba, DobleSupabase, esperarMiContexto, proveerAuthDePrueba, responderMiContexto } from '../../testing/doble-supabase';
import { MENSAJES_AUTH } from '../models/errores';
import { MfaService } from './mfa.service';
import { SesionService } from './sesion.service';

describe('MfaService (TR-RF-017)', () => {
  let supabase: DobleSupabase;
  let mfa: MfaService;
  let http: HttpTestingController;

  beforeEach(() => {
    supabase = new DobleSupabase();
    TestBed.configureTestingModule({ providers: proveerAuthDePrueba(supabase) });
    mfa = TestBed.inject(MfaService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('estado', () => {
    it('sin factores: aal1 y hay que enrolar', async () => {
      expect(await mfa.estado()).toEqual({ nivelActual: 'aal1', nivelSiguiente: 'aal1', factorTotpId: null });
    });

    it('con factor verificado y sesión aal1: requiere verificación con ese factor', async () => {
      supabase.factores = [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }];
      supabase.nivelSiguiente = 'aal2';

      expect(await mfa.estado()).toEqual({ nivelActual: 'aal1', nivelSiguiente: 'aal2', factorTotpId: 'factor-1' });
      expect(await mfa.requiereVerificacion()).toBe(true);
    });

    it('con sesión aal2 ya no requiere verificación', async () => {
      supabase.nivelActual = 'aal2';
      supabase.nivelSiguiente = 'aal2';

      expect(await mfa.requiereVerificacion()).toBe(false);
      expect(await mfa.tieneNivelMfa()).toBe(true);
    });

    it('un factor sin verificar no cuenta como enrolado', async () => {
      supabase.factores = [{ id: 'pendiente', factor_type: 'totp', status: 'unverified' }];

      expect((await mfa.estado()).factorTotpId).toBeNull();
    });
  });

  describe('enrolarTotp', () => {
    it('borra antes los TOTP sin verificar y devuelve factorId, qr y secreto', async () => {
      supabase.factores = [
        { id: 'pendiente-1', factor_type: 'totp', status: 'unverified' },
        { id: 'verificado', factor_type: 'totp', status: 'verified' },
        { id: 'pendiente-2', factor_type: 'totp', status: 'unverified' },
      ];

      const enrolamiento = await mfa.enrolarTotp();

      expect(supabase.auth.mfa.unenroll.mock.calls.map(([parametros]) => parametros.factorId)).toEqual(['pendiente-1', 'pendiente-2']);
      expect(supabase.auth.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'App autenticadora' });
      expect(enrolamiento).toEqual({ factorId: 'factor-nuevo', qr: 'data:image/svg+xml;utf-8,<svg/>', secreto: 'SECRETO' });
    });

    it('sin pendientes no borra nada', async () => {
      await mfa.enrolarTotp();

      expect(supabase.auth.mfa.unenroll).not.toHaveBeenCalled();
    });
  });

  describe('verificarTotp', () => {
    it('con código erróneo lanza CODIGO_MFA_INVALIDO y no recarga el contexto', async () => {
      supabase.auth.mfa.challengeAndVerify.mockResolvedValueOnce({
        data: {},
        error: new AuthApiError('Invalid TOTP code entered', 422, 'mfa_verification_failed'),
      });

      await expect(mfa.verificarTotp('factor-1', '000000')).rejects.toMatchObject({
        codigo: 'CODIGO_MFA_INVALIDO',
        message: MENSAJES_AUTH.CODIGO_MFA_INVALIDO,
      });
      http.expectNone(() => true);
    });

    it('con código bueno verifica y recarga el contexto', async () => {
      await Promise.all([
        mfa.verificarTotp('factor-1', '123456'),
        responderMiContexto(http, contextoDePrueba({ aal: 'aal2', mfa_vigente: true, mfa_en: '2026-10-26T14:00:00.000Z' })),
      ]);

      expect(supabase.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
      expect(TestBed.inject(SesionService).contexto()?.mfaVigente).toBe(true);
    });

    it('si mi-contexto responde SIN_TENANT, la verificación igual resuelve y el contexto queda en null', async () => {
      const verificacion = mfa.verificarTotp('factor-1', '123456');

      (await esperarMiContexto(http)).flush({ codigo: 'SIN_TENANT' }, { status: 403, statusText: 'Forbidden' });

      await expect(verificacion).resolves.toBeUndefined();
      expect(TestBed.inject(SesionService).contexto()).toBeNull();
    });
  });
});
