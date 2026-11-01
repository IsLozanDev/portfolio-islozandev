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
import type { GrupoCodigoNombre } from '../../utils/formulario-codigo-nombre';
import { PerfilNuevoPage } from './perfil-nuevo.page';

const RUTA_NUEVO = '/admin/perfiles/nuevo';
const rolDisponible = (id: string, productoCodigo: string, productoNombre: string) => ({
  id,
  codigo: id.toUpperCase(),
  nombre: id,
  producto_codigo: productoCodigo,
  producto_nombre: productoNombre,
  predefinido: true,
});
const DISPONIBLES = [rolDisponible('eco-gestor', 'ECO', 'Comercio'), rolDisponible('lib-vendedor', 'LIB', 'Librería')];

@Component({ template: '' })
class Destino {}

describe('PerfilNuevoPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperar = (ruta: string): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}${ruta}`);
  const pagina = () => harness.routeDebugElement?.componentInstance as { grupo: GrupoCodigoNombre };
  const casillaDeRol = (rolId: string) => elemento().querySelector<HTMLInputElement>(`[data-rol="${rolId}"] input[type=checkbox]`);

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
          { path: 'admin/perfiles/nuevo', component: PerfilNuevoPage },
          { path: '**', component: Destino },
        ]),
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(RUTA_NUEVO);
    await estable();
    esperar('/seg/perfiles/roles-disponibles').flush({ items: DISPONIBLES });
    await estable();
  }

  async function pulsarCrear(): Promise<void> {
    [...elemento().querySelectorAll<HTMLButtonElement>('button')].find((boton) => boton.textContent?.trim() === MENSAJES_PERFILES.crear)?.click();
    await estable();
  }

  beforeEach(() => {
    avisos = { toast: vi.fn() };
  });

  afterEach(() => http.verify());

  it('TR-CA-034: crea «Encargado de tienda» con roles de dos productos y navega al detalle', async () => {
    await abrir();
    pagina().grupo.setValue({ codigo: 'ENCARGADO', nombre: 'Encargado de tienda' });
    casillaDeRol('lib-vendedor')?.click();
    casillaDeRol('eco-gestor')?.click();
    await estable();

    await pulsarCrear();

    const peticion = esperar('/seg/perfiles');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ codigo: 'ENCARGADO', nombre: 'Encargado de tienda', roles: ['eco-gestor', 'lib-vendedor'] });
    peticion.flush({ perfil_id: 'p-nuevo' }, { status: 201, statusText: 'Created' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_PERFILES.perfilCreado);
    expect(url()).toBe('/admin/perfiles/p-nuevo');
  });

  it('TR-CA-035: el selector solo muestra los roles disponibles', async () => {
    await abrir();

    expect([...elemento().querySelectorAll('[data-rol]')].map((fila) => fila.getAttribute('data-rol'))).toEqual(['eco-gestor', 'lib-vendedor']);
  });

  it('sin roles marcados muestra «Seleccione al menos un rol» y no envía', async () => {
    await abrir();
    pagina().grupo.setValue({ codigo: 'VACIO', nombre: 'Vacío' });

    await pulsarCrear();

    expect(elemento().querySelector('[data-error=roles]')?.textContent?.trim()).toBe(MENSAJES_PERFILES.seleccioneRol);
    http.expectNone(`${API_URL}/seg/perfiles`);
  });

  it.each([
    ['CONFLICTO', 409, 'Ya existe un perfil con ese código en el tenant'],
    ['ROL_FUERA_DEL_TECHO', 400, 'El rol PLAT_ADMIN_TENANTS no se puede usar en un perfil del cliente'],
    ['PRODUCTO_NO_CONTRATADO', 400, 'El tenant no tiene suscripción vigente al producto CLI'],
  ])('%s muestra el mensaje de la API sin navegar', async (codigo, estado, mensaje) => {
    await abrir();
    pagina().grupo.setValue({ codigo: 'ENCARGADO', nombre: 'Encargado de tienda' });
    casillaDeRol('lib-vendedor')?.click();
    await estable();

    await pulsarCrear();
    esperar('/seg/perfiles').flush({ codigo, mensaje }, { status: estado, statusText: 'Error' });
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe(mensaje);
    expect(url()).toBe(RUTA_NUEVO);
  });
});
