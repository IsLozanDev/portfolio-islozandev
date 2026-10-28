import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { CONFIRMACIONES_ESTADO, MENSAJES_DETALLE } from '../../models/mensajes-consola';
import { PERMISOS_CONSOLA } from '../../models/permisos-consola';
import { TenantDetallePage } from './tenant-detalle.page';

const RUTA_GYM = '/consola/tenants/t-gym';
const URL_GYM = `${API_URL}/org/tenants/t-gym`;
const RUTA_MFA = '/auth/mfa';
const TODOS_LOS_PERMISOS = [PERMISOS_CONSOLA.tenantConsultar, PERMISOS_CONSOLA.tenantCambiarEstado];
const MOTIVO = 'Deuda de 60 días';

function gym(estado: string, cambios: object = {}): object {
  return {
    id: 't-gym',
    codigo: 'gym-fuerza-total',
    nombre: 'Gym Fuerza Total',
    estado,
    creado_en: '2026-10-01T15:00:00.000Z',
    estado_motivo: null,
    estado_cambiado_en: null,
    version: 1,
    suscripciones: [{ producto_codigo: 'GYM', plan: 'PRO', estado: 'ACTIVA', vigente_hasta: '2026-12-31' }],
    empresa_principal: { id: 'e-1', ruc: '20512345671', razon_social: 'Fuerza Total S.A.C.' },
    historial: [],
    ...cambios,
  };
}

@Component({ template: '' })
class Destino {}

