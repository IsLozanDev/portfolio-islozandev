import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_AUDITORIA } from '../../models/mensajes-auditoria';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { ESTADO_RETORNO_AUDITORIA } from '../../utils/filtro-url-auditoria';
import { AuditoriaDetallePage } from './auditoria-detalle.page';

const URL_EVENTOS = `${API_URL}/aud/eventos`;
const LISTA_FILTRADA = '/admin/auditoria?desde=2026-10-01&hasta=2026-10-31&usuario=rosa';

const ANULACION = {
  id: 'e-1',
  numero: '18377',
  tipo: 'OPERACION',
  accion: 'rest.venta.anular',
  entidad_tipo: 'venta',
  entidad_id: 'V-000981',
  usuario: { id: 'u-rosa', nombre: 'Rosa Quispe', correo: 'rosa.quispe@ejemplo.pe' },
  sucursal: { id: 's-mir', codigo: 'MIR', nombre: 'Miraflores' },
  motivo: 'Cliente desistió de la compra',
  finalidad: null,
  ticket: null,
  persona_titular_id: null,
  ip: '190.235.41.18',
  ocurrido_en: '2026-10-31T23:42:10Z',
  antes: { estado: 'EMITIDA', total_cobrado: 86.5 },
  despues: { estado: 'ANULADA', total_cobrado: 0, motivo_anulacion: 'Cliente desistió de la compra' },
  cambios: [
    { campo: 'estado', antes: 'EMITIDA', despues: 'ANULADA' },
    { campo: 'motivo_anulacion', antes: null, despues: '<b>Cliente desistió</b>' },
    { campo: 'total_cobrado', antes: 86.5, despues: 0 },
  ],
  trace_id: '3b9e1f0c7a5d4e2b',
  event_id: '0193f2a8-6c41-7d2e-9b5a-4e8c1d7f3a20',
  hash_anterior: '4f1c'.repeat(16),
  hash: 'a83e'.repeat(16),
};
const ACCESO_SOPORTE = {
  ...ANULACION,
  id: 'e-2',
  tipo: 'ACCESO_SENSIBLE',
  accion: 'aud.dato_sensible.acceder',
  entidad_tipo: 'EXPEDIENTE',
  entidad_id: 'EXP-2291',
  usuario: null,
  sucursal: null,
  motivo: null,
  finalidad: 'SOPORTE',
  ticket: 'SOP-000245',
  persona_titular_id: 'p-1',
  ip: null,
  antes: null,
  despues: null,
  cambios: [],
  trace_id: null,
  event_id: null,
};

@Component({ selector: 'vit-destino-detalle-auditoria', template: '' })
class Destino {}

@Component({ selector: 'vit-lista-de-prueba', template: '' })
class ListaDePrueba {}

