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
import { MENSAJES_AUDITORIA } from '../../models/mensajes-auditoria';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { AuditoriaListaPage } from './auditoria-lista.page';

const URL_EVENTOS = `${API_URL}/aud/eventos`;
const URL_EXPORTAR = `${URL_EVENTOS}/exportar`;
const URL_INTEGRIDAD = `${API_URL}/aud/integridad`;
const RUTA_MFA = '/auth/mfa';
/** `vit-filtros` espera 300 ms tras la última tecla antes de emitir la búsqueda. */
const ESPERA_BUSQUEDA_CON_MARGEN_MS = 350;
const OCTUBRE = '/admin/auditoria?desde=2026-10-01&hasta=2026-10-31';
const SUCURSALES = [
  { id: 's-mir', empresaId: 'e-1', codigo: 'MIR', nombre: 'Miraflores' },
  { id: 's-sur', empresaId: 'e-1', codigo: 'SUR', nombre: 'Surco' },
];

const anulacionDeRosa = (indice: number) => ({
  id: `e-${indice}`,
  numero: String(18_000 + indice),
  tipo: 'OPERACION',
  accion: 'rest.venta.anular',
  entidad_tipo: 'venta',
  entidad_id: `V-00090${indice}`,
  usuario: { id: 'u-rosa', nombre: 'Rosa Quispe', correo: 'rosa.quispe@ejemplo.pe' },
  sucursal: { id: 's-mir', codigo: 'MIR', nombre: 'Miraflores' },
  motivo: 'Cliente desistió',
  finalidad: null,
  ticket: null,
  persona_titular_id: null,
  ip: null,
  ocurrido_en: `2026-10-${String(10 + indice).padStart(2, '0')}T15:00:00Z`,
});
const DEL_SISTEMA = { ...anulacionDeRosa(9), id: 'e-sis', accion: 'org.tenant.activar', usuario: null, sucursal: null };
const VERIFICACION_OK = { estado: 'OK', modo: 'INCREMENTAL', hasta_numero: '18412', numero_roto: null, motivo: null, terminada_en: '2026-11-10T08:30:04Z' };

interface OpcionesApertura {
  permisos?: string[];
  mfaVigente?: boolean;
}

@Component({ selector: 'vit-destino-auditoria', template: '' })
class Destino {}

