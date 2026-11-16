import type { TestRequest } from '@angular/common/http/testing';
import { API_URL, PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { InicioPage, PERMISO_CUOTA_IDENTIDAD } from './inicio.page';

const URL_CUOTA_ACTUAL = `${API_URL}/identidad/cuota-actual`;
/** La primera carga del chunk de `admin-cliente` transforma Material entero. */
const ESPERA_CHUNK_MS = 30_000;

describe('InicioPage', () => {
  let pagina: PaginaDePrueba;

  /** La tarjeta llega por `import()`: se espera a que pida su dato. */
  const pedidoCuotaActual = (): Promise<TestRequest> => vi.waitFor(() => pagina.http.expectOne(URL_CUOTA_ACTUAL), { timeout: ESPERA_CHUNK_MS });

  beforeAll(() => import('@vitrina/plataforma/admin-cliente'), ESPERA_CHUNK_MS);

  beforeEach(() => {
    pagina = new PaginaDePrueba('', InicioPage);
  });

  afterEach(() => pagina.http.verify());

  it('muestra el correo y la sucursal actual', async () => {
    await pagina.abrir('/');

    expect(pagina.texto()).toContain('carmen@correo.pe');
    expect(pagina.texto()).toContain('Sucursal: Miraflores');
  });

  it('sin plat.identidad.cuota no pide cuota-actual ni muestra la tarjeta', async () => {
    await pagina.abrir('/');
    await pagina.estable();

    pagina.http.expectNone(URL_CUOTA_ACTUAL);
    expect(pagina.elemento().querySelector('vit-tarjeta-consumo-identidad')).toBeNull();
  });

  it('con plat.identidad.cuota muestra la tarjeta con «120 de 500 consultas»', async () => {
    await pagina.abrir('/', [PERMISO_CUOTA_IDENTIDAD]);
    (await pedidoCuotaActual()).flush({ periodo: '2026-11', plan: 'BASICO', incluidas: 500, consumidas: 120, porcentaje: 24, umbral_aviso: 80 });
    await pagina.estable();

    expect(pagina.texto()).toContain('noviembre 2026 · Plan BASICO');
    expect(pagina.texto()).toContain('120 de 500 consultas');
  });

  it('si la API falla, la tarjeta lo dice y el resto del Inicio sigue', async () => {
    await pagina.abrir('/', [PERMISO_CUOTA_IDENTIDAD]);
    (await pedidoCuotaActual()).flush({ codigo: 'X', mensaje: 'x' }, { status: 500, statusText: 'Server Error' });
    await pagina.estable();

    expect(pagina.texto()).toContain('No se pudo cargar el consumo');
    expect(pagina.texto()).toContain('Sucursal: Miraflores');
  });
});
