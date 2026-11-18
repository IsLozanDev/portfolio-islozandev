import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorAdmin } from '../models/error-admin';
import { CuotaActualCliente } from './cuota-actual.cliente';

describe('CuotaActualCliente', () => {
  let cliente: CuotaActualCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(CuotaActualCliente);
  });

  afterEach(() => http.verify());

  it('obtener pide GET /identidad/cuota-actual y mapea a camelCase', async () => {
    const promesa = cliente.obtener();
    http
      .expectOne({ method: 'GET', url: `${API_URL}/identidad/cuota-actual` })
      .flush({ periodo: '2026-11', plan: 'BASICO', incluidas: 500, consumidas: 120, porcentaje: 24, umbral_aviso: 80 });

    expect(await promesa).toEqual({ periodo: '2026-11', plan: 'BASICO', incluidas: 500, consumidas: 120, porcentaje: 24, umbralAviso: 80 });
  });

  it('un error sale como ErrorAdmin', async () => {
    const promesa = cliente.obtener();
    http.expectOne(`${API_URL}/identidad/cuota-actual`).flush({ codigo: 'X', mensaje: 'x' }, { status: 500, statusText: 'Server Error' });

    expect(await promesa.catch((causa: unknown) => causa)).toBeInstanceOf(ErrorAdmin);
  });
});
