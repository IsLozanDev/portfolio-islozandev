import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorFe } from '../models/error-fe';
import { ProveedoresFeService } from './proveedores-fe.service';

const URL_PROVEEDORES = `${API_URL}/catalogos/PROVEEDOR_FE/items`;
const SUNAT = { codigo: 'SUNAT', nombre: 'SUNAT directo', atributos: { dominios_permitidos: ['e-beta.sunat.gob.pe'], url_produccion: 'https://e-factura.sunat.gob.pe' } };
const SIMULADO = { codigo: 'SIMULADO', nombre: 'Simulador', atributos: { dominios_permitidos: ['simulador.invalid'] } };

describe('ProveedoresFeService', () => {
  let servicio: ProveedoresFeService;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    servicio = TestBed.inject(ProveedoresFeService);
  });

  afterEach(() => http.verify());

  it('pide PROVEEDOR_FE una sola vez por sesión y encuentra por código', async () => {
    const primera = servicio.cargar();
    const segunda = servicio.cargar();
    http.expectOne({ method: 'GET', url: URL_PROVEEDORES }).flush([SUNAT, SIMULADO]);
    await Promise.all([primera, segunda]);
    await servicio.cargar();
    http.expectNone(URL_PROVEEDORES);

    expect(servicio.proveedores().map((proveedor) => proveedor.codigo)).toEqual(['SUNAT', 'SIMULADO']);
    expect(servicio.porCodigo('SUNAT')).toMatchObject({ esSunat: true, pideUrl: false });
    expect(servicio.porCodigo('OTRO')).toBeNull();
  });

  it('descartar quita el proveedor que el back rechazó (SIMULADO fuera de dev)', async () => {
    const carga = servicio.cargar();
    http.expectOne(URL_PROVEEDORES).flush([SUNAT, SIMULADO]);
    await carga;
    servicio.descartar('SIMULADO');
    expect(servicio.proveedores().map((proveedor) => proveedor.codigo)).toEqual(['SUNAT']);
  });

  it('sin plat.catalogo.leer queda en ERROR y se puede reintentar', async () => {
    const fallida = servicio.cargar();
    http.expectOne(URL_PROVEEDORES).flush({ codigo: 'SIN_PERMISO' }, { status: 403, statusText: 'Forbidden' });
    await expect(fallida).rejects.toBeInstanceOf(ErrorFe);
    expect(servicio.estado()).toBe('ERROR');

    const reintento = servicio.cargar();
    http.expectOne(URL_PROVEEDORES).flush([SUNAT]);
    await reintento;
    expect(servicio.estado()).toBe('LISTO');
  });
});
