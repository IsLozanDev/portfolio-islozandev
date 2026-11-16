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
import { MENSAJES_EMPRESAS, MENSAJES_ORGANIZACION } from '../../models/mensajes-organizacion';
import { PERMISO_CONSULTAR_IDENTIDAD } from '../../models/padron';
import { RecargaContextoService } from '../../services/recarga-contexto.service';
import { EmpresaFormularioPage } from './empresa-formulario.page';

const URL_EMPRESAS = `${API_URL}/org/empresas`;
const URL_PADRON = `${API_URL}/identidad/RUC`;
const RUC_ANDINA = '20512345671';
const RUC_MISTI = '20456789120';
const RUC_FUERA_DEL_PADRON = '20601234565';
const ADVERTENCIA_NO_HABIDO = 'Contribuyente NO HABIDO: no podrá emitir comprobantes hasta regularizar';
const PADRON_ANDINA = { razon_social: 'Comercial Andina S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO', apto_factura: true };
const PADRON_MISTI = { razon_social: 'Inversiones Misti S.A.C.', estado: 'ACTIVO', condicion: 'NO HABIDO', apto_factura: false, motivo_no_apto: 'Condición NO HABIDO' };
const SABORES = {
  id: 'e-sabores',
  ruc: '20512345671',
  razon_social: 'Sabores del Sur SAC',
  nombre_comercial: null,
  direccion_fiscal: 'Av. Ejército 101',
  ubigeo: '040101',
  activo: true,
  version: 3,
};

@Component({ selector: 'vit-destino-empresa-formulario', template: '' })
class Destino {}

