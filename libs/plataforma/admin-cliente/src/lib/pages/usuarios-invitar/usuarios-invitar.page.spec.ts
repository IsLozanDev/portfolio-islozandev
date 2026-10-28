import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { FormAsignacionComponent } from '../../components/form-asignacion/form-asignacion.component';
import { MENSAJES_ADMIN } from '../../models/mensajes-admin';
import { UsuariosInvitarPage } from './usuarios-invitar.page';

const RUTA_INVITAR = '/admin/usuarios/invitar';
const RUTA_MFA = '/auth/mfa';
const ASIGNABLES = {
  roles: [
    { id: 'r-cajero', codigo: 'CAJERO', nombre: 'Cajero', producto_codigo: 'REST', sensible: false },
    { id: 'r-supervisor', codigo: 'SUPERVISOR', nombre: 'Supervisor', producto_codigo: 'REST', sensible: true },
  ],
  perfiles: [{ id: 'p-cajero', codigo: 'CAJERO', nombre: 'Cajero', sensible: false }],
};

@Component({ template: '' })
class Destino {}

describe('UsuariosInvitarPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;
  let avisos: { toast: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperar = (ruta: string): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}${ruta}`);
  const grupoAsignacion = () => (harness.routeDebugElement?.query(By.directive(FormAsignacionComponent)).componentInstance as FormAsignacionComponent).grupo();

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(estado?: object): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: RUTA_INVITAR.slice(1), component: UsuariosInvitarPage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { mfa: RUTA_MFA } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await TestBed.inject(Router).navigateByUrl(RUTA_INVITAR, { state: estado });
    await estable();
    esperar('/seg/asignables').flush(ASIGNABLES);
    await estable();
    esperar('/org/empresas').flush({ items: [{ id: 'e-1', razon_social: 'Sabores del Sur SAC' }], total: 1 });
    await estable();
  }

  function escribir(campo: string, valor: string): void {
    const entrada = elemento().querySelector<HTMLInputElement>(`[data-campo=${campo}]`);
    if (!entrada) throw new Error(`No hay campo ${campo}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
  }

  /** TR-CA-025: Rosa Huamán con el perfil «Cajero» en la sucursal «Miraflores». */
  function llenarRosa(asignable = 'perfil:p-cajero'): void {
    escribir('nombre', 'Rosa Huamán');
    escribir('correo', 'rosa.huaman@gmail.com');
    grupoAsignacion().patchValue({ asignable, alcance: 'SUCURSAL' });
    grupoAsignacion().controls.empresaId.setValue('e-1');
    esperar('/org/empresas/e-1/sucursales').flush({ items: [{ id: 's-mir', codigo: 'MIRAFLORES', nombre: 'Miraflores' }], total: 1 });
    grupoAsignacion().controls.sucursalId.setValue('s-mir');
    esperar('/org/unidades').flush({ items: [], total: 0 });
  }

  async function pulsarInvitar(): Promise<void> {
    const boton = [...elemento().querySelectorAll<HTMLButtonElement>('button')].find((candidato) => candidato.textContent?.trim() === MENSAJES_ADMIN.invitar);
    boton?.click();
    await estable();
  }

  const emitida = (correoEnviado: boolean) => ({ membresia_id: 'm-rosa', invitacion_id: 'i-1', expira_en: '2026-10-23T15:00:00.000Z', usuario_nuevo: true, correo_enviado: correoEnviado });

  beforeEach(() => {
    sesion = new DobleSesion();
    avisos = { toast: vi.fn(), advertencia: vi.fn(async () => undefined) };
  });

  afterEach(() => http.verify());

  it('TR-CA-025: invita a Rosa como Cajero en Miraflores y lleva al detalle', async () => {
    await abrir();
    llenarRosa();
    await pulsarInvitar();

    const peticion = esperar('/seg/invitaciones');
    expect(peticion.request.body).toEqual({
      nombre: 'Rosa Huamán',
      correo: 'rosa.huaman@gmail.com',
      rol_id: null,
      perfil_id: 'p-cajero',
      alcance: 'SUCURSAL',
      empresa_id: null,
      sucursal_id: 's-mir',
      unidad_id: null,
      vigente_hasta: null,
    });
    peticion.flush(emitida(true), { status: 201, statusText: 'Created' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_ADMIN.invitacionEnviada);
    expect(url()).toBe('/admin/usuarios/m-rosa');
  });

  it('correo_enviado: false avisa que hay que reenviar y sigue al detalle', async () => {
    await abrir();
    llenarRosa();
    await pulsarInvitar();
    esperar('/seg/invitaciones').flush(emitida(false), { status: 201, statusText: 'Created' });
    await estable();

    expect(avisos.advertencia).toHaveBeenCalledWith(MENSAJES_ADMIN.tituloCorreoNoEnviado, MENSAJES_ADMIN.correoNoEnviado);
    expect(url()).toBe('/admin/usuarios/m-rosa');
  });

  it.each([
    ['LIMITE_USUARIOS', 409, 'El plan de REST permite 10 usuarios'],
    ['ALCANCE_SUPERIOR', 403, 'No puede otorgar un alcance mayor al suyo'],
    ['MEMBRESIA_EXISTENTE', 409, 'El usuario ya es miembro del tenant (ACTIVO)'],
  ])('%s muestra el mensaje de la API en el formulario y no navega', async (codigo, status, mensaje) => {
    await abrir();
    llenarRosa();
    await pulsarInvitar();
    esperar('/seg/invitaciones').flush({ codigo, mensaje }, { status, statusText: 'Error' });
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe(mensaje);
    expect(url()).toBe(RUTA_INVITAR);
  });

  it('con el formulario incompleto no envía nada', async () => {
    await abrir();
    escribir('nombre', 'Ro');
    await pulsarInvitar();

    expect(url()).toBe(RUTA_INVITAR);
  });

  it('un rol sensible sin MFA vigente no envía y lleva a /auth/mfa', async () => {
    await abrir();
    llenarRosa('rol:r-supervisor');
    await pulsarInvitar();

    expect(url()).toBe(`${RUTA_MFA}?returnUrl=${encodeURIComponent(RUTA_INVITAR)}`);
  });

  it('un rol sensible con MFA vigente sí envía', async () => {
    sesion.contexto.set({ permisos: [], mfaVigente: true });
    await abrir();
    llenarRosa('rol:r-supervisor');
    await pulsarInvitar();

    esperar('/seg/invitaciones').flush(emitida(true), { status: 201, statusText: 'Created' });
    await estable();
    expect(url()).toBe('/admin/usuarios/m-rosa');
  });

  it('reenviar trae nombre y correo del state de la navegación, no de la URL', async () => {
    await abrir({ reenviar: { nombre: 'Pedro Salazar', correo: 'pedro.salazar@outlook.com' } });

    expect(elemento().querySelector<HTMLInputElement>('[data-campo=nombre]')?.value).toBe('Pedro Salazar');
    expect(elemento().querySelector<HTMLInputElement>('[data-campo=correo]')?.value).toBe('pedro.salazar@outlook.com');
    expect(url()).toBe(RUTA_INVITAR);
  });
});
