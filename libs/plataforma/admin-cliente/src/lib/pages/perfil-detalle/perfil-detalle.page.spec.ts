import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_PERFILES } from '../../models/mensajes-admin';
import { PerfilDetallePage } from './perfil-detalle.page';

const rolDisponible = (id: string, productoCodigo: string) => ({
  id,
  codigo: id.toUpperCase(),
  nombre: id,
  producto_codigo: productoCodigo,
  producto_nombre: productoCodigo,
  predefinido: true,
});
const DISPONIBLES = [rolDisponible('eco-gestor', 'ECO'), rolDisponible('lib-vendedor', 'LIB'), rolDisponible('lib-cajero', 'LIB')];
const perfil = (cambios: object = {}) => ({
  id: 'p-encargado',
  codigo: 'ENCARGADO',
  nombre: 'Encargado de tienda',
  predefinido: false,
  roles: ['eco-gestor', 'lib-vendedor'],
  ...cambios,
});

@Component({ template: '' })
class Destino {}

describe('PerfilDetallePage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperar = (ruta: string): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}${ruta}`);
  const accion = (nombre: string) => elemento().querySelector<HTMLButtonElement>(`[data-accion=${nombre}]`);
  const casillaDeRol = (rolId: string) => elemento().querySelector<HTMLInputElement>(`[data-rol="${rolId}"] input[type=checkbox]`);

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function responderCarga(detalle: object): Promise<void> {
    esperar('/seg/perfiles/p-encargado').flush(detalle);
    esperar('/seg/perfiles/roles-disponibles').flush({ items: DISPONIBLES });
    await estable();
  }

  async function abrir(detalle: object = perfil()): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/perfiles/:perfilId', component: PerfilDetallePage },
          { path: '**', component: Destino },
        ]),
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create('/admin/perfiles/p-encargado');
    await estable();
    await responderCarga(detalle);
  }

  beforeEach(() => {
    avisos = { toast: vi.fn() };
  });

  afterEach(() => http.verify());

  describe('perfil propio', () => {
    it('muestra la cabecera y el selector editable con sus roles marcados', async () => {
      await abrir();

      expect(elemento().querySelector('h1')?.textContent?.trim()).toBe('Encargado de tienda');
      expect(elemento().querySelector('[data-tipo]')?.textContent?.trim()).toBe('Propio');
      expect(casillaDeRol('lib-vendedor')?.checked).toBe(true);
      expect(casillaDeRol('lib-cajero')?.checked).toBe(false);
      expect(casillaDeRol('lib-cajero')?.disabled).toBe(false);
      expect(elemento().querySelector('[data-aviso]')).toBeNull();
    });

    it('«Guardar» está deshabilitado sin cambios; con cambios envía PUT con el conjunto completo', async () => {
      await abrir();
      expect(accion('guardar')?.disabled).toBe(true);

      casillaDeRol('lib-cajero')?.click();
      await estable();
      expect(accion('guardar')?.disabled).toBe(false);
      accion('guardar')?.click();
      await estable();

      const peticion = esperar('/seg/perfiles/p-encargado/roles');
      expect(peticion.request.method).toBe('PUT');
      expect(peticion.request.body).toEqual({ roles: ['eco-gestor', 'lib-cajero', 'lib-vendedor'] });
      peticion.flush(null, { status: 204, statusText: 'No Content' });
      await estable();
      await responderCarga(perfil({ roles: ['eco-gestor', 'lib-cajero', 'lib-vendedor'] }));

      expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_PERFILES.rolesGuardados);
      expect(accion('guardar')?.disabled).toBe(true);
    });

    it('sin roles marcados avisa y no deja guardar', async () => {
      await abrir();

      casillaDeRol('eco-gestor')?.click();
      casillaDeRol('lib-vendedor')?.click();
      await estable();

      expect(elemento().querySelector('[data-error=roles]')?.textContent?.trim()).toBe(MENSAJES_PERFILES.seleccioneRol);
      expect(accion('guardar')?.disabled).toBe(true);
    });

    it('con roles que ya no están disponibles avisa el conteo y no los envía al guardar', async () => {
      await abrir(perfil({ roles: ['eco-gestor', 'lib-vendedor', 'r-inactivo', 'r-vencido'] }));

      expect(elemento().querySelector('[data-aviso=no-disponibles]')?.textContent?.trim()).toBe(MENSAJES_PERFILES.rolesNoDisponibles(2));
      expect(accion('guardar')?.disabled).toBe(false);
      accion('guardar')?.click();
      await estable();

      const peticion = esperar('/seg/perfiles/p-encargado/roles');
      expect(peticion.request.body).toEqual({ roles: ['eco-gestor', 'lib-vendedor'] });
      peticion.flush(null, { status: 204, statusText: 'No Content' });
      await estable();
      await responderCarga(perfil());
    });

    it.each([
      ['CONFLICTO', 409, 'El registro fue modificado por otra operación; vuelva a cargarlo'],
      ['ROL_FUERA_DEL_TECHO', 400, 'El rol PLAT_ADMIN_TENANTS no se puede usar en un perfil del cliente'],
    ])('%s al guardar muestra el mensaje de la API', async (codigo, estado, mensaje) => {
      await abrir();
      casillaDeRol('lib-cajero')?.click();
      await estable();

      accion('guardar')?.click();
      await estable();
      esperar('/seg/perfiles/p-encargado/roles').flush({ codigo, mensaje }, { status: estado, statusText: 'Error' });
      await estable();

      expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe(mensaje);
      expect(avisos.toast).not.toHaveBeenCalled();
    });

    it('«Copiar» lleva a la página de copia', async () => {
      await abrir();

      accion('copiar')?.click();
      await estable();

      expect(url()).toBe('/admin/perfiles/p-encargado/copiar');
    });
  });

  it('un predefinido abre en solo lectura con el aviso y solo «Copiar»', async () => {
    await abrir(perfil({ codigo: 'CAJA', nombre: 'Caja', predefinido: true, roles: ['lib-vendedor'] }));

    expect(elemento().querySelector('[data-aviso=predefinido]')?.textContent?.trim()).toBe('Los perfiles predefinidos no se editan; cree una copia');
    expect(elemento().querySelector('[data-tipo]')?.textContent?.trim()).toBe('Predefinido');
    expect(accion('copiar')).not.toBeNull();
    expect(accion('guardar')).toBeNull();
    expect(casillaDeRol('lib-vendedor')?.checked).toBe(true);
    expect(casillaDeRol('lib-vendedor')?.disabled).toBe(true);
  });

  it('un perfil inexistente o de otro tenant muestra el error de la API', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'admin/perfiles/:perfilId', component: PerfilDetallePage }]),
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create('/admin/perfiles/p-encargado');
    await estable();
    esperar('/seg/perfiles/p-encargado').flush({ codigo: 'NO_ENCONTRADO', mensaje: 'El perfil no existe' }, { status: 404, statusText: 'Not Found' });
    esperar('/seg/perfiles/roles-disponibles').flush({ items: DISPONIBLES });
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe('El perfil no existe');
  });
});
