import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from '@supabase/supabase-js';
import { DobleSupabase, proveerAuthDePrueba, responderMiContexto, sesionDePrueba } from '../../testing/doble-supabase';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { ErrorAuth, MENSAJES_AUTH } from '../models/errores';
import { CABECERA_SUCURSAL, SesionService } from './sesion.service';

describe('SesionService (sesión)', () => {
  let supabase: DobleSupabase;
  let servicio: SesionService;
  let http: HttpTestingController;

  /** Con sesión guardada, `iniciar()` también pide el contexto. */
  async function iniciarConSesion(): Promise<void> {
    supabase.sesionGuardada ??= sesionDePrueba();
    await Promise.all([servicio.iniciar(), responderMiContexto(http)]);
  }

  beforeEach(() => {
    supabase = new DobleSupabase();
    TestBed.configureTestingModule({ providers: proveerAuthDePrueba(supabase) });
    servicio = TestBed.inject(SesionService);
    http = TestBed.inject(HttpTestingController);
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => http.verify());

  describe('iniciar', () => {
    it('lee la sesión guardada en la cookie', async () => {
      supabase.sesionGuardada = sesionDePrueba('token-guardado');

      await iniciarConSesion();

      expect(servicio.autenticado()).toBe(true);
      expect(servicio.token()).toBe('token-guardado');
    });

    it('inicializa Supabase una sola vez aunque se llame varias veces', async () => {
      await Promise.all([servicio.iniciar(), servicio.iniciar()]);

      expect(supabase.inicializar).toHaveBeenCalledTimes(1);
      expect(supabase.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    });

    it('sin sesión queda no autenticado', async () => {
      await servicio.iniciar();

      expect(servicio.autenticado()).toBe(false);
      expect(servicio.token()).toBeNull();
    });
  });

  describe('cambios de sesión', () => {
    it('SIGNED_IN y TOKEN_REFRESHED actualizan la sesión', async () => {
      await servicio.iniciar();

      supabase.emitir('SIGNED_IN', sesionDePrueba('nuevo'));
      expect(servicio.token()).toBe('nuevo');

      supabase.emitir('TOKEN_REFRESHED', sesionDePrueba('renovado'));
      expect(servicio.token()).toBe('renovado');
    });

    it('SIGNED_OUT (p. ej. desde otra pestaña) deja sesión y contexto en null', async () => {
      await iniciarConSesion();
      expect(servicio.contexto()).not.toBeNull();

      supabase.emitir('SIGNED_OUT', null);

      expect(servicio.sesion()).toBeNull();
      expect(servicio.contexto()).toBeNull();
    });
  });

  describe('ingresarConClave', () => {
    it('envía correo y clave a Supabase', async () => {
      await servicio.ingresarConClave('rosa@correo.pe', 'secreta');

      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'rosa@correo.pe', password: 'secreta' });
    });

    it('con clave errónea lanza CREDENCIALES_INVALIDAS con el mismo mensaje que una cuenta inexistente', async () => {
      supabase.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials') });
      const claveErronea = await servicio.ingresarConClave('rosa@correo.pe', 'mala').catch((error: unknown) => error);

      supabase.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: new AuthApiError('User not found', 400, 'user_not_found') });
      const cuentaInexistente = await servicio.ingresarConClave('nadie@correo.pe', 'x').catch((error: unknown) => error);

      expect(claveErronea).toBeInstanceOf(ErrorAuth);
      expect((claveErronea as ErrorAuth).codigo).toBe('CREDENCIALES_INVALIDAS');
      expect((cuentaInexistente as ErrorAuth).message).toBe((claveErronea as ErrorAuth).message);
    });
  });

  describe('ingresarConProveedor', () => {
    it.each(['google', 'azure'] as const)('%s redirige a origen + /auth/callback', async (proveedor) => {
      await servicio.ingresarConProveedor(proveedor);

      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: proveedor,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    });

    it('usa la ruta de callback configurada', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: proveerAuthDePrueba(supabase, { rutas: { callback: '/entrar/vuelta' } }) });

      await TestBed.inject(SesionService).ingresarConProveedor('google');

      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ options: { redirectTo: `${window.location.origin}/entrar/vuelta` } }),
      );
    });
  });

  describe('ingresarConProveedor con retorno', () => {
    it('agrega returnUrl codificado al redirectTo', async () => {
      await servicio.ingresarConProveedor('google', '/caja?turno=1');

      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          options: { redirectTo: `${window.location.origin}/auth/callback?returnUrl=%2Fcaja%3Fturno%3D1` },
        }),
      );
    });
  });

  describe('completarCallback', () => {
    it('con sesión canjeada resuelve', async () => {
      await iniciarConSesion();

      await expect(servicio.completarCallback()).resolves.toBeUndefined();
    });

    it('con ?error= en la URL lanza ENLACE_INVALIDO', async () => {
      window.history.replaceState(null, '', '/auth/callback?error=access_denied&error_description=denegado');

      await expect(servicio.completarCallback()).rejects.toMatchObject({ codigo: 'ENLACE_INVALIDO' });
    });

    it('con #error_code= en el fragmento lanza ENLACE_INVALIDO', async () => {
      window.history.replaceState(null, '', '/auth/callback#error_code=otp_expired');

      await expect(servicio.completarCallback()).rejects.toMatchObject({ codigo: 'ENLACE_INVALIDO' });
    });

    it('si el canje PKCE falla lanza ENLACE_INVALIDO con la causa', async () => {
      const errorDeCanje = new AuthApiError('invalid flow state', 400, 'flow_state_not_found');
      supabase.errorDeInicio = errorDeCanje;

      await expect(servicio.completarCallback()).rejects.toMatchObject({ codigo: 'ENLACE_INVALIDO', cause: errorDeCanje });
    });

    it('sin sesión tras el canje lanza ENLACE_INVALIDO', async () => {
      await expect(servicio.completarCallback()).rejects.toMatchObject({ codigo: 'ENLACE_INVALIDO' });
    });
  });

  describe('recuperarClave', () => {
    it('usa origen + /auth/nueva-clave', async () => {
      await servicio.recuperarClave('rosa@correo.pe');

      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('rosa@correo.pe', {
        redirectTo: `${window.location.origin}/auth/nueva-clave`,
      });
    });

    it('resuelve sin error para un correo inexistente', async () => {
      supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: new AuthApiError('User not found', 404, 'user_not_found') });

      await expect(servicio.recuperarClave('nadie@correo.pe')).resolves.toBeUndefined();
    });

    it('propaga el límite de envíos y la falta de conexión', async () => {
      supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: new AuthApiError('rate', 429, 'over_email_send_rate_limit') });
      await expect(servicio.recuperarClave('rosa@correo.pe')).rejects.toMatchObject({ codigo: 'DEMASIADOS_INTENTOS' });

      supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: new AuthRetryableFetchError('fetch failed', 0) });
      await expect(servicio.recuperarClave('rosa@correo.pe')).rejects.toMatchObject({ codigo: 'SIN_CONEXION' });
    });
  });

  describe('actualizarClave', () => {
    it('llama a updateUser con la clave nueva', async () => {
      await servicio.actualizarClave('Nueva-Clave-2026');

      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'Nueva-Clave-2026' });
    });

    it('un rechazo por clave débil da CLAVE_DEBIL', async () => {
      supabase.auth.updateUser.mockResolvedValueOnce({ data: {}, error: new AuthWeakPasswordError('weak', 422, ['length']) });

      await expect(servicio.actualizarClave('123')).rejects.toMatchObject({
        codigo: 'CLAVE_DEBIL',
        message: MENSAJES_AUTH.CLAVE_DEBIL,
      });
    });
  });

  describe('verificarEnlace', () => {
    it('canjea el token_hash con verifyOtp y deja la sesión del enlace', async () => {
      await servicio.verificarEnlace('hash-123', 'recovery');

      expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-123', type: 'recovery' });
      expect(servicio.token()).toBe('token-enlace');
    });

    it('un enlace vencido da ENLACE_INVALIDO', async () => {
      supabase.auth.verifyOtp.mockResolvedValueOnce({
        data: { session: null },
        error: new AuthApiError('Email link is invalid or has expired', 403, 'otp_expired'),
      });

      await expect(servicio.verificarEnlace('hash-viejo', 'invite')).rejects.toMatchObject({
        codigo: 'ENLACE_INVALIDO',
        message: MENSAJES_AUTH.ENLACE_INVALIDO,
      });
      expect(servicio.autenticado()).toBe(false);
    });
  });

  describe('refrescarSesion', () => {
    it('pide un token nuevo y luego recarga mi-contexto', async () => {
      await iniciarConSesion();

      await Promise.all([servicio.refrescarSesion(), responderMiContexto(http)]);

      expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
      expect(servicio.token()).toBe('token-refrescado');
    });

    it('con el interceptor, recarga mi-contexto sin la sucursal del tenant anterior', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: proveerAuthDePrueba(supabase, {}, [authInterceptor]) });
      servicio = TestBed.inject(SesionService);
      http = TestBed.inject(HttpTestingController);
      await iniciarConSesion();
      expect(servicio.sucursalId()).not.toBeNull();

      const [, peticion] = await Promise.all([servicio.refrescarSesion(), responderMiContexto(http)]);

      expect(peticion.request.headers.has(CABECERA_SUCURSAL)).toBe(false);
    });

    it('si Supabase no renueva, propaga el error sin pedir el contexto', async () => {
      await iniciarConSesion();
      supabase.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new AuthRetryableFetchError('red', 0) });

      await expect(servicio.refrescarSesion()).rejects.toMatchObject({ codigo: 'SIN_CONEXION' });
    });
  });

  describe('salir', () => {
    it('cierra la sesión local y limpia el estado', async () => {
      await iniciarConSesion();

      await servicio.salir();

      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(servicio.autenticado()).toBe(false);
      expect(servicio.contexto()).toBeNull();
    });
  });
});
