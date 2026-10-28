import { Location } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { CONFIRMACIONES, MENSAJES_DETALLE } from '../../models/mensajes-admin';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { LONGITUD_MINIMA_MOTIVO_SEG, UsuarioDetallePage } from './usuario-detalle.page';

const RUTA_PEDRO = '/admin/usuarios/m-pedro';
const RUTA_MFA = '/auth/mfa';
const TODOS_LOS_PERMISOS = [PERMISOS_ADMIN.usuarioInvitar, PERMISOS_ADMIN.asignacionOtorgar, PERMISOS_ADMIN.asignacionRevocar];

const asignacion = (id: string, estado: string, rol: string) => ({
  id,
  rol: { id: `r-${rol}`, nombre: rol },
  perfil: null,
  alcance: 'SUCURSAL',
  empresa: null,
  sucursal: { id: 's-mir', nombre: 'Miraflores' },
  unidad: null,
  vigente_desde: '2026-10-01',
  vigente_hasta: null,
  estado,
  revocada_en: null,
  motivo_revocacion: null,
});

const pedro = (estado: string, asignaciones = [asignacion('a-cajero', 'VIGENTE', 'Cajero'), asignacion('a-mozo', 'VIGENTE', 'Mozo')]) => ({
  membresia_id: 'm-pedro',
  usuario_id: 'u-pedro',
  nombre: 'Pedro Salazar',
  correo: 'pedro.salazar@outlook.com',
  estado,
  es_propietario: false,
  asignaciones_vigentes: asignaciones.length,
  invitacion_expira_en: null,
  desde: '2026-09-01T15:00:00.000Z',
  hasta: null,
  asignaciones,
});

@Component({ template: '' })
class Destino {}

