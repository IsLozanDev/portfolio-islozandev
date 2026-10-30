import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_EMPRESAS, MENSAJES_ORGANIZACION } from '../../models/mensajes-organizacion';
import { RecargaContextoService } from '../../services/recarga-contexto.service';
import { EmpresaFormularioPage } from './empresa-formulario.page';

const URL_EMPRESAS = `${API_URL}/org/empresas`;
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

@Component({ template: '' })
class Destino {}

describe('EmpresaFormularioPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn> };
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

  async function enviar(): Promise<void> {
    elemento().querySelector<HTMLFormElement>('form')?.dispatchEvent(new Event('submit'));
    await estable();
  }

  const conflicto = (codigo: string, mensaje: string) => ({ body: { codigo, mensaje }, opciones: { status: 409, statusText: 'Conflict' } });

  beforeEach(() => {
    avisos = { toast: vi.fn() };
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
    peticion.flush({ empresa_id: 'e-sabores', sucursal_principal_id: 's-centro' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_EMPRESAS.registrada);
    expect(recarga.recargar).toHaveBeenCalled();
    expect(url()).toBe('/admin/sucursales?empresa=e-sabores');
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

    http.expectOne(URL_EMPRESAS).flush({ empresa_id: 'e-sabores', sucursal_principal_id: 's-centro' });
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
