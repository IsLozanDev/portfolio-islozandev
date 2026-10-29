import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_ADMIN, MENSAJES_ASIGNACION } from '../../models/mensajes-admin';
import { fechaCalendario, type GrupoAsignacion } from '../../utils/formulario-asignacion';
import { AsignacionNuevaPage } from './asignacion-nueva.page';

const RUTA_DETALLE = '/admin/usuarios/m-luis';
const RUTA_ASIGNAR = `${RUTA_DETALLE}/asignar`;
const RUTA_MFA = '/auth/mfa';
const ASIGNABLES = { roles: [{ id: 'r-cajero', codigo: 'CAJERO', nombre: 'Cajero', producto_codigo: 'REST', sensible: false }], perfiles: [] };

@Component({ template: '' })
class Destino {}

describe('AsignacionNuevaPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;
  let avisos: { toast: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperar = (ruta: string): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}${ruta}`);
  const pagina = () => harness.routeDebugElement?.componentInstance as { grupo: GrupoAsignacion };

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/usuarios/:membresiaId/asignar', component: AsignacionNuevaPage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { mfa: RUTA_MFA } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(RUTA_ASIGNAR);
    await estable();
    esperar('/seg/asignables').flush(ASIGNABLES);
    await estable();
    esperar('/org/empresas').flush({ items: [], total: 0 });
    await estable();
  }

  async function pulsarAsignar(): Promise<void> {
    const boton = [...elemento().querySelectorAll<HTMLButtonElement>('button')].find((candidato) => candidato.textContent?.trim() === MENSAJES_ADMIN.asignar);
    boton?.click();
    await estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion();
    sesion.contexto.set({ permisos: [], mfaVigente: true });
    avisos = { toast: vi.fn(), advertencia: vi.fn(async () => undefined) };
  });

  afterEach(() => http.verify());

  it('envía vigente_desde de hoy por defecto y vuelve al detalle con un toast', async () => {
    await abrir();
    pagina().grupo.patchValue({ asignable: 'rol:r-cajero', alcance: 'TENANT' });
    await pulsarAsignar();

    const peticion = esperar('/seg/asignaciones');
    expect(peticion.request.body).toMatchObject({ membresia_id: 'm-luis', rol_id: 'r-cajero', alcance: 'TENANT', vigente_desde: fechaCalendario(new Date()), vigente_hasta: null });
    peticion.flush({ asignacion_id: 'a-1' }, { status: 201, statusText: 'Created' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_ADMIN.asignacionOtorgada);
    expect(url()).toBe(RUTA_DETALLE);
  });

  it('OTORGANTE_SIN_ALCANCE se muestra en el formulario y no navega', async () => {
    await abrir();
    pagina().grupo.patchValue({ asignable: 'rol:r-cajero', alcance: 'TENANT' });
    await pulsarAsignar();

    esperar('/seg/asignaciones').flush(
      { codigo: 'OTORGANTE_SIN_ALCANCE', mensaje: 'El otorgante no tiene un alcance igual o mayor sobre el destino' },
      { status: 403, statusText: 'Forbidden' },
    );
    await estable();

    expect(elemento().querySelector('p[role=alert].rounded-tarjeta')?.textContent?.trim()).toBe('El otorgante no tiene un alcance igual o mayor sobre el destino');
    expect(url()).toBe(RUTA_ASIGNAR);
  });

  it('TR-CA-038: hasta anterior a desde muestra el mensaje y «Asignar» no envía la petición', async () => {
    await abrir();
    pagina().grupo.patchValue({ asignable: 'rol:r-cajero', alcance: 'TENANT', vigenteDesde: new Date(2026, 9, 20), vigenteHasta: new Date(2026, 9, 19) });
    await pulsarAsignar();

    expect(elemento().querySelector('[data-error=vigencia]')?.textContent?.trim()).toBe(MENSAJES_ASIGNACION.vigenciaInvalida);
    expect(url()).toBe(RUTA_ASIGNAR);
  });

  it('si el MFA venció mientras llenaba, no envía y lleva a /auth/mfa', async () => {
    await abrir();
    pagina().grupo.patchValue({ asignable: 'rol:r-cajero', alcance: 'TENANT' });
    sesion.contexto.set({ permisos: [], mfaVigente: false });
    await pulsarAsignar();

    await vi.waitFor(() => expect(url()).toBe(`${RUTA_MFA}?returnUrl=${encodeURIComponent(RUTA_ASIGNAR)}`));
  });

  it('cancelar vuelve al detalle sin enviar', async () => {
    await abrir();
    const cancelar = [...elemento().querySelectorAll<HTMLButtonElement>('button')].find((boton) => boton.textContent?.trim() === 'Cancelar');
    cancelar?.click();
    await estable();

    expect(url()).toBe(RUTA_DETALLE);
  });
});
