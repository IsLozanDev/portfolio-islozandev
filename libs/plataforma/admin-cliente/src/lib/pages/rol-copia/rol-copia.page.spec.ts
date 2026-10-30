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
import { RolCopiaPage } from './rol-copia.page';

const RUTA_COPIA = '/admin/roles/r-mozo/copiar';
const REST_MOZO = {
  id: 'r-mozo',
  codigo: 'REST_MOZO',
  nombre: 'Mozo',
  producto_codigo: 'REST',
  producto_nombre: 'Restaurante',
  predefinido: true,
  activo: true,
  permisos: ['rest.mesa.ver', 'rest.pedido.anular', 'rest.pedido.tomar'],
};
const permiso = (codigo: string) => ({ codigo, descripcion: codigo, sensible: false, alcance_minimo: 'UNIDAD' });
const ARBOL_REST = {
  producto_codigo: 'REST',
  modulos: [
    {
      codigo: 'salon',
      nombre: 'Salón',
      opciones: [{ codigo: 'rest.salon.pedidos', nombre: 'Pedidos', permisos: ['rest.mesa.ver', 'rest.pedido.anular', 'rest.pedido.tomar', 'rest.caja.cerrar'].map(permiso) }],
    },
  ],
  otros: [],
};

@Component({ template: '' })
class Destino {}

describe('RolCopiaPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperar = (ruta: string): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}${ruta}`);
  const pagina = () => harness.routeDebugElement?.componentInstance as { grupo: GrupoRol };
  const casillaDePermiso = (codigo: string) => elemento().querySelector<HTMLInputElement>(`[data-permiso="${codigo}"] input[type=checkbox]`);

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
          { path: 'admin/roles/:rolId/copiar', component: RolCopiaPage },
          { path: '**', component: Destino },
        ]),
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(RUTA_COPIA);
    await estable();
    esperar('/seg/roles/r-mozo').flush(REST_MOZO);
    await estable();
    esperar('/seg/catalogo/REST').flush(ARBOL_REST);
    await estable();
  }

  async function pulsarCrear(): Promise<void> {
    [...elemento().querySelectorAll<HTMLButtonElement>('button')].find((boton) => boton.textContent?.trim() === MENSAJES_ROLES.crear)?.click();
    await estable();
  }

  beforeEach(() => {
    avisos = { toast: vi.fn() };
  });

  afterEach(() => http.verify());

  it('precarga los permisos del origen y titula con su nombre', async () => {
    await abrir();

    expect(elemento().querySelector('h1')?.textContent?.trim()).toBe(MENSAJES_ROLES.tituloCopia('Mozo'));
    expect(REST_MOZO.permisos.every((codigo) => casillaDePermiso(codigo)?.checked)).toBe(true);
    expect(casillaDePermiso('rest.caja.cerrar')?.checked).toBe(false);
  });

  it('TR-CA-031: copiar como «Mozo terraza» quitando rest.pedido.anular envía POST /copia sin ese permiso', async () => {
    await abrir();
    pagina().grupo.setValue({ codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza' });
    casillaDePermiso('rest.pedido.anular')?.click();
    await estable();

    await pulsarCrear();

    const peticion = esperar('/seg/roles/r-mozo/copia');
    expect(peticion.request.body).toEqual({ codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza', permisos: ['rest.mesa.ver', 'rest.pedido.tomar'] });
    peticion.flush({ rol_id: 'r-terraza' }, { status: 201, statusText: 'Created' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_ROLES.rolCreado);
    expect(url()).toBe('/admin/roles/r-terraza');
  });

  it('sin permisos marcados no envía', async () => {
    await abrir();
    pagina().grupo.setValue({ codigo: 'VACIO', nombre: 'Vacío' });
    for (const codigo of REST_MOZO.permisos) casillaDePermiso(codigo)?.click();
    await estable();

    await pulsarCrear();

    expect(elemento().querySelector('[data-error=permisos]')?.textContent?.trim()).toBe(MENSAJES_ROLES.seleccionePermiso);
    http.expectNone(`${API_URL}/seg/roles/r-mozo/copia`);
  });

  it('CONFLICTO muestra el mensaje de la API sin navegar', async () => {
    await abrir();
    pagina().grupo.setValue({ codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza' });

    await pulsarCrear();
    esperar('/seg/roles/r-mozo/copia').flush({ codigo: 'CONFLICTO', mensaje: 'Ya existe un rol con ese código en el tenant' }, { status: 409, statusText: 'Conflict' });
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe('Ya existe un rol con ese código en el tenant');
    expect(url()).toBe(RUTA_COPIA);
  });
});