describe('TenantDetallePage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;
  let avisos: { toast: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn>; confirmarDestructiva: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const botones = () => [...elemento().querySelectorAll('[data-acciones-estado] button')].map((boton) => boton.textContent?.trim());

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(detalle: object, opciones?: { status: number; statusText: string }): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'consola/tenants/:id', component: TenantDetallePage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { mfa: RUTA_MFA } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(RUTA_GYM);
    await estable();
    http.expectOne(URL_GYM).flush(detalle, opciones);
    await estable();
  }

  async function pulsar(texto: string): Promise<void> {
    const boton = [...elemento().querySelectorAll<HTMLButtonElement>('[data-acciones-estado] button')].find((candidato) => candidato.textContent?.trim() === texto);
    if (!boton) throw new Error(`No hay botón «${texto}»`);
    boton.click();
    await estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion();
    sesion.contexto.set({ permisos: TODOS_LOS_PERMISOS, mfaVigente: true });
    avisos = { toast: vi.fn(), advertencia: vi.fn(async () => undefined), confirmarDestructiva: vi.fn(async () => ({ confirmado: true, motivo: MOTIVO })) };
  });

  afterEach(() => http.verify());

  it.each([
    ['PRUEBA', ['Activar', 'Suspender', 'Dar de baja']],
    ['ACTIVO', ['Suspender', 'Dar de baja']],
    ['SUSPENDIDO', ['Activar', 'Dar de baja']],
    ['BAJA', []],
  ])('TR-RN-005: %s ofrece %o', async (estado, esperados) => {
    await abrir(gym(estado));

    expect(botones()).toEqual(esperados);
  });

  it('muestra suscripciones en solo lectura, empresa principal e historial en el orden de la API', async () => {
    await abrir(
      gym('SUSPENDIDO', {
        estado_motivo: MOTIVO,
        estado_cambiado_en: '2026-10-20T15:00:00.000Z',
        historial: [
          { estado_anterior: 'ACTIVO', estado_nuevo: 'SUSPENDIDO', motivo: MOTIVO, fecha_efectiva: '2026-10-20T15:00:00.000Z', registrado_en: '2026-10-20T15:00:00.000Z' },
          { estado_anterior: 'PRUEBA', estado_nuevo: 'ACTIVO', motivo: 'Pago del primer mes', fecha_efectiva: '2026-10-05T15:00:00.000Z', registrado_en: '2026-10-05T15:00:00.000Z' },
        ],
      }),
    );

    expect(elemento().querySelector('[data-suscripcion]')?.textContent).toContain('31/12/2026');
    expect(elemento().querySelector('[data-suscripcion] input, [data-suscripcion] button')).toBeNull();
    expect(elemento().querySelector('[data-empresa-principal]')?.textContent).toContain('20512345671');
    const historial = [...elemento().querySelectorAll('[data-cambio-estado]')].map((cambio) => cambio.textContent ?? '');
    expect(historial[0]).toContain('Activo → Suspendido');
    expect(historial[1]).toContain('Prueba → Activo');
  });

  it('TR-CA-016: suspender pide motivo con el mínimo por defecto, envía estado y motivo, avisa y recarga', async () => {
    await abrir(gym('ACTIVO'));
    await pulsar(CONFIRMACIONES_ESTADO.SUSPENDIDO.boton);

    const opciones = avisos.confirmarDestructiva.mock.calls[0][0];
    expect(opciones).toMatchObject({ titulo: CONFIRMACIONES_ESTADO.SUSPENDIDO.titulo('gym-fuerza-total'), pedirMotivo: true });
    expect(opciones).not.toHaveProperty('longitudMinimaMotivo');

    const cambio = http.expectOne(`${URL_GYM}/estado`);
    expect(cambio.request.body).toEqual({ estado: 'SUSPENDIDO', motivo: MOTIVO });
    cambio.flush({ cambiado: true, estado: 'SUSPENDIDO' });
    await estable();
    http.expectOne(URL_GYM).flush(gym('SUSPENDIDO', { estado_motivo: MOTIVO }));
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', CONFIRMACIONES_ESTADO.SUSPENDIDO.hecho);
    expect(elemento().querySelector('[data-estado-tenant]')?.textContent).toContain('Suspendido');
  });

  it('cancelar la confirmación no envía nada', async () => {
    avisos.confirmarDestructiva.mockResolvedValue({ confirmado: false });
    await abrir(gym('ACTIVO'));
    await pulsar(CONFIRMACIONES_ESTADO.BAJA.boton);

    http.expectNone(`${URL_GYM}/estado`);
  });

  it('con cambiado: false avisa que ya estaba en ese estado', async () => {
    await abrir(gym('ACTIVO'));
    await pulsar(CONFIRMACIONES_ESTADO.SUSPENDIDO.boton);
    http.expectOne(`${URL_GYM}/estado`).flush({ cambiado: false, estado: 'SUSPENDIDO' });
    await estable();
    http.expectOne(URL_GYM).flush(gym('SUSPENDIDO'));
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('info', MENSAJES_DETALLE.yaEstaba);
  });

  it('un rechazo de la API se muestra como alerta', async () => {
    await abrir(gym('SUSPENDIDO'));
    await pulsar(CONFIRMACIONES_ESTADO.ACTIVO.boton);
    http
      .expectOne(`${URL_GYM}/estado`)
      .flush({ codigo: 'CONFLICTO', mensaje: 'Transición de estado no permitida: SUSPENDIDO → ACTIVO' }, { status: 409, statusText: 'Conflict' });
    await estable();

    expect(elemento().querySelector('[role="alert"]')?.textContent).toContain('Transición de estado no permitida');
  });

  it('sin MFA vigente no abre la confirmación y lleva a /auth/mfa con retorno al detalle', async () => {
    sesion.contexto.set({ permisos: TODOS_LOS_PERMISOS, mfaVigente: false });
    await abrir(gym('ACTIVO'));
    await pulsar(CONFIRMACIONES_ESTADO.SUSPENDIDO.boton);

    await vi.waitFor(() => expect(url()).toBe(`${RUTA_MFA}?returnUrl=${encodeURIComponent(RUTA_GYM)}`));
    expect(avisos.confirmarDestructiva).not.toHaveBeenCalled();
  });

  it('sin plat.tenant.cambiar_estado no hay botones de estado', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_CONSOLA.tenantConsultar], mfaVigente: true });
    await abrir(gym('ACTIVO'));

    expect(elemento().querySelector('[data-acciones-estado]')).toBeNull();
  });

  it('un id inexistente muestra «El tenant no existe» con enlace a la lista', async () => {
    await abrir({ codigo: 'NO_ENCONTRADO', mensaje: 'El tenant no existe' }, { status: 404, statusText: 'Not Found' });

    expect(elemento().textContent).toContain(MENSAJES_DETALLE.noExiste);
    expect(elemento().querySelector('vit-estado-vacio a')?.getAttribute('href')).toBe('/consola/tenants');
  });
});