describe('EmpresaFormularioPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn> };
  let sesion: DobleSesion;
  let recarga: { recargar: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const campo = (nombre: string) => elemento().querySelector<HTMLInputElement>(`[data-campo=${nombre}]`);

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(ruta: string): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'admin',
            children: [
              { path: 'empresas/nueva', component: EmpresaFormularioPage },
              { path: 'empresas/:empresaId/editar', component: EmpresaFormularioPage },
            ],
          },
          { path: '**', component: Destino },
        ]),
        { provide: AvisosService, useValue: avisos },
        { provide: RecargaContextoService, useValue: recarga },
        { provide: SesionService, useValue: sesion },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    await estable();
  }

  async function abrirEdicion(): Promise<void> {
    await abrir('/admin/empresas/e-sabores/editar');
    http.expectOne(`${URL_EMPRESAS}/e-sabores`).flush(SABORES);
    await estable();
  }

  async function escribir(nombre: string, valor: string): Promise<void> {
    const entrada = campo(nombre);
    if (!entrada) throw new Error(`No hay campo ${nombre}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    await estable();
  }

  async function salirDelRuc(): Promise<void> {
    campo('ruc')?.dispatchEvent(new Event('blur'));
    await estable();
  }

  const padronDe = (ruc: string) => http.expectOne((solicitud) => solicitud.url === `${URL_PADRON}/${ruc}`);
  const ayudaRazonSocial = () => elemento().querySelector('[data-ayuda=razon-social]')?.textContent?.trim();

  async function enviar(): Promise<void> {
    elemento().querySelector<HTMLFormElement>('form')?.dispatchEvent(new Event('submit'));
    await estable();
  }

  const conflicto = (codigo: string, mensaje: string) => ({ body: { codigo, mensaje }, opciones: { status: 409, statusText: 'Conflict' } });

  beforeEach(() => {
    avisos = { toast: vi.fn(), advertencia: vi.fn(async () => undefined) };
    sesion = new DobleSesion().conPermisos(PERMISO_CONSULTAR_IDENTIDAD);
    recarga = { recargar: vi.fn(async () => undefined) };
  });

  afterEach(() => http.verify());

  it('TR-CA-004: registra, recarga mi-contexto y va a las sucursales de la empresa nueva', async () => {
    await abrir('/admin/empresas/nueva');
    await escribir('ruc', '20512345671');
    await escribir('razonSocial', ' Sabores del Sur SAC ');
    await enviar();

    const peticion = http.expectOne(URL_EMPRESAS);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ ruc: '20512345671', razon_social: 'Sabores del Sur SAC', nombre_comercial: null, direccion_fiscal: null, ubigeo: null });
    peticion.flush({ empresa_id: 'e-sabores', sucursal_principal_id: 's-centro', advertencias: [] });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_EMPRESAS.registrada);
    expect(recarga.recargar).toHaveBeenCalled();
    expect(url()).toBe('/admin/sucursales?empresa=e-sabores');
  });

  describe('padrón RUC (spec 28b)', () => {
    it('al salir del RUC consulta el padrón con motivo VERIFICACION_IDENTIDAD, prellena la razón social y la deja de solo lectura', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_ANDINA);
      await salirDelRuc();

      const consulta = padronDe(RUC_ANDINA);
      expect(consulta.request.params.get('motivo')).toBe('VERIFICACION_IDENTIDAD');
      consulta.flush(PADRON_ANDINA);
      await estable();

      expect(campo('razonSocial')?.value).toBe('Comercial Andina S.A.C.');
      expect(campo('razonSocial')?.disabled).toBe(true);
      expect(elemento().querySelector('[data-aviso=no-apto]')).toBeNull();

      await enviar();
      const registro = http.expectOne(URL_EMPRESAS);
      expect(registro.request.body).toMatchObject({ ruc: RUC_ANDINA, razon_social: 'Comercial Andina S.A.C.' });
      registro.flush({ empresa_id: 'e-andina', sucursal_principal_id: 's-centro', advertencias: [] });
      await estable();
      expect(avisos.advertencia).not.toHaveBeenCalled();
    });

    it('salir otra vez del campo con el mismo RUC no repite la consulta', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_ANDINA);
      await salirDelRuc();
      padronDe(RUC_ANDINA).flush(PADRON_ANDINA);
      await estable();

      await salirDelRuc();
      http.expectNone((solicitud) => solicitud.url.startsWith(URL_PADRON));
    });

    it('un RUC que el padrón no tiene (404) deja la razón social editable con la ayuda', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_FUERA_DEL_PADRON);
      await salirDelRuc();
      padronDe(RUC_FUERA_DEL_PADRON).flush({ codigo: 'NO_ENCONTRADO', mensaje: 'El documento no existe en el proveedor' }, { status: 404, statusText: 'Not Found' });
      await estable();

      expect(campo('razonSocial')?.disabled).toBe(false);
      expect(ayudaRazonSocial()).toBe(MENSAJES_EMPRESAS.noEnPadron);
    });

    it('con el proveedor caído (503) también queda editable con la ayuda', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_ANDINA);
      await salirDelRuc();
      padronDe(RUC_ANDINA).flush({ codigo: 'PROVEEDOR_NO_DISPONIBLE', mensaje: 'Ningún proveedor de identidad respondió' }, { status: 503, statusText: 'Service Unavailable' });
      await estable();

      expect(campo('razonSocial')?.disabled).toBe(false);
      expect(ayudaRazonSocial()).toBe(MENSAJES_EMPRESAS.noEnPadron);
    });

    it('cambiar el RUC vuelve a habilitar la razón social y quita la ayuda', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_ANDINA);
      await salirDelRuc();
      padronDe(RUC_ANDINA).flush(PADRON_ANDINA);
      await estable();

      await escribir('ruc', '2051234567');

      expect(campo('razonSocial')?.disabled).toBe(false);
      expect(ayudaRazonSocial()).toBe(MENSAJES_EMPRESAS.ayudaRazonSocial);
    });

    it('TR-CA-006: con un RUC NO HABIDO muestra el hint antes de registrar y el aviso después', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_MISTI);
      await salirDelRuc();
      padronDe(RUC_MISTI).flush(PADRON_MISTI);
      await estable();

      expect(elemento().querySelector('[data-aviso=no-apto]')?.textContent?.trim()).toBe('Condición NO HABIDO');

      await enviar();
      http.expectOne(URL_EMPRESAS).flush({ empresa_id: 'e-misti', sucursal_principal_id: 's-centro', advertencias: [ADVERTENCIA_NO_HABIDO] });
      await estable();

      expect(avisos.advertencia).toHaveBeenCalledWith(MENSAJES_EMPRESAS.registradaConObservaciones, ADVERTENCIA_NO_HABIDO);
      expect(avisos.toast).not.toHaveBeenCalled();
      expect(url()).toBe('/admin/sucursales?empresa=e-misti');
    });

    it('sin plat.identidad.consultar no consulta el padrón y registra con la razón social escrita', async () => {
      sesion.conPermisos();
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_ANDINA);
      await salirDelRuc();
      http.expectNone((solicitud) => solicitud.url.startsWith(URL_PADRON));

      await escribir('razonSocial', 'Sabores del Sur SAC');
      await enviar();
      http.expectOne(URL_EMPRESAS).flush({ empresa_id: 'e-sabores', sucursal_principal_id: 's-centro', advertencias: [] });
      await estable();
      expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_EMPRESAS.registrada);
    });

    it('un RUC inválido no consulta el padrón', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', '20512345678');
      await salirDelRuc();
      http.expectNone((solicitud) => solicitud.url.startsWith(URL_PADRON));
    });

    it('en la edición no consulta el padrón', async () => {
      await abrirEdicion();
      await salirDelRuc();
      http.expectNone((solicitud) => solicitud.url.startsWith(URL_PADRON));
    });
  });

  it('TR-RN-002: con RUC 20512345678 muestra «RUC inválido» y no envía', async () => {
    await abrir('/admin/empresas/nueva');
    await escribir('ruc', '20512345678');
    await escribir('razonSocial', 'Sabores del Sur SAC');
    await enviar();

    expect(elemento().textContent).toContain('RUC inválido');
    http.expectNone(URL_EMPRESAS);
  });

  it('TR-CA-005: un RUC repetido muestra el mensaje de la API y no navega', async () => {
    await abrir('/admin/empresas/nueva');
    await escribir('ruc', '20512345671');
    await escribir('razonSocial', 'Sabores del Sur SAC');
    await enviar();

    const { body, opciones } = conflicto('CONFLICTO', 'La empresa ya está registrada en este tenant');
    http.expectOne(URL_EMPRESAS).flush(body, opciones);
    await estable();

    expect(elemento().querySelector('[data-error=api]')?.textContent).toContain('La empresa ya está registrada en este tenant');
    expect(url()).toBe('/admin/empresas/nueva');
    expect(recarga.recargar).not.toHaveBeenCalled();
  });

  it('un doble envío manda una sola petición', async () => {
    await abrir('/admin/empresas/nueva');
    await escribir('ruc', '20512345671');
    await escribir('razonSocial', 'Sabores del Sur SAC');
    const formulario = elemento().querySelector<HTMLFormElement>('form');
    formulario?.dispatchEvent(new Event('submit'));
    formulario?.dispatchEvent(new Event('submit'));
    await estable();

    http.expectOne(URL_EMPRESAS).flush({ empresa_id: 'e-sabores', sucursal_principal_id: 's-centro', advertencias: [] });
    await estable();
  });

  it('la edición carga por id con el RUC en solo lectura y guarda con la versión', async () => {
    await abrirEdicion();

    expect(campo('ruc')?.value).toBe('20512345671');
    expect(campo('ruc')?.disabled).toBe(true);
    expect(campo('razonSocial')?.value).toBe('Sabores del Sur SAC');

    await escribir('nombreComercial', 'Sabores');
    await enviar();

    const peticion = http.expectOne(`${URL_EMPRESAS}/e-sabores`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ version: 3, razon_social: 'Sabores del Sur SAC', nombre_comercial: 'Sabores', direccion_fiscal: 'Av. Ejército 101', ubigeo: '040101' });
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_EMPRESAS.actualizada);
    expect(url()).toBe('/admin/empresas');
  });

  it('TR-RNF-008: VERSION_OBSOLETA muestra el aviso y «Recargar» trae la versión nueva', async () => {
    await abrirEdicion();
    await escribir('nombreComercial', 'Sabores');
    await enviar();

    const { body, opciones } = conflicto('VERSION_OBSOLETA', 'El registro cambió desde que lo abrió; recargue y vuelva a intentar');
    http.expectOne(`${URL_EMPRESAS}/e-sabores`).flush(body, opciones);
    await estable();

    expect(elemento().querySelector('[data-error=version]')?.textContent).toContain(MENSAJES_ORGANIZACION.versionObsoleta);
    expect(url()).toBe('/admin/empresas/e-sabores/editar');

    elemento().querySelector<HTMLButtonElement>('[data-accion=recargar]')?.click();
    await estable();
    http.expectOne(`${URL_EMPRESAS}/e-sabores`).flush({ ...SABORES, nombre_comercial: 'Del otro usuario', version: 4 });
    await estable();

    expect(campo('nombreComercial')?.value).toBe('Del otro usuario');
    expect(elemento().querySelector('[data-error=version]')).toBeNull();
  });

  it('un id inexistente muestra «La empresa no existe» con enlace a la lista', async () => {
    await abrir('/admin/empresas/e-otra/editar');
    http.expectOne(`${URL_EMPRESAS}/e-otra`).flush({ codigo: 'NO_ENCONTRADO', mensaje: 'La empresa no existe' }, { status: 404, statusText: 'Not Found' });
    await estable();

    expect(elemento().textContent).toContain(MENSAJES_EMPRESAS.noExiste);
    expect(elemento().querySelector('form')).toBeNull();
    expect([...elemento().querySelectorAll('a')].find((enlace) => enlace.textContent?.includes(MENSAJES_EMPRESAS.volver))?.getAttribute('href')).toBe('/admin/empresas');
  });

  it('cancelar vuelve a la lista sin enviar', async () => {
    await abrir('/admin/empresas/nueva');
    [...elemento().querySelectorAll<HTMLButtonElement>('button')].find((boton) => boton.type === 'button')?.click();
    await estable();

    expect(url()).toBe('/admin/empresas');
  });
});
