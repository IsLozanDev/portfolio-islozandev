import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { DETALLE_DE_PRUEBA, PERSONA_DE_PRUEBA } from '../../testing/persona-de-prueba';
import { ContactosCliente } from './contactos.cliente';

const URL_CONTACTOS = `${API_URL}/personas/${PERSONA_DE_PRUEBA}/contactos`;

describe('ContactosCliente', () => {
  let cliente: ContactosCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(ContactosCliente);
  });

  afterEach(() => http.verify());

  it('agregar hace POST con el contacto y devuelve la persona con su versión', async () => {
    const promesa = cliente.agregar(PERSONA_DE_PRUEBA, { tipo: 'CELULAR', valor: '956778120', principal: false });
    const peticion = http.expectOne({ method: 'POST', url: URL_CONTACTOS });
    expect(peticion.request.body).toEqual({ tipo: 'CELULAR', valor: '956778120', principal: false });
    peticion.flush(DETALLE_DE_PRUEBA);

    expect((await promesa).version).toBe(DETALLE_DE_PRUEBA.version);
  });

  it('editar manda solo lo que cambia, con la versión', async () => {
    const promesa = cliente.editar(PERSONA_DE_PRUEBA, 'c2', { version: 5, principal: true });
    const peticion = http.expectOne({ method: 'PATCH', url: `${URL_CONTACTOS}/c2` });
    expect(peticion.request.body).toEqual({ version: 5, principal: true });
    peticion.flush({ ...DETALLE_DE_PRUEBA, version: 6 });

    expect((await promesa).version).toBe(6);
  });

  it('eliminar hace DELETE con ?version= y acepta el 204', async () => {
    const promesa = cliente.eliminar(PERSONA_DE_PRUEBA, 'c2', 6);
    http.expectOne({ method: 'DELETE', url: `${URL_CONTACTOS}/c2?version=6` }).flush(null, { status: 204, statusText: 'No Content' });

    await expect(promesa).resolves.toBeUndefined();
  });
});
