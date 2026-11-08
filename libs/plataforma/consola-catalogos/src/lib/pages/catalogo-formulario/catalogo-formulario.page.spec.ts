import type { TestRequest } from '@angular/common/http/testing';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { abrirConsola, crearDobleAvisos, type ConsolaDePrueba, type DobleAvisos } from '../../../testing/rutas-de-prueba';
import { MENSAJES_FORMULARIO_CATALOGO } from '../../models/mensajes-catalogos';
import { PERMISOS_CATALOGOS } from '../../models/permisos-catalogos';

const URL_CATALOGOS = `${API_URL}/catalogos`;
const MEDIO_PAGO = { id: 'c-1', codigo: 'MEDIO_PAGO', nombre: 'Medios de pago', alcance: 'MIXTO', fuente: null, editable_por_tenant: true, version: 1, importable: false };

describe('CatalogoFormularioPage', () => {
  let sesion: DobleSesion;
  let avisos: DobleAvisos;
  let consola: ConsolaDePrueba;

  const campo = <T extends HTMLElement = HTMLInputElement>(nombre: string) => consola.elemento().querySelector<T>(`[data-campo="${nombre}"]`);
  const casillaEditable = () => campo<HTMLElement>('editablePorTenant')?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const radio = (valor: string) =>
    [...consola.elemento().querySelectorAll<HTMLInputElement>('[data-campo="alcance"] input[type="radio"]')].find((entrada) => entrada.value === valor);

  async function escribir(nombre: string, valor: string): Promise<void> {
    const entrada = campo(nombre);
    if (!entrada) throw new Error(`sin campo ${nombre}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    await consola.estable();
  }

  async function enviar(): Promise<void> {
    consola.elemento().querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await consola.estable();
  }

  async function abrirAlta(): Promise<void> {
    consola = await abrirConsola('/consola/catalogos/nuevo', sesion, avisos);
  }

  async function abrirEdicion(): Promise<void> {
    consola = await abrirConsola('/consola/catalogos/MEDIO_PAGO/editar', sesion, avisos);
    consola.http.expectOne({ method: 'GET', url: URL_CATALOGOS }).flush([MEDIO_PAGO]);
    await consola.estable();
  }

  /** El detalle al que se llega pide el catálogo y sus ítems. */
  async function responderDetalle(catalogo: object): Promise<void> {
    await consola.estable();
    consola.http.expectOne({ method: 'GET', url: URL_CATALOGOS }).flush([catalogo]);
    await consola.estable();
    consola.http.expectOne((solicitud) => solicitud.url.endsWith('/items/administracion')).flush({ items: [], total: 0, pagina: 1, tamano: 20 });
    await consola.estable();
  }

  const esperarAlta = (): TestRequest => consola.http.expectOne({ method: 'POST', url: URL_CATALOGOS });

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos(PERMISOS_CATALOGOS.leer, PERMISOS_CATALOGOS.gestionar);
    sesion.contexto.set({ permisos: [PERMISOS_CATALOGOS.leer, PERMISOS_CATALOGOS.gestionar], mfaVigente: true });
    avisos = crearDobleAvisos();
  });

  afterEach(() => consola.http.verify());

  it('TR-CA-058: crear MEDIO_PAGO MIXTO envía el cuerpo snake_case, avisa y navega al detalle', async () => {
    await abrirAlta();
    await escribir('codigo', 'MEDIO_PAGO');
    await escribir('nombre', 'Medios de pago');
    await enviar();

    const peticion = esperarAlta();
    expect(peticion.request.body).toEqual({ codigo: 'MEDIO_PAGO', nombre: 'Medios de pago', alcance: 'MIXTO', fuente: null, editable_por_tenant: true });
    peticion.flush(MEDIO_PAGO);
    await responderDetalle(MEDIO_PAGO);

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_FORMULARIO_CATALOGO.creado);
    expect(consola.url()).toBe('/consola/catalogos/MEDIO_PAGO');
  });

  it('TR-CA-059: GLOBAL desmarca y deshabilita «Editable por el tenant»; MIXTO lo marca', async () => {
    await abrirAlta();
    expect([casillaEditable()?.checked, casillaEditable()?.disabled]).toEqual([true, true]);

    radio('GLOBAL')?.click();
    await consola.estable();
    expect([casillaEditable()?.checked, casillaEditable()?.disabled]).toEqual([false, true]);

    await escribir('codigo', 'NORMA');
    await escribir('nombre', 'Norma');
    await enviar();
    const peticion = esperarAlta();
    expect(peticion.request.body).toMatchObject({ alcance: 'GLOBAL', editable_por_tenant: false });
    peticion.flush(
      { codigo: 'CATALOGO_INVALIDO', mensaje: 'Un catálogo normativo global no puede ser editable por el tenant' },
      { status: 400, statusText: 'Bad Request' },
    );
    await consola.estable();
    expect(consola.elemento().querySelector('[data-error="api"]')?.textContent).toContain('Un catálogo normativo global no puede ser editable por el tenant');
  });

  it('CATALOGO_DUPLICADO va al campo codigo', async () => {
    await abrirAlta();
    await escribir('codigo', 'MEDIO_PAGO');
    await escribir('nombre', 'Medios de pago');
    await enviar();
    esperarAlta().flush({ codigo: 'CATALOGO_DUPLICADO', mensaje: 'Ya existe un catálogo con ese código' }, { status: 409, statusText: 'Conflict' });
    await consola.estable();

    expect(consola.elemento().querySelector('mat-error')?.textContent).toContain('Ya existe un catálogo con ese código');
    expect(consola.elemento().querySelector('[data-error="api"]')).toBeNull();
  });

  it('un código fuera de formato no deja enviar', async () => {
    await abrirAlta();
    await escribir('codigo', 'medio pago');
    await escribir('nombre', 'Medios de pago');
    await enviar();

    expect(consola.elemento().querySelector('mat-error')?.textContent).toContain(MENSAJES_FORMULARIO_CATALOGO.codigoFormato);
  });

  it('al editar no envía codigo ni alcance, manda la versión y avisa si no había cambios', async () => {
    await abrirEdicion();
    expect([campo('codigo')?.disabled, radio('MIXTO')?.disabled]).toEqual([true, true]);

    await escribir('nombre', 'Formas de pago');
    await enviar();
    const peticion = consola.http.expectOne({ method: 'PUT', url: `${URL_CATALOGOS}/MEDIO_PAGO` });
    expect(peticion.request.body).toEqual({ nombre: 'Formas de pago', fuente: null, editable_por_tenant: true, version: 1 });
    peticion.flush({ ...MEDIO_PAGO, nombre: 'Formas de pago', version: 2, cambiado: false });
    await responderDetalle(MEDIO_PAGO);

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_FORMULARIO_CATALOGO.sinCambios);
    expect(consola.url()).toBe('/consola/catalogos/MEDIO_PAGO');
  });

  it('VERSION_OBSOLETA muestra la alerta con «Recargar», que vuelve a leer el catálogo', async () => {
    await abrirEdicion();
    await enviar();
    consola.http
      .expectOne({ method: 'PUT', url: `${URL_CATALOGOS}/MEDIO_PAGO` })
      .flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'Otro usuario modificó el registro; recargue' }, { status: 409, statusText: 'Conflict' });
    await consola.estable();

    consola.elemento().querySelector<HTMLButtonElement>('[data-accion="recargar"]')?.click();
    consola.http.expectOne({ method: 'GET', url: URL_CATALOGOS }).flush([{ ...MEDIO_PAGO, version: 3 }]);
    await consola.estable();
    expect(consola.elemento().querySelector('[data-error="version"]')).toBeNull();
  });

  it('un código inexistente muestra «El catálogo no existe»', async () => {
    consola = await abrirConsola('/consola/catalogos/XYZ/editar', sesion, avisos);
    consola.http.expectOne(URL_CATALOGOS).flush([MEDIO_PAGO]);
    await consola.estable();

    expect(consola.elemento().textContent).toContain(MENSAJES_FORMULARIO_CATALOGO.noExiste);
  });

  it('sin MFA vigente no envía y lleva a verificar', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_CATALOGOS.leer, PERMISOS_CATALOGOS.gestionar], mfaVigente: false });
    await abrirAlta();
    await escribir('codigo', 'MEDIO_PAGO');
    await escribir('nombre', 'Medios de pago');
    await enviar();

    consola.http.expectNone(URL_CATALOGOS);
    expect(consola.url()).toBe('/auth/mfa?returnUrl=%2Fconsola%2Fcatalogos%2Fnuevo');
  });

  it('un doble clic en «Crear» envía una sola petición (TR-RNF-008)', async () => {
    await abrirAlta();
    await escribir('codigo', 'MEDIO_PAGO');
    await escribir('nombre', 'Medios de pago');
    const boton = consola.elemento().querySelector<HTMLButtonElement>('button[type="submit"]');
    boton?.click();
    boton?.click();
    await consola.estable();

    esperarAlta().flush(MEDIO_PAGO);
    await responderDetalle(MEDIO_PAGO);
  });

  it('sin gestionar, la ruta nuevo lleva a /403', async () => {
    sesion = new DobleSesion().conPermisos(PERMISOS_CATALOGOS.leer);
    consola = await abrirConsola('/consola/catalogos/nuevo', sesion, avisos);
    expect(consola.url()).toBe('/403');
  });
});
