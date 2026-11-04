import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { InsigniasMenuService } from '@vitrina/shared/shell';
import { AvisosService } from '@vitrina/shared/ui';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_SOPORTE } from '../../models/mensajes-soporte';
import { LONGITUD_MINIMA_MOTIVO_SEG } from '../../models/motivo-seg';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { OPCION_MENU_SOPORTE } from '../../services/insignias-soporte.service';
import { SoporteListaPage } from './soporte-lista.page';

const RUTA_MFA = '/auth/mfa';
const solicitud = (cambios: object = {}) => ({
  id: 'a-1',
  agente: { id: 'u-javier', nombre: 'Javier Paredes', correo: 'javier.paredes@vitrina.pe' },
  ticket: 'SOP-000245',
  motivo: 'Revisar series de boletas',
  modo: 'LECTURA',
  horas_solicitadas: 2,
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
  ...cambios,
});

@Component({ selector: 'vit-destino-soporte', template: '' })
class Destino {}

describe('SoporteListaPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;
  let avisos: { toast: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn>; confirmarDestructiva: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperarLista = (): TestRequest => http.expectOne((peticion) => peticion.url === `${API_URL}/seg/soporte/solicitudes`);
  /** El servicio de insignias pide el total al iniciar y tras cada cierre. */
  const responderPendientes = (total: number) =>
    http.match(`${API_URL}/seg/soporte/solicitudes/pendientes`).forEach((peticion) => peticion.flush({ total }));

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(ruta: string): Promise<TestRequest> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/soporte', component: SoporteListaPage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { mfa: RUTA_MFA } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    await estable();
    responderPendientes(1);
    return esperarLista();
  }

  async function responder(peticion: TestRequest, cuerpo: object): Promise<void> {
    peticion.flush(cuerpo);
    await estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos(PERMISOS_ADMIN.soporteAutorizar);
    sesion.contexto.set({ permisos: [PERMISOS_ADMIN.soporteAutorizar], mfaVigente: true });
    avisos = { toast: vi.fn(), advertencia: vi.fn(async () => undefined), confirmarDestructiva: vi.fn(async () => ({ confirmado: true, motivo: 'No autorizado' })) };
  });

  afterEach(() => http.verify());

  it('abre en Pendientes: pide PENDIENTE y muestra el número junto a la pestaña y en el menú', async () => {
    const peticion = await abrir('/admin/soporte');
    expect(peticion.request.params.get('estado')).toBe('PENDIENTE');
    await responder(peticion, { items: [solicitud()], total: 1 });

    expect(elemento().querySelector('[data-cuenta-pendientes]')?.textContent?.trim()).toBe('1');
    expect(TestBed.inject(InsigniasMenuService).insignias()[OPCION_MENU_SOPORTE]).toBe(1);
    const fila = elemento().querySelector('tr[mat-row]')?.textContent?.replace(/\s+/g, ' ');
    expect(fila).toContain('Javier Paredes');
    expect(fila).toContain('SOP-000245');
    expect(fila).toContain('Solo lectura');
    expect(elemento().querySelector('tr[mat-row] vit-chip-estado span')?.classList).toContain('bg-chip-advertencia');
    expect(elemento().querySelector('[data-accion="aprobar"]')?.getAttribute('href')).toBe('/admin/soporte/a-1/aprobar');
    expect(elemento().querySelector('[data-accion="rechazar"]')?.classList).toContain('vit-destructivo');
  });

  it('Historial pide los tres estados cerrados y no ofrece acciones', async () => {
    const peticion = await abrir('/admin/soporte?vista=historial');
    expect(peticion.request.params.get('estado')).toBe('RECHAZADO,REVOCADO,EXPIRADO');
    await responder(peticion, {
      items: [solicitud({ estado: 'EXPIRADO', causa_cierre: 'VENCIMIENTO', cerrado_en: '2026-11-04T21:10:00.000Z' })],
      total: 1,
    });

    expect(elemento().querySelector('tr[mat-row]')?.textContent).toContain('Venció');
    expect(elemento().querySelector('[data-accion]')).toBeNull();
  });

  it('cambiar de pestaña lleva la vista a la URL', async () => {
    await responder(await abrir('/admin/soporte'), { items: [], total: 0 });
    expect(elemento().textContent).toContain(MENSAJES_SOPORTE.sinPendientes);

    elemento().querySelector<HTMLAnchorElement>('[data-vista="vigentes"]')?.click();
    await estable();

    expect(url()).toBe('/admin/soporte?vista=vigentes');
    const vigentes = esperarLista();
    expect(vigentes.request.params.get('estado')).toBe('APROBADO');
    await responder(vigentes, { items: [], total: 0 });
  });

  it('rechazar pide motivo de 4, llama a la API, avisa y recarga la lista y la insignia', async () => {
    await responder(await abrir('/admin/soporte'), { items: [solicitud()], total: 1 });

    elemento().querySelector<HTMLButtonElement>('[data-accion="rechazar"]')?.click();
    await estable();

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith(expect.objectContaining({ titulo: MENSAJES_SOPORTE.tituloRechazar, pedirMotivo: true, longitudMinimaMotivo: LONGITUD_MINIMA_MOTIVO_SEG }));
    const rechazo = http.expectOne(`${API_URL}/seg/soporte/solicitudes/a-1/rechazar`);
    expect(rechazo.request.body).toEqual({ motivo: 'No autorizado' });
    rechazo.flush(null, { status: 204, statusText: 'No Content' });
    await estable();

    responderPendientes(0);
    await responder(esperarLista(), { items: [], total: 0 });
    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_SOPORTE.rechazado);
    expect(TestBed.inject(InsigniasMenuService).insignias()[OPCION_MENU_SOPORTE]).toBe(0);
  });

  it('revocar un vigente manda confirmar: true', async () => {
    await responder(await abrir('/admin/soporte?vista=vigentes'), { items: [solicitud({ estado: 'APROBADO', hasta: '2026-11-04T21:10:00.000Z' })], total: 1 });

    elemento().querySelector<HTMLButtonElement>('[data-accion="revocar"]')?.click();
    await estable();

    const revocacion = http.expectOne(`${API_URL}/seg/soporte/accesos/a-1/revocar`);
    expect(revocacion.request.body).toEqual({ motivo: 'No autorizado', confirmar: true });
    revocacion.flush(null, { status: 204, statusText: 'No Content' });
    await estable();
    responderPendientes(0);
    await responder(esperarLista(), { items: [], total: 0 });
  });

  it('sin MFA reciente pide verificarse y no llama a la API', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_ADMIN.soporteAutorizar], mfaVigente: false });
    await responder(await abrir('/admin/soporte'), { items: [solicitud()], total: 1 });

    elemento().querySelector<HTMLButtonElement>('[data-accion="rechazar"]')?.click();
    // AccionSensibleService carga el aviso con un import dinámico antes de navegar.
    await vi.waitFor(() => expect(url()).toContain(RUTA_MFA));

    expect(avisos.confirmarDestructiva).not.toHaveBeenCalled();
    expect(avisos.advertencia).toHaveBeenCalledTimes(1);
  });
});
