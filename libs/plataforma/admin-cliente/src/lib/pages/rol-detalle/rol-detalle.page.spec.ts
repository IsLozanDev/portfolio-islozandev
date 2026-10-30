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
import { CONFIRMACION_INACTIVAR_ROL, MENSAJES_ROLES } from '../../models/mensajes-admin';
import { RolDetallePage } from './rol-detalle.page';

const permiso = (codigo: string) => ({ codigo, descripcion: codigo, sensible: false, alcance_minimo: 'UNIDAD' });
const ARBOL_REST = {
  producto_codigo: 'REST',
  modulos: [{ codigo: 'salon', nombre: 'Salón', opciones: [{ codigo: 'rest.salon.pedidos', nombre: 'Pedidos', permisos: ['rest.mesa.ver', 'rest.pedido.anular', 'rest.pedido.tomar'].map(permiso) }] }],
  otros: [],
};
const rol = (cambios: object = {}) => ({
  id: 'r-terraza',
  codigo: 'MOZO_TERRAZA',
  nombre: 'Mozo terraza',
  producto_codigo: 'REST',
  producto_nombre: 'Restaurante',
  predefinido: false,
  activo: true,
  permisos: ['rest.mesa.ver', 'rest.pedido.tomar'],
  ...cambios,
});

@Component({ template: '' })
class Destino {}

