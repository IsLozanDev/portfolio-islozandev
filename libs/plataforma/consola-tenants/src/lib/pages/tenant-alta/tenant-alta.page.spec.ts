import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatStepper } from '@angular/material/stepper';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_ALTA } from '../../models/mensajes-consola';
import { PERMISOS_CONSOLA } from '../../models/permisos-consola';
import { BorradorAltaService } from '../../services/borrador-alta.service';
import type { FormularioAlta } from '../../utils/formulario-alta';
import { TenantAltaPage } from './tenant-alta.page';

const RUTA_NUEVO = '/consola/tenants/nuevo';
const URL_TENANTS = `${API_URL}/org/tenants`;
const RUTA_MFA = '/auth/mfa';
const CREADO = { tenant_id: 't-polleria', estado: 'PRUEBA', usuario_nuevo: true, correo_enviado: true };

@Component({ template: '' })
class Destino {}

/** La primera prueba compila el stepper y el datepicker de Material; con la máquina ocupada pasa los 5 s. */
const ESPERA_PRIMERA_CARGA_MS = 30_000;

describe('TenantAltaPage', { timeout: ESPERA_PRIMERA_CARGA_MS }, () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;
  let avisos: { toast: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const pagina = () => harness.routeDebugElement?.componentInstance as TenantAltaPage;
  const formulario = () => (pagina() as unknown as { formulario: FormularioAlta }).formulario;
  const stepper = () => harness.fixture.debugElement.query(By.directive(MatStepper)).componentInstance as MatStepper;

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
          { path: 'consola/tenants/nuevo', component: TenantAltaPage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { mfa: RUTA_MFA } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(RUTA_NUEVO);
    await estable();
  }

  function escribir(campo: string, valor: string): void {
    const entrada = elemento().querySelector<HTMLInputElement>(`[data-campo=${campo}]`);
    if (!entrada) throw new Error(`No hay campo ${campo}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
  }

  async function pulsar(texto: string): Promise<void> {
    const boton = [...elemento().querySelectorAll<HTMLButtonElement>('button')].find((candidato) => candidato.textContent?.trim() === texto);
    if (!boton) throw new Error(`No hay botón «${texto}»`);
    boton.click();
    await estable();
  }

  /** TR-CA-001: «polleria-dona-rosa», REST, BASICO, PRUEBA. */
  async function llenarPasoTenant(codigo = 'polleria-dona-rosa'): Promise<void> {
    escribir('codigo', codigo);
    escribir('nombre', 'Pollería Doña Rosa');
    formulario().controls.tenant.patchValue({ productoCodigo: 'REST', plan: 'BASICO' });
    await pulsar(MENSAJES_ALTA.siguiente);
  }

  async function llenarPasoEmpresa(ruc = '20601234565'): Promise<void> {
    escribir('ruc', ruc);
    escribir('razon-social', 'Pollería Doña Rosa S.A.C.');
    escribir('correo-propietario', 'rosa.quispe@gmail.com');
    escribir('nombre-propietario', 'Rosa Quispe');
    await estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion();
    sesion.contexto.set({ permisos: [PERMISOS_CONSOLA.tenantConsultar, PERMISOS_CONSOLA.tenantCrear], mfaVigente: true });
    avisos = { toast: vi.fn(), advertencia: vi.fn(async () => undefined) };
  });

  afterEach(() => {
    http.verify();
    TestBed.inject(BorradorAltaService).limpiar();
  });

  it('TR-CA-001: crea el tenant con el cuerpo en snake_case, avisa y abre su detalle', async () => {
    await abrir();
    await llenarPasoTenant();
    await llenarPasoEmpresa();
    await pulsar(MENSAJES_ALTA.crear);

    const peticion = http.expectOne(URL_TENANTS);
    expect(peticion.request.body).toEqual({
      codigo: 'polleria-dona-rosa',
      nombre: 'Pollería Doña Rosa',
      producto_codigo: 'REST',
      plan: 'BASICO',
      modalidad: 'PRUEBA',
      ruc: '20601234565',
      razon_social: 'Pollería Doña Rosa S.A.C.',
      correo_propietario: 'rosa.quispe@gmail.com',
      nombre_propietario: 'Rosa Quispe',
    });
    peticion.flush(CREADO);
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_ALTA.creado);
    expect(url()).toBe('/consola/tenants/t-polleria');
    expect(TestBed.inject(BorradorAltaService).leer()).toBeNull();
  });

  it('un código con mayúsculas o espacios no deja avanzar al paso 2', async () => {
    await abrir();
    await llenarPasoTenant('Polleria Dona Rosa');

    expect(stepper().selectedIndex).toBe(0);
    expect(elemento().querySelector('mat-error')?.textContent).toContain(MENSAJES_ALTA.codigoFormato);
  });

  it('modalidad ACTIVO sin vigente hasta no deja avanzar', async () => {
    await abrir();
    formulario().controls.tenant.controls.modalidad.setValue('ACTIVO');
    formulario().controls.tenant.controls.vigenteHasta.updateValueAndValidity();
    await estable();
    await llenarPasoTenant();

    expect(stepper().selectedIndex).toBe(0);
    expect(elemento().querySelector('[data-campo="vigente-hasta"]')).not.toBeNull();
  });

  it('TR-CA-003: con RUC 20601234560 muestra «RUC inválido» y no envía', async () => {
    await abrir();
    await llenarPasoTenant();
    await llenarPasoEmpresa('20601234560');
    await pulsar(MENSAJES_ALTA.crear);

    http.expectNone(URL_TENANTS);
    expect(elemento().textContent).toContain(MENSAJES_ALTA.rucInvalido);
  });

  it('TR-CA-002: con código repetido vuelve al paso 1 con el mensaje en el código y no navega', async () => {
    await abrir();
    await llenarPasoTenant();
    await llenarPasoEmpresa();
    await pulsar(MENSAJES_ALTA.crear);
    http.expectOne(URL_TENANTS).flush({ codigo: 'TENANT_DUPLICADO', mensaje: 'El código de tenant ya existe' }, { status: 409, statusText: 'Conflict' });
    await estable();

    expect(stepper().selectedIndex).toBe(0);
    expect(elemento().querySelector('mat-error')?.textContent).toContain('El código de tenant ya existe');
    expect(url()).toBe(RUTA_NUEVO);
  });

  it('con correo_enviado: false avisa con advertencia que el correo no se envió', async () => {
    await abrir();
    await llenarPasoTenant();
    await llenarPasoEmpresa();
    await pulsar(MENSAJES_ALTA.crear);
    http.expectOne(URL_TENANTS).flush({ ...CREADO, usuario_nuevo: false, correo_enviado: false });
    await estable();

    expect(avisos.advertencia).toHaveBeenCalledWith(MENSAJES_ALTA.creado, MENSAJES_ALTA.correoNoEnviado);
  });

  it('TR-RNF-008: un doble clic en «Crear tenant» envía una sola petición', async () => {
    await abrir();
    await llenarPasoTenant();
    await llenarPasoEmpresa();
    const crear = [...elemento().querySelectorAll<HTMLButtonElement>('button')].find((boton) => boton.textContent?.trim() === MENSAJES_ALTA.crear);
    crear?.click();
    crear?.click();
    await estable();

    http.expectOne(URL_TENANTS).flush(CREADO);
    await estable();
  });

  it('si el MFA venció, guarda el borrador, va a /auth/mfa y al volver restaura datos y paso', async () => {
    await abrir();
    await llenarPasoTenant();
    await llenarPasoEmpresa();
    sesion.contexto.set({ permisos: [PERMISOS_CONSOLA.tenantCrear], mfaVigente: false });
    await pulsar(MENSAJES_ALTA.crear);

    await vi.waitFor(() => expect(url()).toBe(`${RUTA_MFA}?returnUrl=${encodeURIComponent(RUTA_NUEVO)}`));
    http.expectNone(URL_TENANTS);

    sesion.contexto.set({ permisos: [PERMISOS_CONSOLA.tenantCrear], mfaVigente: true });
    await harness.navigateByUrl(RUTA_NUEVO);
    await estable();

    expect(stepper().selectedIndex).toBe(1);
    expect(formulario().getRawValue().tenant.codigo).toBe('polleria-dona-rosa');
    expect(formulario().getRawValue().empresa.correoPropietario).toBe('rosa.quispe@gmail.com');
  });

  it('sin MFA vigente al abrir lleva a /auth/mfa antes de llenar nada', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_CONSOLA.tenantCrear], mfaVigente: false });
    await abrir();

    await vi.waitFor(() => expect(url()).toBe(`${RUTA_MFA}?returnUrl=${encodeURIComponent(RUTA_NUEVO)}`));
  });

  it('«Cancelar» borra el borrador y vuelve a la lista', async () => {
    await abrir();
    await llenarPasoTenant();
    await pulsar('Cancelar');

    expect(TestBed.inject(BorradorAltaService).leer()).toBeNull();
    expect(url()).toBe('/consola/tenants');
  });
});
