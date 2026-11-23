import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { DETALLE_DE_PRUEBA, PERSONA_DE_PRUEBA } from '../../testing/persona-de-prueba';
import { DireccionesCliente } from './direcciones.cliente';

const URL_DIRECCIONES = `${API_URL}/personas/${PERSONA_DE_PRUEBA}/direcciones`;

describe('DireccionesCliente', () => {
  let cliente: DireccionesCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(DireccionesCliente);
  });

  afterEach(() => http.verify());

  it('TR-CA-105: agregar hace POST con dirección, ubigeo y principal', async () => {
    const promesa = cliente.agregar(PERSONA_DE_PRUEBA, { direccion: 'Av. Ejército 710', referencia: null, ubigeo: '040103', principal: true });
    const peticion = http.expectOne({ method: 'POST', url: URL_DIRECCIONES });
    expect(peticion.request.body).toEqual({ direccion: 'Av. Ejército 710', referencia: null, ubigeo: '040103', principal: true });
    peticion.flush(DETALLE_DE_PRUEBA);

    await promesa;
  });

  it('editar conserva un null explícito (borrar la referencia) y quita lo no enviado', async () => {
    const promesa = cliente.editar(PERSONA_DE_PRUEBA, 'd1', { version: 5, referencia: null, ubigeo: undefined });
    const peticion = http.expectOne({ method: 'PATCH', url: `${URL_DIRECCIONES}/d1` });
    expect(peticion.request.body).toEqual({ version: 5, referencia: null });
    peticion.flush(DETALLE_DE_PRUEBA);

    await promesa;
  });

  it('eliminar hace DELETE con ?version=', async () => {
    const promesa = cliente.eliminar(PERSONA_DE_PRUEBA, 'd1', 5);
    http.expectOne({ method: 'DELETE', url: `${URL_DIRECCIONES}/d1?version=5` }).flush(null, { status: 204, statusText: 'No Content' });

    await expect(promesa).resolves.toBeUndefined();
  });
});
