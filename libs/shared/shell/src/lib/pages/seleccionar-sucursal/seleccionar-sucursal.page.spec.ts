import { contextoDePrueba, PaginaDePrueba, SURCO } from '../../../testing/pagina-de-prueba';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import { SeleccionarSucursalPage } from './seleccionar-sucursal.page';

describe('SeleccionarSucursalPage', () => {
  let pagina: PaginaDePrueba;

  beforeEach(() => {
    pagina = new PaginaDePrueba('seleccionar-sucursal', SeleccionarSucursalPage);
  });

  it('lista las sucursales y marca la actual', async () => {
    await pagina.abrir('/seleccionar-sucursal');

    const botones = [...pagina.elemento.querySelectorAll('li button')];
    expect(botones.map((boton) => boton.textContent?.trim())).toEqual(['Miraflores', 'Surco']);
    expect(botones[0].getAttribute('aria-current')).toBe('true');
  });

  it('TR-CA-045: elegir «Surco» recarga el contexto con esa sucursal y vuelve al returnUrl', async () => {
    await pagina.abrir('/seleccionar-sucursal?returnUrl=%2Fcaja');

    await pagina.pulsar('Surco');

    expect(pagina.sesion.seleccionarSucursal).toHaveBeenCalledWith(SURCO.id, { omitirAvisoError: true });
    expect(pagina.urlActual()).toBe('/caja');
  });

  it('con returnUrl externo vuelve a la portada', async () => {
    await pagina.abrir('/seleccionar-sucursal?returnUrl=%2F%2Fotro.sitio');

    await pagina.pulsar('Surco');

    expect(pagina.urlActual()).toBe('/');
  });

  it('sin contexto en memoria lo pide a la API', async () => {
    pagina.sesion.contexto.set(null);

    await pagina.abrir('/seleccionar-sucursal');

    expect(pagina.sesion.cargarContexto).toHaveBeenCalledExactlyOnceWith(undefined, { omitirAvisoError: true });
    expect(pagina.texto()).toContain('Surco');
  });

  it('sin accesos manda a /sin-accesos', async () => {
    pagina.sesion.contexto.set(contextoDePrueba({ sinAccesos: true, sucursales: [] }));

    await pagina.abrir('/seleccionar-sucursal');

    expect(pagina.urlActual()).toBe('/sin-accesos');
  });

  it('si falla la API muestra el error', async () => {
    pagina.sesion.contexto.set(null);
    pagina.sesion.cargarContexto.mockRejectedValueOnce(new Error('500'));

    await pagina.abrir('/seleccionar-sucursal');

    expect(pagina.textoDe('[role=alert]')).toBe(MENSAJES_SHELL.errorCargarSucursales);
  });
});
