import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { ConfigAuth } from '../config/config';
import { DobleSupabase, proveerAuthDePrueba, responderMiContexto, sesionDePrueba } from '../../testing/doble-supabase';
import { CLAVE_ULTIMA_ACTIVIDAD, InactividadService } from './inactividad.service';
import { SesionService } from './sesion.service';

@Component({ template: '' })
class Pagina {}

const MINUTO = 60_000;

describe('InactividadService (TR-RNF-014)', () => {
  let supabase: DobleSupabase;
  let sesion: SesionService;
  let router: Router;

  async function arrancar(config: Partial<ConfigAuth> = {}): Promise<void> {
    supabase.sesionGuardada = sesionDePrueba();
    TestBed.configureTestingModule({
      providers: [...proveerAuthDePrueba(supabase, config), provideRouter([{ path: '**', component: Pagina }])],
    });
    sesion = TestBed.inject(SesionService);
    router = TestBed.inject(Router);
    await Promise.all([sesion.iniciar(), responderMiContexto(TestBed.inject(HttpTestingController))]);
    await router.navigateByUrl('/caja');
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    TestBed.inject(InactividadService);
    TestBed.tick();
  }

  function pasar(minutos: number): void {
    vi.advanceTimersByTime(minutos * MINUTO);
  }

  function actuar(): void {
    document.dispatchEvent(new KeyboardEvent('keydown'));
  }

  beforeEach(() => {
    supabase = new DobleSupabase();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('tras 30 min sin actividad en ninguna pestaña cierra la sesión y va a /auth/ingresar?motivo=inactividad', async () => {
    await arrancar();

    pasar(30);

    await vi.waitFor(() => expect(router.url).toBe('/auth/ingresar?motivo=inactividad'));
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(sesion.autenticado()).toBe(false);
  });

  it('antes de 30 min no cierra', async () => {
    await arrancar();

    pasar(29);

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('la actividad en esta pestaña reinicia el plazo', async () => {
    await arrancar();
    pasar(20);
    actuar();

    pasar(20);

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('si otra pestaña registró actividad hace menos de 30 min, no cierra', async () => {
    await arrancar();
    pasar(25);
    localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(Date.now()));

    pasar(10);

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('comparte la última actividad con las otras pestañas', async () => {
    await arrancar();

    expect(Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD))).toBe(Date.now());
  });

  it('una marca vieja de una sesión anterior no cierra la sesión nueva', async () => {
    localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(Date.now() - 120 * MINUTO));
    await arrancar();

    pasar(1);

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('inactividadMinutos: 5 cambia el plazo', async () => {
    await arrancar({ inactividadMinutos: 5 });

    pasar(5);

    await vi.waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
  });

  it('al volver a la pestaña tras el plazo cierra aunque el temporizador no haya corrido', async () => {
    await arrancar();
    vi.setSystemTime(Date.now() + 31 * MINUTO);

    document.dispatchEvent(new Event('visibilitychange'));

    await vi.waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
  });

  it('se detiene en SIGNED_OUT', async () => {
    await arrancar();

    supabase.emitir('SIGNED_OUT', null);
    TestBed.tick();
    pasar(60);

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('sin almacenamiento disponible sigue con la actividad de esta pestaña', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    await arrancar();

    pasar(30);

    await vi.waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
    vi.restoreAllMocks();
  });
});
