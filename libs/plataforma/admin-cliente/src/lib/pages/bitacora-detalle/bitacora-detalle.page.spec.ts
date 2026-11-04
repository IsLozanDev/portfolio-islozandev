import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { BitacoraDetallePage } from './bitacora-detalle.page';

@Component({ selector: 'vit-destino-detalle-bitacora', template: '' })
class Destino {}

describe('BitacoraDetallePage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  const elemento = () => harness.routeNativeElement as HTMLElement;

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(eventoId: string, respuesta: object, estado = 200): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/bitacora/:eventoId', component: BitacoraDetallePage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: new DobleSesion().conPermisos(PERMISOS_ADMIN.seguridadBitacora) },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(`/admin/bitacora/${eventoId}`);
    await estable();
    http.expectOne(`${API_URL}/seg/bitacora/${eventoId}`).flush(respuesta, { status: estado, statusText: estado === 200 ? 'OK' : 'Not Found' });
    await estable();
  }

  afterEach(() => http.verify());

  it('muestra tipo, fecha, usuario, IP y los datos del evento como texto plano', async () => {
    await abrir('1042', {
      id: '1042',
      tipo: 'ACCESO_SOPORTE',
      ocurrido_en: '2026-10-30T15:00:00.000Z',
      usuario: { id: 'u-javier', nombre: 'Javier Paredes', correo: 'javier.paredes@vitrina.pe' },
      resumen: 'SOP-000245',
      ip: '10.0.0.7',
      detalle: { accion: 'PETICION', ticket: 'SOP-000245', ruta: '<b>/seg/miembros</b>', horas: 2 },
    });

    expect(elemento().querySelector('[data-tipo-evento]')?.textContent).toContain('Acceso de soporte');
    expect(elemento().querySelector('[data-dato="usuario"]')?.textContent).toContain('Javier Paredes');
    expect(elemento().querySelector('[data-dato="ip"]')?.textContent?.trim()).toBe('10.0.0.7');
    expect(elemento().querySelector('[data-dato="accion"]')?.textContent?.trim()).toBe('PETICION');
    expect(elemento().querySelector('[data-dato="horas"]')?.textContent?.trim()).toBe('2');
    // El texto de la API no se interpreta como HTML.
    expect(elemento().querySelector('[data-dato="ruta"]')?.textContent?.trim()).toBe('<b>/seg/miembros</b>');
    expect(elemento().querySelector('[data-dato="ruta"] b')).toBeNull();
  });

  it('una asignación muestra a quién se le dio y qué rol, con nombre', async () => {
    await abrir('51', {
      id: '51',
      tipo: 'ASIGNACION_OTORGADA',
      ocurrido_en: '2026-10-30T15:00:00.000Z',
      usuario: { id: 'u-ana', nombre: 'Ana Torres', correo: 'ana.torres@polleria.pe' },
      resumen: 'Cajero → Luis Quispe',
      ip: '190.42.10.8',
      destinatario: { id: 'u-luis', nombre: 'Luis Quispe', correo: 'luis.quispe@polleria.pe' },
      asignado: { tipo: 'ROL', nombre: 'Cajero' },
      detalle: { asignacion_id: 'a-1', usuario_destino: 'u-luis', alcance: 'SUCURSAL' },
    });

    expect(elemento().querySelector('[data-dato="usuario"]')?.textContent).toContain('Ana Torres');
    expect(elemento().querySelector('[data-dato="destinatario"]')?.textContent).toContain('Luis Quispe');
    expect(elemento().querySelector('[data-dato="asignado"]')?.textContent?.trim()).toBe('Cajero');
    expect(elemento().textContent).toContain('Rol');
  });

  it('un evento del sistema dice «Sistema» y sin IP «—»', async () => {
    await abrir('7', { id: '7', tipo: 'ACCESO_SOPORTE', ocurrido_en: '2026-10-30T15:00:00.000Z', usuario: null, resumen: null, ip: null, detalle: {} });

    expect(elemento().querySelector('[data-dato="usuario"]')?.textContent?.trim()).toBe('Sistema');
    expect(elemento().querySelector('[data-dato="ip"]')?.textContent?.trim()).toBe('—');
    expect(elemento().textContent).toContain('El evento no trae más datos.');
  });

  it('un evento de otro tenant muestra el 404 de la API', async () => {
    await abrir('9', { codigo: 'NO_ENCONTRADO', mensaje: 'El evento no existe' }, 404);
    expect(elemento().querySelector('[role="alert"]')?.textContent).toContain('El evento no existe');
  });

  it('un ingreso fallido por bloqueo muestra etapa, el motivo como chip de advertencia, el bloqueo, el correo y el navegador (spec 18b)', async () => {
    await abrir('1044', {
      id: '1044',
      tipo: 'LOGIN_FALLIDO',
      ocurrido_en: '2026-11-02T20:30:00.000Z',
      usuario: null,
      resumen: 'BLOQUEO_INGRESO',
      ip: '190.42.10.8',
      detalle: { etapa: 'CLAVE', motivo: 'BLOQUEO_INGRESO', alcance: 'IP', hasta: '2026-11-02T20:45:00.000Z', correo: 'na****@gmail.com', agente: 'Firefox/140' },
    });

    const legible = (clave: string) => elemento().querySelector(`[data-legible="${clave}"]`);
    expect(elemento().querySelector('[data-seccion="legibles"] h2')?.textContent).toContain('Ingreso');
    expect(legible('etapa')?.textContent).toContain('Contraseña');
    expect(legible('motivo')?.querySelector('vit-chip-estado')?.textContent).toContain('Bloqueo por intentos fallidos');
    expect(legible('motivo')?.querySelector('vit-chip-estado span')?.classList).toContain('bg-chip-advertencia');
    expect(legible('alcance')?.textContent).toContain('IP');
    expect(legible('hasta')?.textContent).toContain('3:45');
    expect(legible('correo')?.textContent).toContain('na****@gmail.com');
    expect(legible('agente')?.textContent).toContain('Firefox/140');
  });

  it('un evento de otro tipo no tiene la sección legible', async () => {
    await abrir('1042', { id: '1042', tipo: 'ACCESO_DENEGADO', ocurrido_en: '2026-10-30T15:00:00.000Z', usuario: null, resumen: 'x', ip: null, detalle: { permiso: 'x' } });
    expect(elemento().querySelector('[data-seccion="legibles"]')).toBeNull();
  });
});