describe('AuditoriaDetallePage (spec 20c)', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const dato = (clave: string) => elemento().querySelector(`[data-dato="${clave}"]`)?.textContent?.replace(/\s+/g, ' ').trim();

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  function configurar(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'admin/auditoria', component: ListaDePrueba },
          { path: 'admin/auditoria/:eventoId', component: AuditoriaDetallePage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: new DobleSesion().conPermisos(PERMISOS_ADMIN.auditoriaConsultar) },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  async function responder(eventoId: string, respuesta: object, estado = 200): Promise<void> {
    await estable();
    http.expectOne(`${URL_EVENTOS}/${eventoId}`).flush(respuesta, { status: estado, statusText: estado === 200 ? 'OK' : 'Not Found' });
    await estable();
  }

  async function abrir(eventoId: string, respuesta: object, estado = 200): Promise<void> {
    configurar();
    harness = await RouterTestingHarness.create(`/admin/auditoria/${eventoId}`);
    await responder(eventoId, respuesta, estado);
  }

  afterEach(() => http.verify());

  it('muestra tipo, acción, fecha, usuario, sucursal, entidad, motivo e IP', async () => {
    await abrir('e-1', ANULACION);

    expect(elemento().querySelector('h1')?.textContent).toContain(MENSAJES_AUDITORIA.tituloDetalle);
    expect(elemento().querySelector('[data-tipo-evento]')?.textContent).toContain('Operación');
    expect(dato('accion')).toBe('rest.venta.anular');
    expect(dato('usuario')).toBe('Rosa Quispe · rosa.quispe@ejemplo.pe');
    expect(dato('sucursal')).toBe('MIR · Miraflores');
    expect(dato('entidad')).toBe('venta · V-000981');
    expect(dato('motivo')).toBe('Cliente desistió de la compra');
    expect(dato('ip')).toBe('190.235.41.18');
    expect(dato('finalidad')).toBeUndefined();
    expect(dato('ticket')).toBeUndefined();
  });

  it('un acceso de soporte sin usuario ni sucursal muestra Sistema, Todo el tenant, finalidad, ticket y titular', async () => {
    await abrir('e-2', ACCESO_SOPORTE);

    expect(elemento().querySelector('[data-tipo-evento]')?.textContent).toContain('Acceso sensible');
    expect(dato('usuario')).toBe(MENSAJES_AUDITORIA.sistema);
    expect(dato('sucursal')).toBe(MENSAJES_AUDITORIA.todoElTenant);
    expect(dato('finalidad')).toBe('Soporte');
    expect(dato('ticket')).toBe('SOP-000245');
    expect(dato('titular')).toBe('p-1');
    expect(dato('motivo')).toBeUndefined();
    expect(dato('ip')).toBeUndefined();
  });

  it('la tabla de cambios muestra campo, antes y después como texto, con «—» si falta un lado', async () => {
    await abrir('e-1', ANULACION);

    const filas = [...elemento().querySelectorAll('[data-cambios="tabla"] tbody tr')].map((fila) =>
      [...fila.querySelectorAll('td')].map((celda) => celda.textContent?.trim()),
    );
    expect(filas).toEqual([
      ['estado', 'EMITIDA', 'ANULADA'],
      ['motivo_anulacion', '—', '<b>Cliente desistió</b>'],
      ['total_cobrado', '86.5', '0'],
    ]);
    expect(elemento().querySelector('[data-cambios="tabla"] b')).toBeNull();
    expect(elemento().querySelector('[data-lado="despues"]')?.classList).toContain('bg-chip-exito');
    expect(elemento().querySelectorAll('[data-cambios="tarjetas"] li')).toHaveLength(3);
    expect(elemento().querySelector('[data-nota="recortados"]')).toBeNull();
  });

  it('sin cambios lo dice; con 200 avisa que pueden faltar', async () => {
    await abrir('e-2', ACCESO_SOPORTE);
    expect(elemento().querySelector('[data-seccion="cambios"]')?.textContent).toContain(MENSAJES_AUDITORIA.sinCambios);

    TestBed.resetTestingModule();
    const doscientos = Array.from({ length: 200 }, (_valor, indice) => ({ campo: `items[${indice}].monto`, antes: 1, despues: 2 }));
    await abrir('e-1', { ...ANULACION, cambios: doscientos });
    expect(elemento().querySelector('[data-nota="recortados"]')?.textContent).toContain(MENSAJES_AUDITORIA.cambiosRecortados);
  });

  it('el JSON completo empieza cerrado y al abrirlo muestra antes y después', async () => {
    await abrir('e-1', ANULACION);
    expect(elemento().querySelector('[data-json]')).toBeNull();

    elemento().querySelector<HTMLElement>('[data-seccion="json"] mat-expansion-panel-header')?.click();
    await estable();

    expect(JSON.parse(elemento().querySelector('[data-json="antes"]')?.textContent ?? '')).toEqual(ANULACION.antes);
    expect(JSON.parse(elemento().querySelector('[data-json="despues"]')?.textContent ?? '')).toEqual(ANULACION.despues);
  });

  it('los datos técnicos traen número, hashes, trace_id y event_id; sin ellos, «—»', async () => {
    await abrir('e-1', ANULACION);
    expect(dato('numero')).toBe('18377');
    expect(dato('hash-anterior')).toBe(ANULACION.hash_anterior);
    expect(dato('hash')).toBe(ANULACION.hash);
    expect(dato('trace-id')).toBe('3b9e1f0c7a5d4e2b');
    expect(dato('event-id')).toBe(ANULACION.event_id);

    TestBed.resetTestingModule();
    await abrir('e-2', ACCESO_SOPORTE);
    expect(dato('trace-id')).toBe('—');
  });

  it('un 404 dice que el evento no existe o está fuera de alcance', async () => {
    await abrir('e-9', { codigo: 'EVENTO_NO_ENCONTRADO', mensaje: 'El evento no existe' }, 404);
    expect(elemento().querySelector('[role="alert"]')?.textContent).toContain(MENSAJES_AUDITORIA.eventoNoEncontrado);
    expect(elemento().querySelector('h1')).toBeNull();
  });

  it('«Volver» regresa a la lista con los filtros con que se entró', async () => {
    configurar();
    harness = await RouterTestingHarness.create(LISTA_FILTRADA);
    await TestBed.inject(Router).navigateByUrl('/admin/auditoria/e-1', { state: { [ESTADO_RETORNO_AUDITORIA]: LISTA_FILTRADA } });
    await responder('e-1', ANULACION);

    expect(elemento().querySelector('[data-accion="volver"]')?.getAttribute('href')).toBe(LISTA_FILTRADA);
  });

  it('«Volver» por enlace directo va a la lista sola', async () => {
    await abrir('e-1', ANULACION);
    expect(elemento().querySelector('[data-accion="volver"]')?.getAttribute('href')).toBe('/admin/auditoria');
  });

  it('«Volver» con una URL ajena en el state la ignora y va a la lista sola', async () => {
    configurar();
    harness = await RouterTestingHarness.create(LISTA_FILTRADA);
    await TestBed.inject(Router).navigateByUrl('/admin/auditoria/e-1', { state: { [ESTADO_RETORNO_AUDITORIA]: '/admin/usuarios?x=1' } });
    await responder('e-1', ANULACION);

    expect(elemento().querySelector('[data-accion="volver"]')?.getAttribute('href')).toBe('/admin/auditoria');
  });
});