describe('AuditoriaListaPage (spec 20c)', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { error: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => decodeURIComponent(TestBed.inject(Router).url);
  const esperarLista = (): TestRequest => http.expectOne((solicitud) => solicitud.url === URL_EVENTOS);
  const filas = () => [...elemento().querySelectorAll('tr[mat-row]')].map((fila) => fila.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  /** Abre la lista y responde la franja; devuelve la petición de la lista sin responder. */
  async function abrir(ruta: string, opciones: OpcionesApertura = {}, integridad: { cuerpo: object; estado?: number } = { cuerpo: VERIFICACION_OK }): Promise<TestRequest> {
    const sesion = new DobleSesion();
    sesion.contexto.set({ permisos: opciones.permisos ?? [PERMISOS_ADMIN.auditoriaConsultar], mfaVigente: opciones.mfaVigente ?? false, sucursales: SUCURSALES });
    avisos = { error: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/auditoria', component: AuditoriaListaPage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { mfa: RUTA_MFA } } },
        { provide: AvisosService, useValue: avisos },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    await estable();
    const estado = integridad.estado ?? 200;
    http.expectOne(URL_INTEGRIDAD).flush(integridad.cuerpo, { status: estado, statusText: estado === 200 ? 'OK' : 'Error' });
    return esperarLista();
  }

  async function responder(peticion: TestRequest, cuerpo: object): Promise<void> {
    peticion.flush(cuerpo);
    await estable();
  }

  afterEach(() => http.verify());

  it('sin parámetros pide los últimos 7 días, página 1 y tamaño 20', async () => {
    const peticion = await abrir('/admin/auditoria');
    const parametros = peticion.request.params;
    const desde = new Date(`${parametros.get('desde')}T00:00:00Z`).getTime();
    const hasta = new Date(`${parametros.get('hasta')}T00:00:00Z`).getTime();

    expect((hasta - desde) / 86_400_000).toBe(6);
    expect(parametros.get('pagina')).toBe('1');
    expect(parametros.get('tamano')).toBe('20');
    expect(parametros.keys().sort()).toEqual(['desde', 'hasta', 'pagina', 'tamano']);
    await responder(peticion, { items: [], total: 0 });
    expect(elemento().textContent).toContain(MENSAJES_AUDITORIA.sinEventos);
  });

  it('TR-CA-213: usuario «rosa» y acción rest.venta.anular van a la URL y a la petición, y se pintan las 7', async () => {
    await responder(await abrir(OCTUBRE), { items: [], total: 0 });

    const accion = elemento().querySelector<HTMLInputElement>('[data-campo="accion"]');
    accion!.value = ' Rest.Venta.Anular ';
    accion!.dispatchEvent(new Event('input'));
    accion!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await estable();
    await responder(esperarLista(), { items: [], total: 0 });

    const busqueda = elemento().querySelector<HTMLInputElement>('vit-filtros input');
    busqueda!.value = 'rosa';
    busqueda!.dispatchEvent(new Event('input'));
    await new Promise((resolver) => setTimeout(resolver, ESPERA_BUSQUEDA_CON_MARGEN_MS));
    await estable();

    expect(url()).toContain('usuario=rosa');
    expect(url()).toContain('accion=rest.venta.anular');
    const peticion = esperarLista();
    expect(peticion.request.params.get('usuario')).toBe('rosa');
    expect(peticion.request.params.get('accion')).toBe('rest.venta.anular');
    await responder(peticion, { items: [1, 2, 3, 4, 5, 6, 7].map(anulacionDeRosa), total: 7 });

    expect(filas()).toHaveLength(7);
    expect(filas()[0]).toContain('rest.venta.anular');
    expect(filas()[0]).toContain('venta · V-000901');
    expect(filas()[0]).toContain('Rosa Quispe');
    expect(filas()[0]).toContain('MIR');
  });

  it('una fila del sistema dice «Sistema» y «Todo el tenant»; el tipo va como chip', async () => {
    await responder(await abrir(OCTUBRE), { items: [DEL_SISTEMA, { ...anulacionDeRosa(1), tipo: 'ACCESO_SENSIBLE' }], total: 2 });

    expect(filas()[0]).toContain(MENSAJES_AUDITORIA.sistema);
    expect(filas()[0]).toContain(MENSAJES_AUDITORIA.todoElTenant);
    expect(filas()[1]).toContain('Acceso sensible');
    expect(elemento().querySelectorAll('tr[mat-row] vit-chip-estado span')[1]?.classList).toContain('bg-chip-advertencia');
  });

  it('la sucursal de la URL viaja como sucursal_id y el select la muestra con código y nombre', async () => {
    const peticion = await abrir(`${OCTUBRE}&sucursal_id=s-sur`);
    expect(peticion.request.params.get('sucursal_id')).toBe('s-sur');
    await responder(peticion, { items: [], total: 0 });

    expect(elemento().querySelector('vit-filtros')?.textContent).toContain('SUR · Surco');
  });

  it('TR-CA-214: un 403 SUCURSAL_FUERA_DE_ALCANCE deja la tabla vacía y muestra el mensaje de la API', async () => {
    const mensaje = 'La sucursal pedida está fuera de su alcance';
    const peticion = await abrir(`${OCTUBRE}&sucursal_id=s-sur`);
    peticion.flush({ codigo: 'SUCURSAL_FUERA_DE_ALCANCE', mensaje }, { status: 403, statusText: 'Forbidden' });
    await estable();

    expect(filas()).toHaveLength(0);
    expect(elemento().querySelector('[role="alert"]')?.textContent).toContain(mensaje);
  });

  it('entidad y titular de la URL salen como chips; quitar uno lo saca de la URL y vuelve a la página 1', async () => {
    await responder(await abrir(`${OCTUBRE}&entidad_tipo=venta&entidad_id=V-000981&persona_titular_id=p-1&pagina=3`), { items: [], total: 0 });

    expect(elemento().querySelector('[data-chip="entidad"]')?.textContent).toContain('venta · V-000981');
    expect(elemento().querySelector('[data-chip="titular"]')?.textContent).toContain('p-1');

    elemento().querySelector<HTMLButtonElement>(`[aria-label="${MENSAJES_AUDITORIA.quitarFiltroEntidad}"]`)?.click();
    await estable();

    expect(url()).not.toContain('entidad_tipo');
    expect(url()).not.toContain('entidad_id');
    expect(url()).not.toContain('pagina');
    expect(url()).toContain('persona_titular_id=p-1');
    await responder(esperarLista(), { items: [], total: 0 });
    expect(elemento().querySelector('[data-chip="entidad"]')).toBeNull();
  });

  it('la franja se pide una sola vez aunque cambie la página', async () => {
    await responder(await abrir(OCTUBRE), { items: [anulacionDeRosa(1)], total: 45 });
    expect(elemento().querySelector('[data-franja="ok"]')).not.toBeNull();

    elemento().querySelector<HTMLButtonElement>('button.mat-mdc-paginator-navigation-next')?.click();
    await estable();

    expect(url()).toContain('pagina=2');
    await responder(esperarLista(), { items: [], total: 45 });
    http.expectNone(URL_INTEGRIDAD);
  });

  it.each([
    ['403 la oculta', { cuerpo: { codigo: 'SUCURSAL_FUERA_DE_ALCANCE', mensaje: 'x' }, estado: 403 }, null],
    ['404 dice que aún no se verificó', { cuerpo: { codigo: 'SIN_VERIFICACIONES', mensaje: 'x' }, estado: 404 }, 'sin-verificar'],
    ['ROTA la muestra como alerta', { cuerpo: { ...VERIFICACION_OK, estado: 'ROTA', numero_roto: '17906', motivo: 'HASH' } }, 'rota'],
  ])('franja: %s', async (_caso, integridad, esperado) => {
    await responder(await abrir(OCTUBRE, {}, integridad), { items: [], total: 0 });
    expect(elemento().querySelector<HTMLElement>('[data-franja]')?.dataset['franja'] ?? null).toBe(esperado);
  });

  it('el detalle se abre desde la fila', async () => {
    await responder(await abrir(OCTUBRE), { items: [anulacionDeRosa(1)], total: 1 });
    expect(elemento().querySelector('tr[mat-row] a')?.getAttribute('href')).toBe('/admin/auditoria/e-1');
  });

  describe('Exportar', () => {
    const FILTRADO = `${OCTUBRE}&usuario=rosa&accion=rest.venta.anular`;
    const PERMISOS_EXPORTAR = [PERMISOS_ADMIN.auditoriaConsultar, PERMISOS_ADMIN.auditoriaExportar];
    const botonExportar = () => elemento().querySelector<HTMLButtonElement>('[data-accion="exportar"]');

    async function clicExportar(): Promise<void> {
      botonExportar()?.click();
      await estable();
    }

    it('sin plat.auditoria.exportar no se ve el botón', async () => {
      await responder(await abrir(FILTRADO), { items: [], total: 0 });
      expect(botonExportar()).toBeNull();
    });

    it('sin MFA vigente lleva a la verificación y vuelve a la lista, sin pedir el archivo', async () => {
      await responder(await abrir(FILTRADO, { permisos: PERMISOS_EXPORTAR }), { items: [], total: 0 });

      await clicExportar();

      http.expectNone(URL_EXPORTAR);
      expect(url()).toBe(`${RUTA_MFA}?returnUrl=${FILTRADO}`);
    });

    it('con MFA descarga con los filtros aplicados, sin página, y deshabilita el botón mientras viaja', async () => {
      const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:auditoria');
      const liberar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      await responder(await abrir(FILTRADO, { permisos: PERMISOS_EXPORTAR, mfaVigente: true }), { items: [], total: 0 });

      await clicExportar();
      const peticion = http.expectOne((solicitud) => solicitud.url === URL_EXPORTAR);
      expect(botonExportar()?.disabled).toBe(true);
      expect(elemento().textContent).toContain(MENSAJES_AUDITORIA.exportando);
      expect(peticion.request.params.keys().sort()).toEqual(['accion', 'desde', 'hasta', 'usuario']);
      peticion.flush(new Blob(['xlsx']), { headers: { 'Content-Disposition': 'attachment; filename="auditoria-20261001-20261031.xlsx"' } });
      await estable();

      expect(clic).toHaveBeenCalledOnce();
      expect(botonExportar()?.disabled).toBe(false);
      crear.mockRestore();
      liberar.mockRestore();
      clic.mockRestore();
    });

    it('un 503 abre un aviso con el mensaje de la API y el botón vuelve a habilitarse', async () => {
      await responder(await abrir(FILTRADO, { permisos: PERMISOS_EXPORTAR, mfaVigente: true }), { items: [], total: 0 });
      const mensaje = 'La auditoría no está disponible; intente en unos minutos';

      await clicExportar();
      http
        .expectOne((solicitud) => solicitud.url === URL_EXPORTAR)
        .flush(new Blob([JSON.stringify({ codigo: 'AUDITORIA_NO_DISPONIBLE', mensaje })], { type: 'application/json' }), {
          status: 503,
          statusText: 'Service Unavailable',
        });
      await vi.waitFor(() => expect(avisos.error).toHaveBeenCalledWith(MENSAJES_AUDITORIA.tituloErrorExportar, mensaje));
      await estable();

      expect(botonExportar()?.disabled).toBe(false);
    });
  });
});
