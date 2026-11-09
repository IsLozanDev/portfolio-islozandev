import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { fiestasPatrias } from '../../testing/feriados-de-prueba';
import { prepararHttpDePrueba, URL_FERIADOS } from '../../testing/http-de-prueba';
import { ErrorFeriados } from '../models/error-feriados';
import { FeriadosCliente } from './feriados.cliente';

describe('FeriadosCliente', () => {
  let http: HttpTestingController;
  let cliente: FeriadosCliente;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(FeriadosCliente);
  });

  afterEach(() => http.verify());

  it('lista la página con los filtros que vienen y la pasa a camelCase', async () => {
    const promesa = cliente.listar({ anio: 2027, alcance: 'GLOBAL', pagina: 2, tamano: 50 });
    const pedido = http.expectOne((solicitud) => solicitud.url === URL_FERIADOS);
    expect(pedido.request.urlWithParams).toBe(`${URL_FERIADOS}?anio=2027&alcance=GLOBAL&pagina=2&tamano=50`);
    pedido.flush({ items: [fiestasPatrias], total: 21, pagina: 2, tamano: 50 });

    expect(await promesa).toEqual({
      items: [
        {
          id: fiestasPatrias.id,
          alcance: 'GLOBAL',
          sucursalId: null,
          fecha: '2026-07-28',
          fechaEnAnio: '2027-07-28',
          nombre: 'Fiestas Patrias',
          recurrenteAnual: true,
          version: 0,
          editable: true,
        },
      ],
      total: 21,
    });
  });

  it('actualizar devuelve si hubo cambios y borrar manda la versión', async () => {
    const actualizado = cliente.actualizar('f-1', { fecha: '2026-07-28', nombre: 'Fiestas Patrias', recurrenteAnual: true }, 3);
    http.expectOne({ method: 'PUT', url: `${URL_FERIADOS}/f-1` }).flush({ cambiado: false });
    expect(await actualizado).toBe(false);

    const borrado = cliente.eliminar('f-1', 3);
    http.expectOne({ method: 'DELETE', url: `${URL_FERIADOS}/f-1?version=3` }).flush(null);
    await borrado;
  });

  it('un error de la API sale como ErrorFeriados con su campo', async () => {
    const promesa = cliente.crear({ alcance: 'TENANT', sucursalId: null, fecha: '2026-10-08', nombre: 'Angamos', recurrenteAnual: false });
    http
      .expectOne({ method: 'POST', url: URL_FERIADOS })
      .flush({ codigo: 'FERIADO_DUPLICADO', mensaje: 'La fecha ya está registrada como feriado' }, { status: 409, statusText: 'Conflict' });

    const error = await promesa.catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(ErrorFeriados);
    expect(error).toMatchObject({ codigo: 'FERIADO_DUPLICADO', campo: 'fecha', estado: 409 });
  });
});
