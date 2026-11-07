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
const BLOQUEO = {
  id: '1044',
  tipo: 'LOGIN_FALLIDO',
  ocurrido_en: '2026-11-02T20:30:00.000Z',
  usuario: { id: 'u-rosa', nombre: 'Rosa Huamán', correo: 'rosa.huaman@gmail.com' },
  resumen: 'BLOQUEO_INGRESO',
};
const RUTA_MFA = '/auth/mfa';
const URL_EXPORTAR = `${API_URL}/seg/bitacora/exportar`;

interface OpcionesApertura {
  permisos?: string[];
  mfaVigente?: boolean;
}

const VENCIDO = { id: '1043', tipo: 'ACCESO_SOPORTE', ocurrido_en: '2026-10-30T16:00:00.000Z', usuario: null, resumen: 'SOP-000245' };

@Component({ selector: 'vit-destino-bitacora', template: '' })
class Destino {}

describe('BitacoraListaPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { error: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperarLista = (): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}/seg/bitacora`);

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(ruta: string, opciones: OpcionesApertura = {}): Promise<TestRequest> {
    const sesion = new DobleSesion().conPermisos(...(opciones.permisos ?? [PERMISOS_ADMIN.seguridadBitacora]));
    sesion.contexto.set({ permisos: sesion.contexto()?.permisos ?? [], mfaVigente: opciones.mfaVigente ?? false });
    avisos = { error: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/bitacora', component: BitacoraListaPage },
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

  describe('Exportar (spec 18b)', () => {
    const SEMANA = '/admin/bitacora?desde=2026-10-27&hasta=2026-11-02&tipo=LOGIN_FALLIDO&usuario=rosa';
    const PERMISOS_EXPORTAR = [PERMISOS_ADMIN.seguridadBitacora, PERMISOS_ADMIN.seguridadBitacoraExportar];
    const botonExportar = () => elemento().querySelector<HTMLButtonElement>('[data-accion="exportar"]');

    async function clicExportar(): Promise<void> {
      botonExportar()?.click();
      await estable();
    }

    it('sin plat.seguridad.bitacora_exportar no se ve el botón', async () => {
      await responder(await abrir(SEMANA), { items: [], total: 0 });
      expect(botonExportar()).toBeNull();
    });

    it('con MFA vigente descarga con los filtros aplicados, sin página, y deshabilita el botón mientras tanto', async () => {
      const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bitacora');
      const liberar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      await responder(await abrir(SEMANA, { permisos: PERMISOS_EXPORTAR, mfaVigente: true }), { items: [], total: 0 });

      await clicExportar();
      const peticion = http.expectOne((solicitud) => solicitud.url === URL_EXPORTAR);
      expect(botonExportar()?.disabled).toBe(true);
      expect(elemento().textContent).toContain(MENSAJES_BITACORA.exportando);
      expect(peticion.request.params.keys().sort()).toEqual(['desde', 'hasta', 'tipo', 'usuario']);
      expect(peticion.request.params.get('usuario')).toBe('rosa');
      peticion.flush(new Blob(['xlsx']), { headers: { 'Content-Disposition': 'attachment; filename="bitacora-20261027-20261102.xlsx"' } });
      await estable();

      expect(clic).toHaveBeenCalledOnce();
      expect(botonExportar()?.disabled).toBe(false);
      crear.mockRestore();
      liberar.mockRestore();
      clic.mockRestore();
    });

    it('sin MFA vigente lleva a la verificación y vuelve a la bitácora, sin pedir el archivo', async () => {
      await responder(await abrir(SEMANA, { permisos: PERMISOS_EXPORTAR, mfaVigente: false }), { items: [], total: 0 });

      await clicExportar();

      http.expectNone(URL_EXPORTAR);
      expect(decodeURIComponent(url())).toBe(`${RUTA_MFA}?returnUrl=${SEMANA}`);
    });

    it('un 422 muestra el mensaje de la API en un aviso', async () => {
      await responder(await abrir(SEMANA, { permisos: PERMISOS_EXPORTAR, mfaVigente: true }), { items: [], total: 0 });
      const mensaje = 'La exportación tiene 10 001 filas; el máximo es 10 000. Acote el rango o los filtros';

      await clicExportar();
      http
        .expectOne((solicitud) => solicitud.url === URL_EXPORTAR)
        .flush(new Blob([JSON.stringify({ codigo: 'EXPORTACION_DEMASIADO_GRANDE', mensaje })], { type: 'application/json' }), {
          status: 422,
          statusText: 'Unprocessable Entity',
        });
      await vi.waitFor(() => expect(avisos.error).toHaveBeenCalledWith(MENSAJES_BITACORA.tituloErrorExportar, mensaje));
    });

    it('con el aviso de error todavía abierto, el botón ya no dice «Exportando…»', async () => {
      await responder(await abrir(SEMANA, { permisos: PERMISOS_EXPORTAR, mfaVigente: true }), { items: [], total: 0 });
      avisos.error.mockReturnValue(new Promise(() => undefined));

      await clicExportar();
      http
        .expectOne((solicitud) => solicitud.url === URL_EXPORTAR)
        .flush(new Blob([JSON.stringify({ codigo: 'AUDITORIA_NO_DISPONIBLE', mensaje: 'x' })]), { status: 503, statusText: 'Service Unavailable' });
      await vi.waitFor(() => expect(avisos.error).toHaveBeenCalled());
      await estable();

      expect(botonExportar()?.disabled).toBe(false);
      expect(elemento().textContent).not.toContain(MENSAJES_BITACORA.exportando);
    });

    it('el resumen del ingreso fallido se lee con la etiqueta del motivo y el tipo va en advertencia', async () => {
      await responder(await abrir(SEMANA), { items: [BLOQUEO], total: 1 });

      const fila = elemento().querySelector('tr[mat-row]')?.textContent?.replace(/\s+/g, ' ');
      expect(fila).toContain('Ingreso fallido');
      expect(fila).toContain('Bloqueo por intentos fallidos (correo e IP, o IP)');
      expect(elemento().querySelector('tr[mat-row] vit-chip-estado span')?.classList).toContain('bg-chip-advertencia');
    });
  });
});
