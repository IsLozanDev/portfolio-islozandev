import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { MembresiasCliente, type AccionMembresia } from './membresias.cliente';

describe('MembresiasCliente', () => {
  let cliente: MembresiasCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(MembresiasCliente);
  });

  afterEach(() => http.verify());

  it.each<[AccionMembresia, string]>([
    ['suspender', 'SUSPENDIDO'],
    ['reactivar', 'ACTIVO'],
    ['finalizar', 'FINALIZADO'],
  ])('%s envía POST /seg/membresias/{id}/%s con motivo y confirmar', async (accion, estado) => {
    const respuesta = cliente.ejecutar(accion, 'm-pedro', 'Cese');

    const peticion = http.expectOne(`${API_URL}/seg/membresias/m-pedro/${accion}`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ motivo: 'Cese', confirmar: true });
    peticion.flush({ estado });

    await expect(respuesta).resolves.toBe(estado);
  });

  it('PROPIETARIO_UNICO da el mensaje de la API (TR-CA-040)', async () => {
    const respuesta = cliente.ejecutar('suspender', 'm-ana', 'Vacaciones');

    http
      .expectOne(`${API_URL}/seg/membresias/m-ana/suspender`)
      .flush({ codigo: 'PROPIETARIO_UNICO', mensaje: 'El tenant debe tener al menos un propietario activo' }, { status: 409, statusText: 'Conflict' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'PROPIETARIO_UNICO', message: 'El tenant debe tener al menos un propietario activo' });
  });
});
