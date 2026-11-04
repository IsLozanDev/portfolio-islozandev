import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_BITACORA } from '../../models/mensajes-bitacora';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { BitacoraListaPage } from './bitacora-lista.page';

const DENEGADO = {
  id: '1042',
  tipo: 'ACCESO_DENEGADO',
  ocurrido_en: '2026-10-30T15:00:00.000Z',
  usuario: { id: 'u-luis', nombre: 'Luis Quispe', correo: 'luis.quispe@saboresdelsur.pe' },
  resumen: 'plat.rol.gestionar',
};
const VENCIDO = { id: '1043', tipo: 'ACCESO_SOPORTE', ocurrido_en: '2026-10-30T16:00:00.000Z', usuario: null, resumen: 'SOP-000245' };

@Component({ selector: 'vit-destino-bitacora', template: '' })
class Destino {}

describe('BitacoraListaPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperarLista = (): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}/seg/bitacora`);

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
          { path: 'admin/bitacora', component: BitacoraListaPage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: new DobleSesion().conPermisos(PERMISOS_ADMIN.seguridadBitacora) },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    await estable();
    return esperarLista();
  }

  async function responder(peticion: TestRequest, cuerpo: object): Promise<void> {
    peticion.flush(cuerpo);
    await estable();
  }

  afterEach(() => http.verify());

  it('sin rango en la URL pide la última semana y la página por defecto', async () => {
    const peticion = await abrir('/admin/bitacora');
    const parametros = peticion.request.params;
    const desde = new Date(`${parametros.get('desde')}T00:00:00Z`).getTime();
    const hasta = new Date(`${parametros.get('hasta')}T00:00:00Z`).getTime();

    expect((hasta - desde) / 86_400_000).toBe(6);
    expect(parametros.get('pagina')).toBe('1');
    expect(parametros.get('tamano')).toBe('20');
    expect(parametros.has('tipo')).toBe(false);
    await responder(peticion, { items: [], total: 0 });
  });

  it('muestra fecha, tipo como chip, usuario y permiso faltante; el sistema sin usuario (TR-CA-051)', async () => {
    const peticion = await abrir('/admin/bitacora?desde=2026-10-27&hasta=2026-11-02&tipo=ACCESO_DENEGADO');
    expect(peticion.request.params.get('tipo')).toBe('ACCESO_DENEGADO');
    await responder(peticion, { items: [DENEGADO, VENCIDO], total: 2 });

    const filas = [...elemento().querySelectorAll('tr[mat-row]')].map((fila) => fila.textContent?.replace(/\s+/g, ' ').trim());
    expect(filas[0]).toContain('Acceso denegado');
    expect(filas[0]).toContain('Luis Quispe');
    expect(filas[0]).toContain('plat.rol.gestionar');
    expect(filas[1]).toContain(MENSAJES_BITACORA.sistema);
    expect(elemento().querySelector('tr[mat-row] vit-chip-estado span')?.classList).toContain('bg-chip-advertencia');
  });

  it('un rango sin eventos muestra «Sin eventos para los filtros seleccionados» (TR-CA-052)', async () => {
    await responder(await abrir('/admin/bitacora?desde=2026-09-01&hasta=2026-09-30&tipo=ACCESO_SOPORTE'), { items: [], total: 0 });
    expect(elemento().textContent).toContain('Sin eventos para los filtros seleccionados');
  });

  it('el detalle se abre desde la fila', async () => {
    await responder(await abrir('/admin/bitacora?desde=2026-10-27&hasta=2026-11-02'), { items: [DENEGADO], total: 1 });
    expect(elemento().querySelector('tr[mat-row] a')?.getAttribute('href')).toBe('/admin/bitacora/1042');
  });

  it('cambiar de página lleva el filtro a la URL y vuelve a pedir', async () => {
    await responder(await abrir('/admin/bitacora?desde=2026-10-27&hasta=2026-11-02&tipo=ACCESO_DENEGADO'), { items: [DENEGADO], total: 45 });

    elemento().querySelector<HTMLButtonElement>('button.mat-mdc-paginator-navigation-next')?.click();
    await estable();

    expect(url()).toBe('/admin/bitacora?desde=2026-10-27&hasta=2026-11-02&tipo=ACCESO_DENEGADO&pagina=2');
    const siguiente = esperarLista();
    expect(siguiente.request.params.get('pagina')).toBe('2');
    await responder(siguiente, { items: [], total: 45 });
  });

  it('el error de la API se muestra como alerta', async () => {
    const peticion = await abrir('/admin/bitacora?desde=2026-01-01&hasta=2026-11-02');
    peticion.flush(
      { codigo: 'RANGO_BITACORA_INVALIDO', mensaje: 'El rango debe tener fecha inicial y final, en orden, de hasta 92 días' },
      { status: 400, statusText: 'Bad Request' },
    );
    await estable();
    expect(elemento().querySelector('[role="alert"]')?.textContent).toContain('de hasta 92 días');
  });
});
