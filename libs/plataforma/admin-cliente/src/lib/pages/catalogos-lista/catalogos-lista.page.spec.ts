import { abrirAdmin, CATALOGOS, crearDobleAvisos, URL_CATALOGOS, type AdminDePrueba } from '../../../testing/catalogos-de-prueba';
import { DobleSesion } from '../../../testing/doble-sesion';
import { PERMISOS_CATALOGOS_ADMIN } from '../../models/permisos-catalogos-admin';

describe('CatalogosListaPage (admin)', () => {
  let pantalla: AdminDePrueba;

  async function abrir(ruta: string, permisos: string[] = [PERMISOS_CATALOGOS_ADMIN.personalizar]): Promise<void> {
    pantalla = await abrirAdmin(ruta, new DobleSesion().conPermisos(...permisos), crearDobleAvisos());
    pantalla.http.match({ method: 'GET', url: URL_CATALOGOS }).forEach((pedido) => pedido.flush(CATALOGOS));
    await pantalla.estable();
  }

  const filas = () => [...pantalla.elemento().querySelectorAll('tr.mat-mdc-row')].map((fila) => [...fila.querySelectorAll('td')].slice(0, 4).map((celda) => celda.textContent?.trim()));

  afterEach(() => pantalla.http.verify());

  it('lista los catálogos con lo que el tenant puede hacer en cada alcance', async () => {
    await abrir('/admin/catalogos');
    expect(filas()).toEqual([
      ['MEDIO_PAGO', 'Medios de pago', 'Mixto', 'Ítems propios y ajustes'],
      ['TIPO_COMPROBANTE', 'Tipos de comprobante', 'Global', 'Solo lectura'],
      ['AREA', 'Áreas', 'De la empresa', 'Ítems propios'],
    ]);
  });

  it('filtra en el cliente por texto y alcance de la URL', async () => {
    await abrir('/admin/catalogos?q=pago&alcance=MIXTO');
    expect(filas().map((fila) => fila[0])).toEqual(['MEDIO_PAGO']);
  });

  it('se abre con item_propio aunque no tenga personalizar (permisoGuard con OR)', async () => {
    await abrir('/admin/catalogos', [PERMISOS_CATALOGOS_ADMIN.itemPropio]);
    expect(pantalla.url()).toBe('/admin/catalogos');
  });
});
