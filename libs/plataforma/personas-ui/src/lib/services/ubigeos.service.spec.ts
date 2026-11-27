import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorPersonas } from '../models/error-personas';
import { UbigeosService } from './ubigeos.service';

const URL_UBIGEOS = `${API_URL}/catalogos/UBIGEO/items`;
const CAYMA = { codigo: '040103', nombre: 'CAYMA', atributos: { departamento: 'AREQUIPA', provincia: 'AREQUIPA' } };
const INCOMPLETO = { codigo: '999999', nombre: 'SIN PROVINCIA', atributos: { departamento: 'X' } };

describe('UbigeosService', () => {
  let servicio: UbigeosService;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    servicio = TestBed.inject(UbigeosService);
  });

  afterEach(() => http.verify());

  it('pide el catálogo una sola vez aunque lo pidan dos componentes, y descarta ítems incompletos', async () => {
    const primera = servicio.cargar();
    const segunda = servicio.cargar();
    http.expectOne({ method: 'GET', url: URL_UBIGEOS }).flush([CAYMA, INCOMPLETO]);
    await Promise.all([primera, segunda]);

    expect(servicio.ubigeos()).toEqual([{ codigo: '040103', distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA' }]);
    expect(servicio.listos()).toBe(true);

    await servicio.cargar();
    http.expectNone(URL_UBIGEOS);
  });

  it('sin plat.catalogo.leer queda en ERROR y se puede reintentar', async () => {
    const fallida = servicio.cargar();
    http.expectOne(URL_UBIGEOS).flush({ codigo: 'SIN_PERMISO', mensaje: 'Sin permiso' }, { status: 403, statusText: 'Forbidden' });
    await expect(fallida).rejects.toBeInstanceOf(ErrorPersonas);
    expect(servicio.estado()).toBe('ERROR');

    const reintento = servicio.cargar();
    http.expectOne(URL_UBIGEOS).flush([CAYMA]);
    await reintento;
    expect(servicio.estado()).toBe('LISTO');
  });

  it('porCodigo busca en la lista cargada y da null si no cargó o no existe', async () => {
    expect(servicio.porCodigo('040103')).toBeNull();

    const carga = servicio.cargar();
    http.expectOne(URL_UBIGEOS).flush([CAYMA]);
    await carga;

    expect(servicio.porCodigo('040103')).toEqual({ codigo: '040103', distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA' });
    expect(servicio.porCodigo('150122')).toBeNull();
  });
});
