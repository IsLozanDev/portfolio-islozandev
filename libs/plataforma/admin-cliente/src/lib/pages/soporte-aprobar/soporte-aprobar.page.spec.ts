import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_SOPORTE } from '../../models/mensajes-soporte';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { SoporteAprobarPage } from './soporte-aprobar.page';

const PENDIENTE = {
  id: 'a-1',
  agente: { id: 'u-javier', nombre: 'Javier Paredes', correo: 'javier.paredes@vitrina.pe' },
  ticket: 'SOP-000245',
  motivo: 'Revisar series de boletas',
  modo: 'LECTURA',
  horas_solicitadas: 3,
  estado: 'PENDIENTE',
  solicitado_en: '2026-11-04T19:10:00.000Z',
  caduca_en: '2026-11-05T19:10:00.000Z',
  horas_aprobadas: null,
  desde: null,
  hasta: null,
  aprobado_por: null,
  cerrado_por: null,
  cerrado_en: null,
  motivo_cierre: null,
  causa_cierre: null,
};
const ASIGNABLES = {
  roles: [{ id: 'r-soporte', codigo: 'SOPORTE_REST', nombre: 'Soporte restaurante', producto_codigo: 'REST', sensible: false }],
  perfiles: [{ id: 'p-caja', codigo: 'CAJA', nombre: 'Caja', sensible: false }],
};

@Component({ selector: 'vit-destino-aprobar', template: '' })
class Destino {}

describe('SoporteAprobarPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn> };
  const elemento = () => harness.routeNativeElement as HTMLElement;

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(pendientes: object[]): Promise<void> {
    const sesion = new DobleSesion();
    sesion.contexto.set({ permisos: [PERMISOS_ADMIN.soporteAutorizar], mfaVigente: true });
    avisos = { toast: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/soporte/:accesoId/aprobar', component: SoporteAprobarPage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { mfa: '/auth/mfa' } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create('/admin/soporte/a-1/aprobar');
    await estable();
    http.match(`${API_URL}/seg/soporte/solicitudes/pendientes`).forEach((peticion) => peticion.flush({ total: pendientes.length }));
    const lista = http.expectOne((peticion) => peticion.url === `${API_URL}/seg/soporte/solicitudes`);
    expect(lista.request.params.get('estado')).toBe('PENDIENTE');
    lista.flush({ items: pendientes, total: pendientes.length });
    http.expectOne(`${API_URL}/seg/asignables`).flush(ASIGNABLES);
    await estable();
  }

  async function elegir(campo: string, texto: string): Promise<void> {
    elemento().querySelector<HTMLElement>(`[data-campo="${campo}"]`)?.click();
    await estable();
    [...document.querySelectorAll<HTMLElement>('mat-option')].find((opcion) => opcion.textContent?.includes(texto))?.click();
    await estable();
  }

  afterEach(() => {
    http.verify();
    document.querySelectorAll('.cdk-overlay-container').forEach((contenedor) => contenedor.replaceChildren());
  });

  it('muestra la solicitud y propone las horas pedidas', async () => {
    await abrir([PENDIENTE]);

    expect(elemento().querySelector('[data-dato="agente"]')?.textContent).toContain('Javier Paredes');
    expect(elemento().querySelector('[data-dato="ticket"]')?.textContent?.trim()).toBe('SOP-000245');
    expect(elemento().querySelector('[data-dato="modo"]')?.textContent?.trim()).toBe('Solo lectura');
    expect(elemento().querySelector('[data-campo="horas"]')?.textContent).toContain('3 horas');
  });

  it('el selector de horas no ofrece más de 4 (TR-CA-054)', async () => {
    await abrir([PENDIENTE]);
    elemento().querySelector<HTMLElement>('[data-campo="horas"]')?.click();
    await estable();

    expect([...document.querySelectorAll('mat-option')].map((opcion) => opcion.textContent?.trim())).toEqual(['1 hora', '2 horas', '3 horas', '4 horas']);
  });

  it('aprueba con las horas y el rol elegidos, avisa la hora de fin y vuelve a la bandeja', async () => {
    await abrir([PENDIENTE]);
    await elegir('horas', '2 horas');
    await elegir('asignable', 'Soporte restaurante');

    elemento().querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await estable();

    const aprobacion = http.expectOne(`${API_URL}/seg/soporte/solicitudes/a-1/aprobar`);
    expect(aprobacion.request.body).toEqual({ horas: 2, rol_id: 'r-soporte', perfil_id: null });
    aprobacion.flush({ desde: '2026-11-04T19:30:00.000Z', hasta: '2026-11-04T21:30:00.000Z' });
    await estable();
    http.match(`${API_URL}/seg/soporte/solicitudes/pendientes`).forEach((peticion) => peticion.flush({ total: 0 }));

    expect(avisos.toast).toHaveBeenCalledWith('exito', 'Acceso aprobado hasta las 16:30');
    expect(TestBed.inject(Router).url).toBe('/admin/soporte');
  });

  it('sin rol o perfil no envía', async () => {
    await abrir([PENDIENTE]);
    elemento().querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await estable();
    http.expectNone(`${API_URL}/seg/soporte/solicitudes/a-1/aprobar`);
  });

  it('el error de la API se muestra (techo, miembro o caducada)', async () => {
    await abrir([PENDIENTE]);
    await elegir('asignable', 'Caja');
    elemento().querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await estable();

    const aprobacion = http.expectOne(`${API_URL}/seg/soporte/solicitudes/a-1/aprobar`);
    expect(aprobacion.request.body).toMatchObject({ rol_id: null, perfil_id: 'p-caja' });
    aprobacion.flush({ codigo: 'TRANSICION_SOPORTE_INVALIDA', mensaje: 'No se puede aprobar un acceso de soporte EXPIRADO' }, { status: 409, statusText: 'Conflict' });
    await estable();
    expect(elemento().querySelector('[role="alert"]')?.textContent).toContain('EXPIRADO');
  });

  it('si ya no está pendiente lo dice y no muestra el formulario', async () => {
    await abrir([]);
    expect(elemento().querySelector('[role="alert"]')?.textContent).toContain(MENSAJES_SOPORTE.noPendiente);
    expect(elemento().querySelector('form')).toBeNull();
  });
});
