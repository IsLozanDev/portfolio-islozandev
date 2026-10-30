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
import { MENSAJES_ROLES } from '../../models/mensajes-admin';
import type { GrupoRol } from '../../utils/formulario-rol';
import { RolNuevoPage } from './rol-nuevo.page';

const RUTA_NUEVO = '/admin/roles/nuevo';
const permiso = (codigo: string) => ({ codigo, descripcion: codigo, sensible: false, alcance_minimo: 'UNIDAD' });
const arbolCon = (producto: string, ...codigos: string[]) => ({
  producto_codigo: producto,
  modulos: [{ codigo: 'modulo', nombre: 'Módulo', opciones: [{ codigo: `${producto}.opcion`, nombre: 'Opción', permisos: codigos.map(permiso) }] }],
  otros: [],
});

@Component({ template: '' })
class Destino {}

describe('RolNuevoPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperar = (ruta: string): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}${ruta}`);
  const pagina = () => harness.routeDebugElement?.componentInstance as { grupo: GrupoRol };

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/roles/nuevo', component: RolNuevoPage },
          { path: '**', component: Destino },
        ]),
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(RUTA_NUEVO);
    await estable();
    esperar('/seg/productos-disponibles').flush({
      items: [
        { codigo: 'PLAT', nombre: 'Plataforma' },
        { codigo: 'REST', nombre: 'Restaurante' },
      ],
    });
    await estable();
  }

  async function elegirProducto(nombre: string, arbol: object): Promise<void> {
    elemento().querySelector<HTMLElement>('[data-campo=producto]')?.click();
    await estable();
    [...document.querySelectorAll<HTMLElement>('mat-option')].find((opcion) => opcion.textContent?.trim() === nombre)?.click();
    await estable();
    esperar(`/seg/catalogo/${(arbol as { producto_codigo: string }).producto_codigo}`).flush(arbol);
    await estable();
  }

  const casillaDePermiso = (codigo: string) => elemento().querySelector<HTMLInputElement>(`[data-permiso="${codigo}"] input[type=checkbox]`);

  async function pulsarCrear(): Promise<void> {
    [...elemento().querySelectorAll<HTMLButtonElement>('button')].find((boton) => boton.textContent?.trim() === MENSAJES_ROLES.crear)?.click();
    await estable();
  }

  beforeEach(() => {
    avisos = { toast: vi.fn() };
  });

  afterEach(() => http.verify());

  it('crea el rol con los permisos marcados y va a su detalle con un toast', async () => {
    await abrir();
    await elegirProducto('Restaurante', arbolCon('REST', 'rest.pedido.tomar', 'rest.mesa.ver'));
    pagina().grupo.setValue({ codigo: 'MOZO_BARRA', nombre: 'Mozo de barra' });
    casillaDePermiso('rest.pedido.tomar')?.click();
    casillaDePermiso('rest.mesa.ver')?.click();
    await estable();

    await pulsarCrear();

    const peticion = esperar('/seg/roles');
    expect(peticion.request.body).toEqual({ producto_codigo: 'REST', codigo: 'MOZO_BARRA', nombre: 'Mozo de barra', permisos: ['rest.mesa.ver', 'rest.pedido.tomar'] });
    peticion.flush({ rol_id: 'r-nuevo' }, { status: 201, statusText: 'Created' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_ROLES.rolCreado);
    expect(url()).toBe('/admin/roles/r-nuevo');
  });

  it('cambiar el producto limpia la selección y pide el catálogo del producto nuevo', async () => {
    await abrir();
    await elegirProducto('Restaurante', arbolCon('REST', 'rest.mesa.ver'));
    casillaDePermiso('rest.mesa.ver')?.click();
    await estable();
    expect(elemento().querySelector('[data-contador]')?.textContent?.trim()).toBe(MENSAJES_ROLES.permisosSeleccionados(1));

    await elegirProducto('Plataforma', arbolCon('PLAT', 'plat.rol.gestionar'));

    expect(elemento().querySelector('[data-contador]')?.textContent?.trim()).toBe(MENSAJES_ROLES.permisosSeleccionados(0));
    expect(casillaDePermiso('plat.rol.gestionar')?.checked).toBe(false);
  });

  it('sin permisos marcados muestra «Seleccione al menos un permiso» y no envía', async () => {
    await abrir();
    await elegirProducto('Restaurante', arbolCon('REST', 'rest.mesa.ver'));
    pagina().grupo.setValue({ codigo: 'VACIO', nombre: 'Vacío' });

    await pulsarCrear();

    expect(elemento().querySelector('[data-error=permisos]')?.textContent?.trim()).toBe(MENSAJES_ROLES.seleccionePermiso);
    http.expectNone(`${API_URL}/seg/roles`);
  });

  it('CONFLICTO muestra el mensaje de la API en el formulario sin navegar', async () => {
    await abrir();
    await elegirProducto('Restaurante', arbolCon('REST', 'rest.mesa.ver'));
    pagina().grupo.setValue({ codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza' });
    casillaDePermiso('rest.mesa.ver')?.click();
    await estable();

    await pulsarCrear();
    esperar('/seg/roles').flush({ codigo: 'CONFLICTO', mensaje: 'Ya existe un rol con ese código en el tenant' }, { status: 409, statusText: 'Conflict' });
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe('Ya existe un rol con ese código en el tenant');
    expect(url()).toBe(RUTA_NUEVO);
    expect(avisos.toast).not.toHaveBeenCalled();
  });

  it('PERMISO_AJENO_AL_PRODUCTO muestra el mensaje de la API sin navegar', async () => {
    await abrir();
    await elegirProducto('Plataforma', arbolCon('PLAT', 'plat.rol.gestionar'));
    pagina().grupo.setValue({ codigo: 'ADMIN', nombre: 'Administrador' });
    casillaDePermiso('plat.rol.gestionar')?.click();
    await estable();

    await pulsarCrear();
    const mensaje = 'Permisos de otro producto, inexistentes u obsoletos: plat.rol.gestionar';
    esperar('/seg/roles').flush({ codigo: 'PERMISO_AJENO_AL_PRODUCTO', mensaje }, { status: 400, statusText: 'Bad Request' });
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe(mensaje);
    expect(url()).toBe(RUTA_NUEVO);
  });
});