describe('UsuarioDetallePage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;
  let avisos: { toast: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn>; confirmarDestructiva: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const esperar = (ruta: string): TestRequest => http.expectOne(`${API_URL}${ruta}`);
  const botones = () => [...elemento().querySelectorAll('[data-acciones-membresia] button')].map((boton) => boton.textContent?.trim());

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(detalle: object, opciones?: { status: number; statusText: string }): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/usuarios/:membresiaId', component: UsuarioDetallePage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { mfa: RUTA_MFA } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(RUTA_PEDRO);
    await estable();
    esperar('/seg/miembros/m-pedro').flush(detalle, opciones);
    await estable();
  }

  async function pulsar(texto: string, contenedor: Element = elemento()): Promise<void> {
    const boton = [...contenedor.querySelectorAll<HTMLButtonElement>('button')].find((candidato) => candidato.textContent?.trim() === texto);
    if (!boton) throw new Error(`No hay botón «${texto}»`);
    boton.click();
    await estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos(...TODOS_LOS_PERMISOS);
    sesion.contexto.set({ permisos: TODOS_LOS_PERMISOS, mfaVigente: true });
    avisos = { toast: vi.fn(), advertencia: vi.fn(async () => undefined), confirmarDestructiva: vi.fn(async () => ({ confirmado: true, motivo: 'Cese' })) };
  });

  afterEach(() => http.verify());

  it.each([
    ['ACTIVO', [MENSAJES_DETALLE.asignar, MENSAJES_DETALLE.suspender, MENSAJES_DETALLE.finalizar]],
    ['SUSPENDIDO', [MENSAJES_DETALLE.reactivar, MENSAJES_DETALLE.finalizar]],
    ['INVITADO', [MENSAJES_DETALLE.asignar, MENSAJES_DETALLE.finalizar, MENSAJES_DETALLE.reenviarInvitacion]],
    ['FINALIZADO', [MENSAJES_DETALLE.reenviarInvitacion]],
  ])('%s ofrece %o', async (estado, esperadas) => {
    await abrir(pedro(estado));

    expect(botones()).toEqual(esperadas);
  });

  it('sin plat.asignacion.revocar no ve suspender, finalizar ni revocar; sin otorgar no ve asignar', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_ADMIN.usuarioInvitar], mfaVigente: true });
    await abrir(pedro('ACTIVO'));

    expect(botones()).toEqual([]);
    expect(elemento().textContent).not.toContain(MENSAJES_DETALLE.revocar);
  });

  it('TR-CA-039: finalizar con «Cese» pide el motivo con mínimo 4, envía confirmar y muestra FINALIZADO', async () => {
    await abrir(pedro('ACTIVO'));
    await pulsar(MENSAJES_DETALLE.finalizar, elemento().querySelector('[data-acciones-membresia]') ?? elemento());

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: CONFIRMACIONES.finalizar.titulo('Pedro Salazar'), pedirMotivo: true, longitudMinimaMotivo: LONGITUD_MINIMA_MOTIVO_SEG }),
    );
    const peticion = esperar('/seg/membresias/m-pedro/finalizar');
    expect(peticion.request.body).toEqual({ motivo: 'Cese', confirmar: true });
    peticion.flush({ estado: 'FINALIZADO', asignaciones_revocadas: ['a-cajero', 'a-mozo'] });
    await estable();

    esperar('/seg/miembros/m-pedro').flush(pedro('FINALIZADO', []));
    await estable();
    expect(avisos.toast).toHaveBeenCalledWith('exito', CONFIRMACIONES.finalizar.hecho);
    expect(elemento().querySelector('[data-estado-membresia]')?.textContent?.trim()).toBe('Finalizado');
  });

  it('TR-CA-040: PROPIETARIO_UNICO muestra «El tenant debe tener al menos un propietario activo»', async () => {
    await abrir(pedro('ACTIVO'));
    await pulsar(MENSAJES_DETALLE.suspender);

    esperar('/seg/membresias/m-pedro/suspender').flush(
      { codigo: 'PROPIETARIO_UNICO', mensaje: 'El tenant debe tener al menos un propietario activo' },
      { status: 409, statusText: 'Conflict' },
    );
    await estable();

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe('El tenant debe tener al menos un propietario activo');
  });

  it('suspender pasa a SUSPENDIDO y reactivar vuelve a ACTIVO, cada uno con motivo', async () => {
    await abrir(pedro('ACTIVO'));
    await pulsar(MENSAJES_DETALLE.suspender);
    esperar('/seg/membresias/m-pedro/suspender').flush({ estado: 'SUSPENDIDO' });
    await estable();
    esperar('/seg/miembros/m-pedro').flush(pedro('SUSPENDIDO'));
    await estable();
    expect(elemento().querySelector('[data-estado-membresia]')?.textContent?.trim()).toBe('Suspendido');

    await pulsar(MENSAJES_DETALLE.reactivar);
    expect(esperar('/seg/membresias/m-pedro/reactivar').request.body).toEqual({ motivo: 'Cese', confirmar: true });
  });

  it('revocar «Cajero» envía solo esa asignación y recarga el detalle con las demás intactas', async () => {
    await abrir(pedro('ACTIVO'));
    const filaCajero = elemento().querySelector('[data-asignacion=a-cajero]');
    if (!filaCajero) throw new Error('No hay fila de Cajero');
    await pulsar(MENSAJES_DETALLE.revocar, filaCajero);

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith(expect.objectContaining({ titulo: CONFIRMACIONES.revocar.titulo('Cajero') }));
    esperar('/seg/asignaciones/a-cajero/revocar').flush({ revocada_en: '2026-10-28T15:00:00.000Z' });
    await estable();
    esperar('/seg/miembros/m-pedro').flush(pedro('ACTIVO', [asignacion('a-cajero', 'REVOCADA', 'Cajero'), asignacion('a-mozo', 'VIGENTE', 'Mozo')]));
    await estable();

    expect(elemento().querySelector('[data-asignacion=a-mozo]')?.textContent).toContain(MENSAJES_DETALLE.revocar);
    expect(elemento().querySelector('[data-asignacion=a-cajero]')?.textContent).not.toContain(MENSAJES_DETALLE.revocar);
  });

  it('cancelar la confirmación no envía nada', async () => {
    avisos.confirmarDestructiva.mockResolvedValueOnce({ confirmado: false });
    await abrir(pedro('ACTIVO'));
    await pulsar(MENSAJES_DETALLE.suspender);

    expect(url()).toBe(RUTA_PEDRO);
  });

  it('sin MFA vigente no abre la confirmación ni el formulario y lleva a /auth/mfa', async () => {
    sesion.contexto.set({ permisos: TODOS_LOS_PERMISOS, mfaVigente: false });
    await abrir(pedro('ACTIVO'));
    await pulsar(MENSAJES_DETALLE.suspender);

    expect(avisos.confirmarDestructiva).not.toHaveBeenCalled();
    expect(url()).toBe(`${RUTA_MFA}?returnUrl=${encodeURIComponent(RUTA_PEDRO)}`);
  });

  it('asignar con MFA vigente abre el formulario de asignación', async () => {
    await abrir(pedro('ACTIVO'));
    await pulsar(MENSAJES_DETALLE.asignar);

    expect(url()).toBe(`${RUTA_PEDRO}/asignar`);
  });

  it('reenviar invitación lleva a invitar con nombre y correo en el state, no en la URL', async () => {
    await abrir(pedro('FINALIZADO', []));
    await pulsar(MENSAJES_DETALLE.reenviarInvitacion);

    expect(url()).toBe('/admin/usuarios/invitar');
    expect(TestBed.inject(Location).getState()).toMatchObject({ reenviar: { nombre: 'Pedro Salazar', correo: 'pedro.salazar@outlook.com' } });
  });

  it('una membresía que no existe muestra el mensaje de la API', async () => {
    await abrir({ codigo: 'NO_ENCONTRADO', mensaje: 'La membresía no existe' }, { status: 404, statusText: 'Not Found' });

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe('La membresía no existe');
    expect(elemento().querySelector('h1')).toBeNull();
  });
});
