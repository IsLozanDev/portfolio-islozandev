import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  contextoDePrueba,
  DobleSupabase,
  esperarMiContexto,
  proveerAuthDePrueba,
  responderMiContexto,
  sesionApiDePrueba,
  URL_VERIFICAR_MFA,
} from '../../testing/doble-supabase';
import { MENSAJES_AUTH } from '../models/errores';
import { OMITIR_AVISO_ERROR } from '../models/omitir-aviso-error';
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

  describe('verificarTotp (por la API, spec 18b)', () => {
    async function verificar(codigo: string) {
      const resultado = mfa.verificarTotp('factor-1', codigo).then(
        () => null,
        (error: unknown) => error,
      );
      const peticion = await vi.waitFor(() => http.expectOne(URL_VERIFICAR_MFA));
      return { peticion, resultado };
    }

    it('con código erróneo lanza CODIGO_MFA_INVALIDO y no recarga el contexto', async () => {
      const { peticion, resultado } = await verificar('000000');
      peticion.flush({ codigo: 'CODIGO_MFA_INVALIDO' }, { status: 400, statusText: 'Bad Request' });

      expect(await resultado).toMatchObject({ codigo: 'CODIGO_MFA_INVALIDO', message: MENSAJES_AUTH.CODIGO_MFA_INVALIDO });
      expect(supabase.auth.setSession).not.toHaveBeenCalled();
      http.expectNone(() => true);
    });

    it('el quinto código erróneo (429) dice los minutos del bloqueo', async () => {
      const { peticion, resultado } = await verificar('000000');
      peticion.flush({ codigo: 'INGRESO_BLOQUEADO', reintentarEnSeg: 60 }, { status: 429, statusText: 'Too Many Requests' });

      expect(await resultado).toMatchObject({ codigo: 'INGRESO_BLOQUEADO', message: 'Demasiados intentos. Vuelva a intentarlo en 1 minuto.' });
    });

    it('con código bueno adopta la sesión aal2 y recarga el contexto', async () => {
      const { peticion, resultado } = await verificar('123456');
      expect(peticion.request.body).toEqual({ factorId: 'factor-1', codigo: '123456' });
      expect(peticion.request.context.get(OMITIR_AVISO_ERROR)).toBe(true);
      peticion.flush(sesionApiDePrueba('token-aal2'));
      await responderMiContexto(http, contextoDePrueba({ aal: 'aal2', mfa_vigente: true, mfa_en: '2026-10-26T14:00:00.000Z' }));

      expect(await resultado).toBeNull();
      expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'token-aal2', refresh_token: 'refresh-token-aal2' });
      expect(TestBed.inject(SesionService).contexto()?.mfaVigente).toBe(true);
    });

    it('si mi-contexto responde SIN_TENANT, la verificación igual resuelve y el contexto queda en null', async () => {
      const { peticion, resultado } = await verificar('123456');
      peticion.flush(sesionApiDePrueba('token-aal2'));

      (await esperarMiContexto(http)).flush({ codigo: 'SIN_TENANT' }, { status: 403, statusText: 'Forbidden' });

      expect(await resultado).toBeNull();
      expect(TestBed.inject(SesionService).contexto()).toBeNull();
    });
  });
});
