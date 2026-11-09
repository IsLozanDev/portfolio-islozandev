import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { SolicitudItem } from '@vitrina/plataforma/catalogos-ui';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ItemsCliente } from './items.cliente';

const YAPE_ID = '0193f3a0-0000-7000-8000-00000000d002';
const YAPE = {
  id: YAPE_ID,
  codigo: 'YAPE',
  codigo_externo: null,
  nombre: 'Yape',
  abreviatura: null,
  orden: 2,
  atributos: { mascara: '999 999 999' },
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
  activo: true,
  version: 3,
};
const SOLICITUD: SolicitudItem = {
  codigo: 'YAPE',
  codigoExterno: null,
  nombre: 'Yape',
  abreviatura: null,
  orden: null,
  atributos: {},
  vigenteDesde: '2026-01-01',
  vigenteHasta: null,
  activo: true,
};

describe('ItemsCliente', () => {
  let cliente: ItemsCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(ItemsCliente);
  });

  afterEach(() => http.verify());

  it('listarAdministracion pide origen=GLOBAL siempre, con texto, estado y página', async () => {
    const promesa = cliente.listarAdministracion('MEDIO_PAGO', { texto: 'ya', estado: 'VISIBLE', pagina: 2, tamano: 20 });
    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/catalogos/MEDIO_PAGO/items/administracion`);
    expect(peticion.request.params.toString()).toBe('origen=GLOBAL&pagina=2&tamano=20&texto=ya&estado=VISIBLE');
    peticion.flush({ items: [{ ...YAPE, id: undefined, item_id: YAPE_ID, propio: false, estado: 'VISIBLE', ajuste: null }], total: 21, pagina: 2, tamano: 20 });

    expect(await promesa).toEqual({
      items: [
        {
          itemId: YAPE_ID,
          codigo: 'YAPE',
          codigoExterno: null,
          nombre: 'Yape',
          abreviatura: null,
          orden: 2,
          atributos: { mascara: '999 999 999' },
          vigenteDesde: '2026-01-01',
          vigenteHasta: null,
          activo: true,
          estado: 'VISIBLE',
          version: 3,
        },
      ],
      total: 21,
    });
  });

  it('obtener pide GET items-globales/{id} y trae versión y atributos', async () => {
    const promesa = cliente.obtener('MEDIO_PAGO', YAPE_ID);
    http.expectOne({ method: 'GET', url: `${API_URL}/catalogos/MEDIO_PAGO/items-globales/${YAPE_ID}` }).flush(YAPE);

    expect(await promesa).toMatchObject({ id: YAPE_ID, version: 3, atributos: { mascara: '999 999 999' }, vigenteDesde: '2026-01-01' });
  });

  it('crear envía el código y omite orden si viene vacío', async () => {
    const promesa = cliente.crear('MEDIO_PAGO', SOLICITUD);
    const peticion = http.expectOne({ method: 'POST', url: `${API_URL}/catalogos/MEDIO_PAGO/items-globales` });
    expect(peticion.request.body).toEqual({
      codigo: 'YAPE',
      codigo_externo: null,
      nombre: 'Yape',
      abreviatura: null,
      atributos: {},
      vigente_desde: '2026-01-01',
      vigente_hasta: null,
      activo: true,
    });
    peticion.flush(YAPE);
    await promesa;
  });

  it('actualizar envía PUT con la versión y sin el código', async () => {
    const promesa = cliente.actualizar('MEDIO_PAGO', YAPE_ID, { ...SOLICITUD, orden: 5, vigenteHasta: '2026-11-08' }, 3);
    const peticion = http.expectOne({ method: 'PUT', url: `${API_URL}/catalogos/MEDIO_PAGO/items-globales/${YAPE_ID}` });
    expect(peticion.request.body).toEqual({
      codigo_externo: null,
      nombre: 'Yape',
      abreviatura: null,
      orden: 5,
      atributos: {},
      vigente_desde: '2026-01-01',
      vigente_hasta: '2026-11-08',
      activo: true,
      version: 3,
    });
    peticion.flush({ ...YAPE, version: 4, cambiado: true });
    expect(await promesa).toMatchObject({ version: 4 });
  });

  it('eliminar envía DELETE con la versión en la query', async () => {
    const promesa = cliente.eliminar('MEDIO_PAGO', YAPE_ID, 3);
    http.expectOne({ method: 'DELETE', url: `${API_URL}/catalogos/MEDIO_PAGO/items-globales/${YAPE_ID}?version=3` }).flush(null, { status: 204, statusText: 'No Content' });
    await promesa;
  });

  it('ITEM_REFERENCIADO sale como ErrorCatalogos sin campo (TR-CA-061)', async () => {
    const promesa = cliente.eliminar('MEDIO_PAGO', YAPE_ID, 3);
    http
      .expectOne(`${API_URL}/catalogos/MEDIO_PAGO/items-globales/${YAPE_ID}?version=3`)
      .flush({ codigo: 'ITEM_REFERENCIADO', mensaje: 'El ítem está en uso; cierre su vigencia o inactívelo' }, { status: 409, statusText: 'Conflict' });

    expect(await promesa.catch((causa: unknown) => causa)).toMatchObject({ codigo: 'ITEM_REFERENCIADO', estado: 409, campo: null });
  });
});
