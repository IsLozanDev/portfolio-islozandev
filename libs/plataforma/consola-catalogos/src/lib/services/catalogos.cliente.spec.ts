import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorCatalogos } from '../models/error-catalogos';
import { CatalogosCliente } from './catalogos.cliente';

const MEDIO_PAGO = {
  id: 'c-1',
  codigo: 'MEDIO_PAGO',
  nombre: 'Medios de pago',
  alcance: 'MIXTO',
  fuente: null,
  editable_por_tenant: true,
  version: 1,
  importable: false,
};

describe('CatalogosCliente', () => {
  let cliente: CatalogosCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(CatalogosCliente);
  });

  afterEach(() => http.verify());

  it('listar pide GET /catalogos y mapea a camelCase con importable', async () => {
    const promesa = cliente.listar();
    http.expectOne({ method: 'GET', url: `${API_URL}/catalogos` }).flush([MEDIO_PAGO, { ...MEDIO_PAGO, codigo: 'UBIGEO', alcance: 'GLOBAL', importable: true }]);

    const lista = await promesa;
    expect(lista[0]).toEqual({ id: 'c-1', codigo: 'MEDIO_PAGO', nombre: 'Medios de pago', alcance: 'MIXTO', fuente: null, editablePorTenant: true, version: 1, importable: false });
    expect(lista[1]).toMatchObject({ codigo: 'UBIGEO', importable: true });
  });

  it('crear envía el cuerpo en snake_case (TR-CA-058)', async () => {
    const promesa = cliente.crear({ codigo: 'MEDIO_PAGO', nombre: 'Medios de pago', alcance: 'MIXTO', fuente: null, editablePorTenant: true });
    const peticion = http.expectOne({ method: 'POST', url: `${API_URL}/catalogos` });
    expect(peticion.request.body).toEqual({ codigo: 'MEDIO_PAGO', nombre: 'Medios de pago', alcance: 'MIXTO', fuente: null, editable_por_tenant: true });
    peticion.flush(MEDIO_PAGO);

    expect(await promesa).toMatchObject({ codigo: 'MEDIO_PAGO', version: 1 });
  });

  it('actualizar envía PUT sin codigo ni alcance, con la versión, y devuelve cambiado', async () => {
    const promesa = cliente.actualizar('MEDIO_PAGO', { nombre: 'Formas de pago', fuente: 'SUNAT', editablePorTenant: true }, 1);
    const peticion = http.expectOne({ method: 'PUT', url: `${API_URL}/catalogos/MEDIO_PAGO` });
    expect(peticion.request.body).toEqual({ nombre: 'Formas de pago', fuente: 'SUNAT', editable_por_tenant: true, version: 1 });
    peticion.flush({ ...MEDIO_PAGO, nombre: 'Formas de pago', version: 2, cambiado: true });

    expect(await promesa).toMatchObject({ nombre: 'Formas de pago', version: 2, cambiado: true });
  });

  it('CATALOGO_DUPLICADO sale como ErrorCatalogos con el campo codigo', async () => {
    const promesa = cliente.crear({ codigo: 'MEDIO_PAGO', nombre: 'Medios de pago', alcance: 'MIXTO', fuente: null, editablePorTenant: true });
    http
      .expectOne(`${API_URL}/catalogos`)
      .flush({ codigo: 'CATALOGO_DUPLICADO', mensaje: 'Ya existe un catálogo con ese código' }, { status: 409, statusText: 'Conflict' });

    const error = await promesa.catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(ErrorCatalogos);
    expect(error).toMatchObject({ codigo: 'CATALOGO_DUPLICADO', message: 'Ya existe un catálogo con ese código', estado: 409, campo: 'codigo' });
  });

  it('CATALOGO_INVALIDO no tiene campo: va como alerta (TR-CA-059)', async () => {
    const promesa = cliente.crear({ codigo: 'NORMA', nombre: 'Norma', alcance: 'GLOBAL', fuente: null, editablePorTenant: true });
    http
      .expectOne(`${API_URL}/catalogos`)
      .flush({ codigo: 'CATALOGO_INVALIDO', mensaje: 'Un catálogo normativo global no puede ser editable por el tenant' }, { status: 400, statusText: 'Bad Request' });

    expect(await promesa.catch((causa: unknown) => causa)).toMatchObject({ codigo: 'CATALOGO_INVALIDO', campo: null });
  });
});
