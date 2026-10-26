import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONFIG_DE_PRUEBA, DobleSupabase, responderMiContexto, sesionDePrueba } from '../../testing/doble-supabase';
import { CONFIG_AUTH, RUTAS_AUTH_POR_DEFECTO } from './config';
import { CLAVE_ULTIMA_ACTIVIDAD } from '../services/inactividad.service';
import { provideAuth } from './provide-auth';
import { SesionService } from '../services/sesion.service';
import { SupabaseCliente } from '../services/supabase.cliente';

describe('provideAuth', () => {
  let supabase: DobleSupabase;

  beforeEach(() => {
    supabase = new DobleSupabase();
    TestBed.configureTestingModule({
      providers: [
        provideAuth({ ...CONFIG_DE_PRUEBA, apiUrl: `${CONFIG_DE_PRUEBA.apiUrl}/`, inactividadMinutos: 5 }),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SupabaseCliente, useValue: supabase },
        provideRouter([]),
      ],
    });
  });

  it('arranca la vigilancia de inactividad sin que nadie inyecte el servicio', async () => {
    localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
    supabase.sesionGuardada = sesionDePrueba();

    await Promise.all([
      TestBed.inject(ApplicationInitStatus).donePromise,
      responderMiContexto(TestBed.inject(HttpTestingController)),
    ]);
    TestBed.tick();

    expect(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD)).not.toBeNull();
    localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD);
  });

  it('registra la configuración resuelta', () => {
    const config = TestBed.inject(CONFIG_AUTH);

    expect(config.apiUrl).toBe(CONFIG_DE_PRUEBA.apiUrl);
    expect(config.inactividadMinutos).toBe(5);
    expect(config.rutas).toEqual(RUTAS_AUTH_POR_DEFECTO);
  });

  it('lee la sesión y el contexto antes de terminar la inicialización de la app', async () => {
    supabase.sesionGuardada = sesionDePrueba();
    const inicializacion = TestBed.inject(ApplicationInitStatus);

    await Promise.all([inicializacion.donePromise, responderMiContexto(TestBed.inject(HttpTestingController))]);

    expect(supabase.inicializar).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(SesionService).autenticado()).toBe(true);
    expect(TestBed.inject(SesionService).contexto()).not.toBeNull();
  });
});
