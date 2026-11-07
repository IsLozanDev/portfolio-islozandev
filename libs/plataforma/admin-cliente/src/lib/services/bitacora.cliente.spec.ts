import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { OMITIR_AVISO_ERROR } from '@vitrina/shared/auth';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorAdmin } from '../models/error-admin';
import { BitacoraCliente } from './bitacora.cliente';

const URL_EXPORTAR = `${API_URL}/seg/bitacora/exportar`;
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('BitacoraCliente.exportar (spec 18b)', () => {
  let http: HttpTestingController;
  let cliente: BitacoraCliente;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(BitacoraCliente);
  });

  afterEach(() => http.verify());

  it('pide el XLSX con los filtros, sin página ni aviso global, y toma el nombre de Content-Disposition', async () => {
    const exportacion = cliente.exportar({ desde: '2026-10-27', hasta: '2026-11-02', tipo: 'LOGIN_FALLIDO', usuario: 'ana' });
    const peticion = http.expectOne((solicitud) => solicitud.url === URL_EXPORTAR);

    expect(peticion.request.responseType).toBe('blob');
    expect(peticion.request.params.keys().sort()).toEqual(['desde', 'hasta', 'tipo', 'usuario']);
    expect(peticion.request.context.get(OMITIR_AVISO_ERROR)).toBe(true);
    peticion.flush(new Blob(['xlsx'], { type: TIPO_XLSX }), {
      headers: { 'Content-Disposition': 'attachment; filename="bitacora-20261027-20261102.xlsx"' },
    });

    const { archivo, nombre } = await exportacion;
    expect(nombre).toBe('bitacora-20261027-20261102.xlsx');
    expect(archivo.size).toBe('xlsx'.length);
  });

  it('el error llega como Blob y sale como ErrorAdmin con el código y el mensaje de la API', async () => {
    const exportacion = cliente.exportar({ desde: '2026-10-27', hasta: '2026-11-02' }).catch((error: unknown) => error);
    const cuerpo = { codigo: 'EXPORTACION_DEMASIADO_GRANDE', mensaje: 'La exportación tiene 10 001 filas; el máximo es 10 000. Acote el rango o los filtros' };
    http.expectOne((solicitud) => solicitud.url === URL_EXPORTAR).flush(new Blob([JSON.stringify(cuerpo)], { type: 'application/json' }), {
      status: 422,
      statusText: 'Unprocessable Entity',
    });

    const error = await exportacion;
    expect(error).toBeInstanceOf(ErrorAdmin);
    expect(error).toMatchObject({ codigo: 'EXPORTACION_DEMASIADO_GRANDE', message: cuerpo.mensaje, estado: 422 });
  });
});