describe('RolDetallePage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn>; confirmarDestructiva: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperar = (ruta: string): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}${ruta}`);
  const accion = (nombre: string) => elemento().querySelector<HTMLButtonElement>(`[data-accion=${nombre}]`);
  const casillaDePermiso = (codigo: string) => elemento().querySelector<HTMLInputElement>(`[data-permiso="${codigo}"] input[type=checkbox]`);

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(detalle: object = rol()): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/roles/:rolId', component: RolDetallePage },
          { path: '**', component: Destino },
        ]),
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create('/admin/roles/r-terraza');
    await estable();
    esperar('/seg/roles/r-terraza').flush(detalle);
    await estable();
    esperar('/seg/catalogo/REST').flush(ARBOL_REST);
    await estable();
  }

  async function recargar(detalle: object): Promise<void> {
    esperar('/seg/roles/r-terraza').flush(detalle);
    await estable();
  }

  beforeEach(() => {
    avisos = { toast: vi.fn(), confirmarDestructiva: vi.fn(async () => ({ confirmado: true, motivo: null })) };
  });

  afterEach(() => http.verify());

  describe('rol propio activo', () => {
    it('muestra la cabecera y el árbol editable con sus permisos marcados', async () => {
      await abrir();

      expect(elemento().querySelector('h1')?.textContent?.trim()).toBe('Mozo terraza');
      expect(elemento().querySelector('[data-tipo]')?.textContent?.trim()).toBe('Propio');
      expect(elemento().querySelector('[data-estado]')?.textContent?.trim()).toBe('Activo');
      expect(casillaDePermiso('rest.pedido.tomar')?.checked).toBe(true);
      expect(casillaDePermiso('rest.pedido.anular')?.disabled).toBe(false);
    });

    it('«Guardar» está deshabilitado sin cambios; con cambios envía PUT con el conjunto completo', async () => {
      await abrir();
      expect(accion('guardar')?.disabled).toBe(true);

      casillaDePermiso('rest.mesa.ver')?.click();
      await estable();
      expect(accion('guardar')?.disabled).toBe(false);
      accion('guardar')?.click();
      await estable();

      const peticion = esperar('/seg/roles/r-terraza/permisos');
      expect(peticion.request.method).toBe('PUT');
      expect(peticion.request.body).toEqual({ permisos: ['rest.pedido.tomar'] });
      peticion.flush(null, { status: 204, statusText: 'No Content' });
      await estable();
      await recargar(rol({ permisos: ['rest.pedido.tomar'] }));

      expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_ROLES.permisosGuardados);
      expect(accion('guardar')?.disabled).toBe(true);
    });

    it('sin permisos marcados avisa y no deja guardar', async () => {
      await abrir();

      casillaDePermiso('rest.mesa.ver')?.click();
      casillaDePermiso('rest.pedido.tomar')?.click();
      await estable();

      expect(elemento().querySelector('[data-error=permisos]')?.textContent?.trim()).toBe(MENSAJES_ROLES.seleccionePermiso);
      expect(accion('guardar')?.disabled).toBe(true);
    });

    it('TR-CA-033: con 4 afectados confirma con el conteo, sin motivo, y envía { confirmado: true }', async () => {
      await abrir();

      accion('inactivar')?.click();
      await estable();
      const consulta = esperar('/seg/roles/r-terraza/inactivar');
      expect(consulta.request.body).toEqual({ confirmado: false });
      consulta.flush({ requiere_confirmacion: true, afectados: 4 });
      await estable();

      expect(avisos.confirmarDestructiva).toHaveBeenCalledWith({
        titulo: CONFIRMACION_INACTIVAR_ROL.titulo('Mozo terraza'),
        texto: 'El rol Mozo terraza está asignado a 4 usuarios. Sus permisos dejarán de estar vigentes.',
        textoConfirmar: MENSAJES_ROLES.inactivar,
      });
      const confirmacion = esperar('/seg/roles/r-terraza/inactivar');
      expect(confirmacion.request.body).toEqual({ confirmado: true });
      confirmacion.flush({ requiere_confirmacion: false, afectados: 4 });
      await estable();
      await recargar(rol({ activo: false }));

      expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_ROLES.rolInactivado);
      expect(elemento().querySelector('[data-estado]')?.textContent?.trim()).toBe('Inactivo');
    });

    it('con 0 afectados la confirmación no menciona usuarios', async () => {
      await abrir();

      accion('inactivar')?.click();
      await estable();
      esperar('/seg/roles/r-terraza/inactivar').flush({ requiere_confirmacion: true, afectados: 0 });
      await estable();

      expect(avisos.confirmarDestructiva).toHaveBeenCalledWith({ titulo: CONFIRMACION_INACTIVAR_ROL.titulo('Mozo terraza'), texto: undefined, textoConfirmar: MENSAJES_ROLES.inactivar });
      esperar('/seg/roles/r-terraza/inactivar').flush({ requiere_confirmacion: false, afectados: 0 });
      await estable();
      await recargar(rol({ activo: false }));
    });

    it('si se cancela la confirmación no inactiva', async () => {
      avisos.confirmarDestructiva.mockResolvedValueOnce({ confirmado: false });
      await abrir();

      accion('inactivar')?.click();
      await estable();
      esperar('/seg/roles/r-terraza/inactivar').flush({ requiere_confirmacion: true, afectados: 4 });
      await estable();

      http.expectNone(`${API_URL}/seg/roles/r-terraza/inactivar`);
      expect(avisos.toast).not.toHaveBeenCalled();
    });

    it('«Copiar» lleva a la página de copia', async () => {
      await abrir();

      accion('copiar')?.click();
      await estable();

      expect(url()).toBe('/admin/roles/r-terraza/copiar');
    });
  });

  it('TR-CA-032: un predefinido abre en solo lectura con el aviso del SRS y solo «Copiar»', async () => {
    await abrir(rol({ codigo: 'REST_MOZO', nombre: 'Mozo', predefinido: true }));

    expect(elemento().querySelector('[data-aviso=predefinido]')?.textContent?.trim()).toBe('Los roles predefinidos no se editan; cree una copia');
    expect(elemento().querySelector('[data-tipo]')?.textContent?.trim()).toBe('Predefinido');
    expect(accion('copiar')).not.toBeNull();
    expect(accion('guardar')).toBeNull();
    expect(accion('inactivar')).toBeNull();
    expect(casillaDePermiso('rest.pedido.tomar')?.disabled).toBe(true);
  });

  it('un rol propio inactivo se ve en solo lectura y sin acciones', async () => {
    await abrir(rol({ activo: false }));

    expect(elemento().querySelector('[data-aviso=inactivo]')?.textContent?.trim()).toBe(MENSAJES_ROLES.inactivoNoEditable);
    expect(elemento().querySelector('[data-acciones-rol]')).toBeNull();
    expect(casillaDePermiso('rest.pedido.tomar')?.disabled).toBe(true);
  });

  it('un rol que no existe muestra el mensaje de la API', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'admin/roles/:rolId', component: RolDetallePage }]),
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create('/admin/roles/r-terraza');
    await estable();
    esperar('/seg/roles/r-terraza').flush({ codigo: 'NO_ENCONTRADO', mensaje: 'El rol no existe' }, { status: 404, statusText: 'Not Found' });
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe('El rol no existe');
  });
});
