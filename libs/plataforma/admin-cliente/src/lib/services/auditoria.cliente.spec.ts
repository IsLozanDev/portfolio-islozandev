import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OMITIR_AVISO_ERROR } from '@vitrina/shared/auth';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorAdmin } from '../models/error-admin';
import { AuditoriaCliente } from './auditoria.cliente';

const URL_EVENTOS = `${API_URL}/aud/eventos`;
const URL_EXPORTAR = `${URL_EVENTOS}/exportar`;
const URL_INTEGRIDAD = `${API_URL}/aud/integridad`;
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const RANGO = { desde: '2026-10-01', hasta: '2026-10-31' };

describe('AuditoriaCliente (spec 20c)', () => {
  let http: HttpTestingController;
  let cliente: AuditoriaCliente;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(AuditoriaCliente);
  });

  afterEach(() => http.verify());

  it('lista con los filtros y los nombres de la API; lo vacío no viaja', async () => {
    const lista = cliente.listar({ ...RANGO, usuario: 'rosa', accion: 'rest.venta.anular', sucursalId: 's-1', entidadTipo: 'venta', pagina: 2, tamano: 50 });
    const peticion = http.expectOne((solicitud) => solicitud.url === URL_EVENTOS);

    expect(peticion.request.params.keys().sort()).toEqual(['accion', 'desde', 'entidad_tipo', 'hasta', 'pagina', 'sucursal_id', 'tamano', 'usuario']);
    expect(peticion.request.params.get('sucursal_id')).toBe('s-1');
    expect(peticion.request.params.get('pagina')).toBe('2');
    peticion.flush({ items: [{ id: 'e-1', entidad_tipo: 'venta', entidad_id: 'V-1', persona_titular_id: null, ocurrido_en: '2026-10-31T23:42:10Z' }], total: 1 });

    const { items, total } = await lista;
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ id: 'e-1', entidadTipo: 'venta', entidadId: 'V-1', ocurridoEn: new Date('2026-10-31T23:42:10Z') });
  });

  it('el detalle pide el evento por id', async () => {
    const detalle = cliente.detalle('e/1');
    http.expectOne(`${URL_EVENTOS}/e%2F1`).flush({ id: 'e/1', ocurrido_en: '2026-10-31T23:42:10Z', cambios: [], hash_anterior: 'a', hash: 'b', trace_id: null, event_id: null });
    expect(await detalle).toMatchObject({ id: 'e/1', cambios: [], hashAnterior: 'a', hash: 'b' });
  });

  it('exporta el XLSX sin página ni aviso global y toma el nombre de Content-Disposition', async () => {
    const exportacion = cliente.exportar({ ...RANGO, tipo: 'OPERACION' });
    const peticion = http.expectOne((solicitud) => solicitud.url === URL_EXPORTAR);

    expect(peticion.request.responseType).toBe('blob');
    expect(peticion.request.params.keys().sort()).toEqual(['desde', 'hasta', 'tipo']);
    expect(peticion.request.context.get(OMITIR_AVISO_ERROR)).toBe(true);
    peticion.flush(new Blob(['xlsx'], { type: TIPO_XLSX }), { headers: { 'Content-Disposition': 'attachment; filename="auditoria-20261001-20261031.xlsx"' } });

    const { archivo, nombre } = await exportacion;
    expect(nombre).toBe('auditoria-20261001-20261031.xlsx');
    expect(archivo.size).toBe('xlsx'.length);
  });

  it('sin Content-Disposition, el nombre sale del rango', async () => {
    const exportacion = cliente.exportar(RANGO);
    http.expectOne((solicitud) => solicitud.url === URL_EXPORTAR).flush(new Blob(['xlsx']));
    expect((await exportacion).nombre).toBe('auditoria-20261001-20261031.xlsx');
  });

  it('un 422 dentro de un Blob sale como ErrorAdmin con su código', async () => {
    const exportacion = cliente.exportar(RANGO).catch((error: unknown) => error);
    const cuerpo = { codigo: 'EXPORTACION_DEMASIADO_GRANDE', mensaje: 'La exportación tiene 10 001 filas; el máximo es 10 000.' };
    http
      .expectOne((solicitud) => solicitud.url === URL_EXPORTAR)
      .flush(new Blob([JSON.stringify(cuerpo)], { type: 'application/json' }), { status: 422, statusText: 'Unprocessable Entity' });

    expect(await exportacion).toMatchObject({ codigo: 'EXPORTACION_DEMASIADO_GRANDE', message: cuerpo.mensaje, estado: 422 });
  });

  it('la última verificación se mapea; con 404 SIN_VERIFICACIONES devuelve null', async () => {
    const verificada = cliente.ultimaVerificacion();
    http.expectOne(URL_INTEGRIDAD).flush({ estado: 'OK', modo: 'INCREMENTAL', hasta_numero: '18412', numero_roto: null, motivo: null, terminada_en: '2026-11-10T08:30:04Z' });
    expect(await verificada).toMatchObject({ estado: 'OK', hastaNumero: '18412' });

    const sinVerificar = cliente.ultimaVerificacion();
    http.expectOne(URL_INTEGRIDAD).flush({ codigo: 'SIN_VERIFICACIONES', mensaje: 'Sin verificaciones' }, { status: 404, statusText: 'Not Found' });
    expect(await sinVerificar).toBeNull();
  });

  it('la última verificación con 403 sale como error', async () => {
    const prohibida = cliente.ultimaVerificacion().catch((error: unknown) => error);
    http.expectOne(URL_INTEGRIDAD).flush({ codigo: 'SUCURSAL_FUERA_DE_ALCANCE', mensaje: 'Fuera de alcance' }, { status: 403, statusText: 'Forbidden' });

    const error = await prohibida;
    expect(error).toBeInstanceOf(ErrorAdmin);
    expect(error).toMatchObject({ codigo: 'SUCURSAL_FUERA_DE_ALCANCE', estado: 403 });
  });
});
