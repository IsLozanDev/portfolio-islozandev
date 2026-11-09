import type { TestRequest } from '@angular/common/http/testing';
import {
  abrirAdmin,
  CATALOGOS,
  crearDobleAvisos,
  filaPlin,
  filaVale,
  PLIN_ID,
  URL_CATALOGOS,
  type AdminDePrueba,
  type DobleAvisosCatalogos,
} from '../../../testing/catalogos-de-prueba';
import { DobleSesion } from '../../../testing/doble-sesion';
import { MENSAJES_DETALLE_CATALOGO_ADMIN } from '../../models/mensajes-catalogos-admin';
import { PERMISOS_CATALOGOS_ADMIN } from '../../models/permisos-catalogos-admin';

const URL_PLIN_AJUSTE = `${URL_CATALOGOS}/MEDIO_PAGO/items/${PLIN_ID}/ajuste`;
const AJUSTE_PLIN = { visible: true, orden: 1, alias: 'Plin QR', version: 4 };

describe('CatalogoDetallePage (admin)', () => {
  let sesion: DobleSesion;
  let avisos: DobleAvisosCatalogos;
  let pantalla: AdminDePrueba;

  const elemento = () => pantalla.elemento();
  const fila = (texto: string) => [...elemento().querySelectorAll<HTMLElement>('tr.mat-mdc-row')].find((candidata) => candidata.textContent?.includes(texto));
  const accion = (texto: string, nombre: string) => fila(texto)?.querySelector<HTMLElement>(`[data-accion="${nombre}"]`) ?? null;
  const pedidosDeItems = (): TestRequest[] => pantalla.http.match((solicitud) => solicitud.url.endsWith('/items/administracion'));

  async function abrir(ruta: string, filas: object[] = [filaPlin({ ajuste: AJUSTE_PLIN }), filaVale()]): Promise<TestRequest> {
    pantalla = await abrirAdmin(ruta, sesion, avisos);
    pantalla.http.expectOne({ method: 'GET', url: URL_CATALOGOS }).flush(CATALOGOS);
    await pantalla.estable();
    return responderItems(filas);
  }

  async function responderItems(filas: object[] = [filaPlin(), filaVale()]): Promise<TestRequest> {
    await pantalla.estable();
    const [pedido] = pedidosDeItems();
    pedido.flush({ items: filas, total: filas.length, pagina: 1, tamano: 20 });
    await pantalla.estable();
    return pedido;
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos(...Object.values(PERMISOS_CATALOGOS_ADMIN));
    avisos = crearDobleAvisos();
  });

  afterEach(() => pantalla.http.verify());

  it('TR-CA-067: TIPO_COMPROBANTE (GLOBAL) va en solo lectura, con la nota, sin interruptor ni acciones', async () => {
    await abrir('/admin/catalogos/TIPO_COMPROBANTE', [filaPlin({ codigo: 'FACTURA', nombre: 'Factura' })]);

    expect(elemento().querySelector('[data-nota="normativo"]')?.textContent).toContain(MENSAJES_DETALLE_CATALOGO_ADMIN.notaNormativo);
    expect(elemento().querySelector('[data-accion]')).toBeNull();
    expect(elemento().querySelector('mat-slide-toggle')).toBeNull();
  });

  it('TR-CA-066: apagar «Plin» envía visible false con el alias, el orden y la versión actuales', async () => {
    await abrir('/admin/catalogos/MEDIO_PAGO');
    accion('PLIN', 'visible')?.querySelector('button')?.click();
    await pantalla.estable();

    const pedido = pantalla.http.expectOne({ method: 'PUT', url: URL_PLIN_AJUSTE });
    expect(pedido.request.body).toEqual({ visible: false, orden: 1, alias: 'Plin QR', version: 4 });
    expect(accion('PLIN', 'visible')?.querySelector('button')?.disabled).toBe(true);
    pedido.flush({ cambiado: true });
    await responderItems([filaPlin({ estado: 'OCULTO', ajuste: { ...AJUSTE_PLIN, visible: false, version: 5 } })]);
    expect(avisos.toast).toHaveBeenCalledWith('exito', 'Plin QR oculto para su empresa');
  });

  it('si el ajuste falla, el interruptor vuelve a su valor y se avisa', async () => {
    await abrir('/admin/catalogos/MEDIO_PAGO');
    const interruptor = () => accion('PLIN', 'visible')?.querySelector('button');
    interruptor()?.click();
    await pantalla.estable();
    pantalla.http.expectOne(URL_PLIN_AJUSTE).flush({ codigo: 'ALCANCE_NO_PERMITE', mensaje: 'El catálogo no admite ajustes' }, { status: 409, statusText: 'Conflict' });
    await pantalla.estable();

    expect(interruptor()?.getAttribute('aria-checked')).toBe('true');
    expect(avisos.toast).toHaveBeenCalledWith('error', 'El catálogo no admite ajustes');
  });

  it('el alias se ve en la tabla con el nombre global debajo', async () => {
    await abrir('/admin/catalogos/MEDIO_PAGO');
    expect(fila('PLIN')?.textContent).toContain('Plin QR');
    expect(fila('PLIN')?.querySelector('[data-nombre-global]')?.textContent?.trim()).toBe('Global: Plin');
  });

  it('«Personalizar» abre el panel lateral y envía el alias', async () => {
    await abrir('/admin/catalogos/MEDIO_PAGO', [filaPlin()]);
    accion('PLIN', 'personalizar')?.click();
    await pantalla.estable();

    const alias = document.querySelector<HTMLInputElement>('.vit-panel-lateral [data-campo="alias"]');
    expect(alias).not.toBeNull();
    if (!alias) return;
    alias.value = 'Plin QR';
    alias.dispatchEvent(new Event('input'));
    document.querySelector<HTMLButtonElement>('.vit-panel-lateral button[type="submit"]')?.click();
    await pantalla.estable();

    const pedido = pantalla.http.expectOne({ method: 'PUT', url: URL_PLIN_AJUSTE });
    expect(pedido.request.body).toEqual({ visible: true, orden: null, alias: 'Plin QR', version: null });
    pedido.flush({ cambiado: true });
    await responderItems();
    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_DETALLE_CATALOGO_ADMIN.ajusteGuardado);
  });

  it('«Restablecer» pide confirmación y envía el ajuste neutro con la versión', async () => {
    await abrir('/admin/catalogos/MEDIO_PAGO');
    accion('PLIN', 'restablecer')?.click();
    await pantalla.estable();

    expect(avisos.confirmar).toHaveBeenCalledWith({ titulo: '¿Volver a los valores globales de Plin QR?' });
    const pedido = pantalla.http.expectOne({ method: 'PUT', url: URL_PLIN_AJUSTE });
    expect(pedido.request.body).toEqual({ visible: true, orden: null, alias: null, version: 4 });
    pedido.flush({ cambiado: true });
    await responderItems();
  });

  it('VERSION_OBSOLETA en el interruptor avisa y recarga la página de la tabla', async () => {
    await abrir('/admin/catalogos/MEDIO_PAGO');
    accion('PLIN', 'visible')?.querySelector('button')?.click();
    await pantalla.estable();
    pantalla.http.expectOne(URL_PLIN_AJUSTE).flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'x' }, { status: 409, statusText: 'Conflict' });
    await responderItems();

    expect(avisos.advertencia).toHaveBeenCalledWith(MENSAJES_DETALLE_CATALOGO_ADMIN.versionObsoleta);
  });

  it('el filtro de origen solo existe en MIXTO y viaja a la API', async () => {
    const pedido = await abrir('/admin/catalogos/MEDIO_PAGO?origen=PROPIO&estado=OCULTO&pagina=2');
    expect(pedido.request.urlWithParams).toBe(`${URL_CATALOGOS}/MEDIO_PAGO/items/administracion?pagina=2&tamano=20&estado=OCULTO&origen=PROPIO`);
    expect(elemento().querySelectorAll('vit-filtros mat-select')).toHaveLength(2);
  });

  it('en TENANT no hay filtro de origen ni lo pide aunque venga en la URL', async () => {
    const pedido = await abrir('/admin/catalogos/AREA?origen=GLOBAL', [filaVale()]);
    expect(pedido.request.params.has('origen')).toBe(false);
    expect(elemento().querySelectorAll('vit-filtros mat-select')).toHaveLength(1);
  });

  it('sin plat.catalogo.personalizar no hay interruptor ni «Personalizar»', async () => {
    sesion.conPermisos(PERMISOS_CATALOGOS_ADMIN.itemPropio);
    await abrir('/admin/catalogos/MEDIO_PAGO');
    expect(elemento().querySelector('mat-slide-toggle')).toBeNull();
    expect(elemento().querySelector('[data-accion="personalizar"]')).toBeNull();
    expect(accion('VALE', 'editar')).not.toBeNull();
  });

  it('sin plat.catalogo.item_propio no hay «Nuevo ítem propio» ni «Editar»', async () => {
    sesion.conPermisos(PERMISOS_CATALOGOS_ADMIN.personalizar);
    await abrir('/admin/catalogos/MEDIO_PAGO');
    expect(elemento().querySelector('[data-accion="nuevo-item"]')).toBeNull();
    expect(accion('VALE', 'editar')).toBeNull();
    expect(accion('PLIN', 'visible')).not.toBeNull();
  });
});
