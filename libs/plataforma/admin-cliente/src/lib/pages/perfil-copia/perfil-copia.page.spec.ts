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
import { PerfilCopiaPage } from './perfil-copia.page';

const RUTA_COPIA = '/admin/perfiles/p-caja/copiar';
const CAJA = { id: 'p-caja', codigo: 'CAJA', nombre: 'Caja', predefinido: true, roles: ['eco-gestor', 'lib-vendedor', 'r-inactivo'] };
const rolDisponible = (id: string, productoCodigo: string) => ({
  id,
  codigo: id.toUpperCase(),
  nombre: id,
  producto_codigo: productoCodigo,
  producto_nombre: productoCodigo,
  predefinido: true,
});
const DISPONIBLES = [rolDisponible('eco-gestor', 'ECO'), rolDisponible('lib-vendedor', 'LIB'), rolDisponible('lib-cajero', 'LIB')];

@Component({ template: '' })
class Destino {}

describe('PerfilCopiaPage', () => {
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
          { path: 'admin/perfiles/:perfilId/copiar', component: PerfilCopiaPage },
          { path: '**', component: Destino },
        ]),
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(RUTA_COPIA);
    await estable();
    esperar('/seg/perfiles/p-caja').flush(CAJA);
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

  it('titula con el nombre del origen y precarga solo sus roles que siguen disponibles', async () => {
    await abrir();

    expect(elemento().querySelector('h1')?.textContent?.trim()).toBe(MENSAJES_PERFILES.tituloCopia('Caja'));
    expect(casillaDeRol('eco-gestor')?.checked).toBe(true);
    expect(casillaDeRol('lib-vendedor')?.checked).toBe(true);
    expect(casillaDeRol('lib-cajero')?.checked).toBe(false);
    expect(elemento().querySelector('[data-rol="r-inactivo"]')).toBeNull();
  });

  it('al quitar un rol envía POST /copia con roles sin ese id y navega al detalle de la copia', async () => {
    await abrir();
    pagina().grupo.setValue({ codigo: 'CAJA_PROPIA', nombre: 'Caja propia' });
    casillaDeRol('eco-gestor')?.click();
    await estable();

    await pulsarCrear();

    const peticion = esperar('/seg/perfiles/p-caja/copia');
    expect(peticion.request.body).toEqual({ codigo: 'CAJA_PROPIA', nombre: 'Caja propia', roles: ['lib-vendedor'] });
    peticion.flush({ perfil_id: 'p-copia' }, { status: 201, statusText: 'Created' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_PERFILES.perfilCreado);
    expect(url()).toBe('/admin/perfiles/p-copia');
  });

  it('sin roles marcados no envía', async () => {
    await abrir();
    pagina().grupo.setValue({ codigo: 'VACIO', nombre: 'Vacío' });
    casillaDeRol('eco-gestor')?.click();
    casillaDeRol('lib-vendedor')?.click();
    await estable();

    await pulsarCrear();

    expect(elemento().querySelector('[data-error=roles]')?.textContent?.trim()).toBe(MENSAJES_PERFILES.seleccioneRol);
    http.expectNone(`${API_URL}/seg/perfiles/p-caja/copia`);
  });

  it('CONFLICTO muestra el mensaje de la API sin navegar', async () => {
    await abrir();
    pagina().grupo.setValue({ codigo: 'CAJA', nombre: 'Caja' });

    await pulsarCrear();
    esperar('/seg/perfiles/p-caja/copia').flush({ codigo: 'CONFLICTO', mensaje: 'Ya existe un perfil con ese código en el tenant' }, { status: 409, statusText: 'Conflict' });
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe('Ya existe un perfil con ese código en el tenant');
    expect(url()).toBe(RUTA_COPIA);
  });
});
