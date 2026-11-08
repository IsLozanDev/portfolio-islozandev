import type { TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { abrirConsola, crearDobleAvisos, type ConsolaDePrueba, type DobleAvisos } from '../../../testing/rutas-de-prueba';
import { MENSAJES_DETALLE_CATALOGO, MENSAJES_ITEMS } from '../../models/mensajes-catalogos';
import { PERMISOS_CATALOGOS } from '../../models/permisos-catalogos';

const URL_CATALOGOS = `${API_URL}/catalogos`;
const YAPE_ID = '0193f3a0-0000-7000-8000-00000000d002';
/** 2026-11-08 en Lima (UTC-5). */
const AHORA = new Date('2026-11-08T15:00:00Z');

const catalogo = (codigo: string, alcance: string, importable = false) => ({
  id: `c-${codigo}`,
  codigo,
  nombre: `Catálogo ${codigo}`,
  alcance,
  fuente: importable ? 'INEI' : null,
  editable_por_tenant: alcance !== 'GLOBAL',
  version: 4,
  importable,
});
const CATALOGOS = [catalogo('MEDIO_PAGO', 'MIXTO'), catalogo('AREA', 'TENANT'), catalogo('UBIGEO', 'GLOBAL', true)];

const filaYape = {
  item_id: YAPE_ID,
  codigo: 'YAPE',
  codigo_externo: null,
  nombre: 'Yape',
  abreviatura: null,
  orden: 2,
  atributos: { propia: 'x' },
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
  activo: true,
  propio: false,
  estado: 'VISIBLE',
  ajuste: null,
  version: 3,
};
const itemYape = { ...filaYape, id: YAPE_ID, item_id: undefined, propio: undefined, estado: undefined, ajuste: undefined };

describe('CatalogoDetallePage', () => {
  let sesion: DobleSesion;
  let avisos: DobleAvisos;
  let consola: ConsolaDePrueba;

  const elemento = () => consola.elemento();
  const accion = (nombre: string) => elemento().querySelector<HTMLElement>(`[data-accion="${nombre}"]`);
  const esperarItems = (): TestRequest => consola.http.expectOne((solicitud) => solicitud.url.endsWith('/items/administracion'));

  async function abrir(ruta: string, filas: object[] = [filaYape]): Promise<TestRequest | null> {
    consola = await abrirConsola(ruta, sesion, avisos);
    consola.http.expectOne({ method: 'GET', url: URL_CATALOGOS }).flush(CATALOGOS);
    await consola.estable();
    const pedidos = consola.http.match((solicitud) => solicitud.url.endsWith('/items/administracion'));
    pedidos.forEach((pedido) => pedido.flush({ items: filas, total: filas.length, pagina: 1, tamano: 20 }));
    await consola.estable();
    return pedidos[0] ?? null;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    sesion = new DobleSesion();
    sesion.contexto.set({ permisos: Object.values(PERMISOS_CATALOGOS), mfaVigente: true });
    avisos = crearDobleAvisos();
  });

  afterEach(() => {
    consola.http.verify();
    vi.useRealTimers();
  });

  it('la pestaña «Ítems» pide solo los globales, con el filtro y la página de la URL', async () => {
    const pedido = await abrir('/consola/catalogos/MEDIO_PAGO?texto=ya&estado=VISIBLE&pagina=2');

    expect(pedido?.request.urlWithParams).toBe(`${URL_CATALOGOS}/MEDIO_PAGO/items/administracion?origen=GLOBAL&pagina=2&tamano=20&texto=ya&estado=VISIBLE`);
    expect(elemento().querySelector('h1')?.textContent).toContain('Catálogo MEDIO_PAGO');
    const fila = elemento().querySelector('tr[mat-row]')?.textContent ?? '';
    expect(fila).toContain('01/01/2026 – sin fin');
    expect(fila).toContain('Visible');
  });

  it('filtrar deja el texto en la URL, conserva la pestaña y vuelve a la primera página', async () => {
    await abrir('/consola/catalogos/MEDIO_PAGO?pestana=items&pagina=3');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');

    consola.harness.fixture.debugElement.query((nodo) => nodo.name === 'vit-filtros').componentInstance.cambio.emit({ busqueda: 'pl', estado: null });

    expect(navegar).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { texto: 'pl', estado: null, pagina: null, tamano: null }, queryParamsHandling: 'merge' }));
  });

  it('en MIXTO, con item_gestionar, hay «Nuevo ítem», «Editar» y «Borrar»; sin la pestaña «Importaciones»', async () => {
    await abrir('/consola/catalogos/MEDIO_PAGO');

    expect(accion('nuevo-item')?.getAttribute('href')).toBe('/consola/catalogos/MEDIO_PAGO/items/nuevo');
    expect(accion('editar')?.getAttribute('href')).toBe('/consola/catalogos/MEDIO_PAGO/editar');
    expect(elemento().querySelector('tr [data-accion="editar"]')?.getAttribute('href')).toBe(`/consola/catalogos/MEDIO_PAGO/items/${YAPE_ID}/editar`);
    expect(elemento().querySelector('tr [data-accion="borrar"]')?.classList).toContain('vit-destructivo');
    expect(elemento().querySelector('[data-pestana="importaciones"]')).toBeNull();
    expect(accion('importar')).toBeNull();
  });

  it('en un catálogo TENANT no hay acciones de ítems y se muestra la nota', async () => {
    await abrir('/consola/catalogos/AREA', []);

    expect(elemento().querySelector('[data-nota="solo-tenant"]')?.textContent).toContain(MENSAJES_ITEMS.soloTenant);
    expect(accion('nuevo-item')).toBeNull();
  });

  it('en UBIGEO no hay «Editar», «Borrar» ni «Nuevo ítem», sí la nota de solo importación, «Importar» y la pestaña', async () => {
    await abrir('/consola/catalogos/UBIGEO');

    expect(elemento().querySelector('[data-nota="solo-importacion"]')?.textContent).toContain(MENSAJES_ITEMS.soloImportacion);
    expect(elemento().querySelector('tr [data-accion="editar"]')).toBeNull();
    expect(elemento().querySelector('tr [data-accion="borrar"]')).toBeNull();
    expect(accion('nuevo-item')).toBeNull();
    expect(accion('importar')?.getAttribute('href')).toBe('/consola/catalogos/UBIGEO/importar');
    expect(elemento().querySelector('[data-pestana="importaciones"]')?.textContent).toContain(MENSAJES_DETALLE_CATALOGO.pestanaImportaciones);
  });

  it('con ?pestana=importaciones en un catálogo no importable se queda en «Ítems»', async () => {
    const pedido = await abrir('/consola/catalogos/MEDIO_PAGO?pestana=importaciones');
    expect(pedido).not.toBeNull();
    expect(elemento().querySelector('[data-pestana="items"]')?.classList).toContain('mdc-tab--active');
  });

  it('sin item_gestionar no hay acciones de ítems', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_CATALOGOS.leer], mfaVigente: true });
    await abrir('/consola/catalogos/MEDIO_PAGO');

    expect(accion('nuevo-item')).toBeNull();
    expect(elemento().querySelector('tr [data-accion="borrar"]')).toBeNull();
    expect(accion('editar')).toBeNull();
  });

  it('borrar sin referencias confirma, envía DELETE con la versión, avisa y recarga', async () => {
    await abrir('/consola/catalogos/MEDIO_PAGO');
    elemento().querySelector<HTMLButtonElement>('tr [data-accion="borrar"]')?.click();
    await consola.estable();

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Borrar el ítem YAPE?' }));
    consola.http.expectOne({ method: 'DELETE', url: `${URL_CATALOGOS}/MEDIO_PAGO/items-globales/${YAPE_ID}?version=3` }).flush(null, { status: 204, statusText: 'No Content' });
    await consola.estable();
    esperarItems().flush({ items: [], total: 0, pagina: 1, tamano: 20 });
    await consola.estable();
    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_ITEMS.itemBorrado);
  });

  it('TR-CA-061: Yape referenciado ofrece cerrar la vigencia y envía PUT con vigente_hasta igual a hoy en Lima', async () => {
    await abrir('/consola/catalogos/MEDIO_PAGO');
    elemento().querySelector<HTMLButtonElement>('tr [data-accion="borrar"]')?.click();
    await consola.estable();
    consola.http
      .expectOne({ method: 'DELETE', url: `${URL_CATALOGOS}/MEDIO_PAGO/items-globales/${YAPE_ID}?version=3` })
      .flush({ codigo: 'ITEM_REFERENCIADO', mensaje: 'El ítem está en uso; cierre su vigencia o inactívelo' }, { status: 409, statusText: 'Conflict' });
    await consola.estable();

    expect(avisos.confirmarDestructiva).toHaveBeenLastCalledWith(expect.objectContaining({ titulo: MENSAJES_ITEMS.enUso }));
    consola.http.expectOne({ method: 'GET', url: `${URL_CATALOGOS}/MEDIO_PAGO/items-globales/${YAPE_ID}` }).flush({ ...itemYape, version: 5 });
    await consola.estable();
    const put = consola.http.expectOne({ method: 'PUT', url: `${URL_CATALOGOS}/MEDIO_PAGO/items-globales/${YAPE_ID}` });
    expect(put.request.body).toEqual({
      codigo_externo: null,
      nombre: 'Yape',
      abreviatura: null,
      orden: 2,
      atributos: { propia: 'x' },
      vigente_desde: '2026-01-01',
      vigente_hasta: '2026-11-08',
      activo: true,
      version: 5,
    });
    put.flush({ ...itemYape, vigente_hasta: '2026-11-08', version: 6, cambiado: true });
    await consola.estable();
    esperarItems().flush({ items: [filaYape], total: 1, pagina: 1, tamano: 20 });
    await consola.estable();
    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_ITEMS.vigenciaCerrada);
  });

  it('con vigente_desde futura avisa y no envía el PUT', async () => {
    await abrir('/consola/catalogos/MEDIO_PAGO');
    elemento().querySelector<HTMLButtonElement>('tr [data-accion="borrar"]')?.click();
    await consola.estable();
    consola.http.expectOne({ method: 'DELETE' }).flush({ codigo: 'ITEM_REFERENCIADO', mensaje: 'En uso' }, { status: 409, statusText: 'Conflict' });
    await consola.estable();
    consola.http.expectOne({ method: 'GET', url: `${URL_CATALOGOS}/MEDIO_PAGO/items-globales/${YAPE_ID}` }).flush({ ...itemYape, vigente_desde: '2027-01-01' });
    await consola.estable();

    consola.http.expectNone({ method: 'PUT' });
    expect(avisos.toast).toHaveBeenCalledWith('advertencia', MENSAJES_ITEMS.aunNoVigente);
  });

  it('cancelar la confirmación no envía nada', async () => {
    avisos.confirmarDestructiva.mockResolvedValue({ confirmado: false });
    await abrir('/consola/catalogos/MEDIO_PAGO');
    elemento().querySelector<HTMLButtonElement>('tr [data-accion="borrar"]')?.click();
    await consola.estable();

    consola.http.expectNone({ method: 'DELETE' });
  });

  it('un código inexistente muestra «El catálogo no existe» con enlace a la lista', async () => {
    consola = await abrirConsola('/consola/catalogos/XYZ', sesion, avisos);
    consola.http.expectOne(URL_CATALOGOS).flush(CATALOGOS);
    await consola.estable();

    expect(elemento().textContent).toContain(MENSAJES_DETALLE_CATALOGO.noExiste);
    expect(accion('volver')?.getAttribute('href')).toBe('/consola/catalogos');
  });
});
