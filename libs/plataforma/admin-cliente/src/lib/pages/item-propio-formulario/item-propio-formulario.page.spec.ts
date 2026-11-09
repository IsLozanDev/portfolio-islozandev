import { abrirAdmin, crearDobleAvisos, URL_CATALOGOS, type AdminDePrueba, type DobleAvisosCatalogos } from '../../../testing/catalogos-de-prueba';
import { DobleSesion } from '../../../testing/doble-sesion';
import { MENSAJES_FORMULARIO_ITEM_PROPIO } from '../../models/mensajes-catalogos-admin';
import { PERMISOS_CATALOGOS_ADMIN } from '../../models/permisos-catalogos-admin';

const URL_ITEMS = `${URL_CATALOGOS}/ESPECIALIDAD/items`;
const NUTRICION_ID = '0193f3a0-0000-7000-8000-00000000e001';
const MED_GEN_ID = '0193f3a0-0000-7000-8000-00000000e0ff';
/** 2026-11-08 en Lima. */
const AHORA = new Date('2026-11-08T15:00:00Z');

const NUTRICION = {
  id: NUTRICION_ID,
  codigo: 'NUTRI',
  codigo_externo: null,
  nombre: 'Nutrición clínica',
  abreviatura: null,
  orden: 5,
  atributos: {},
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
  activo: true,
  version: 1,
};

describe('ItemPropioFormularioPage', () => {
  let avisos: DobleAvisosCatalogos;
  let pantalla: AdminDePrueba;

  const campo = (nombre: string) => pantalla.elemento().querySelector<HTMLInputElement>(`[data-campo="${nombre}"]`);
  const errores = () => [...pantalla.elemento().querySelectorAll('mat-error')].map((error) => error.textContent?.trim()).filter(Boolean);

  async function abrir(ruta: string): Promise<void> {
    pantalla = await abrirAdmin(ruta, new DobleSesion().conPermisos(PERMISOS_CATALOGOS_ADMIN.itemPropio), avisos);
  }

  async function escribir(nombre: string, valor: string): Promise<void> {
    const entrada = campo(nombre);
    if (!entrada) throw new Error(`sin campo ${nombre}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    entrada.dispatchEvent(new Event('blur'));
    await pantalla.estable();
  }

  async function enviar(): Promise<void> {
    pantalla.elemento().querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await pantalla.estable();
  }

  /** Al volver, el detalle pide los catálogos y la página de ítems: no son parte de esta prueba. */
  function descartarDetalle(): void {
    pantalla.http.match(URL_CATALOGOS).forEach((pedido) => pedido.flush([]));
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    avisos = crearDobleAvisos();
  });

  afterEach(() => {
    vi.useRealTimers();
    pantalla.http.verify();
  });

  it('TR-CA-068: crea el propio y vuelve al detalle con origen «Propio»', async () => {
    await abrir('/admin/catalogos/ESPECIALIDAD/items/nuevo');
    await escribir('codigo', 'NUTRI');
    await escribir('nombre', 'Nutrición clínica');
    await enviar();

    const pedido = pantalla.http.expectOne({ method: 'POST', url: URL_ITEMS });
    expect(pedido.request.body).toMatchObject({ codigo: 'NUTRI', nombre: 'Nutrición clínica', vigente_desde: '2026-11-08' });
    pedido.flush(NUTRICION);
    await pantalla.estable();
    descartarDetalle();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_FORMULARIO_ITEM_PROPIO.creado);
    expect(pantalla.url()).toBe('/admin/catalogos/ESPECIALIDAD?origen=PROPIO');
  });

  it('TR-CA-069: MED_GEN ya existe como global: «El código ya existe en el catálogo» en el campo código', async () => {
    await abrir('/admin/catalogos/ESPECIALIDAD/items/nuevo');
    await escribir('codigo', 'MED_GEN');
    await escribir('nombre', 'Medicina General');
    await enviar();

    pantalla.http
      .expectOne({ method: 'POST', url: URL_ITEMS })
      .flush({ codigo: 'CODIGO_DUPLICADO', mensaje: 'El código ya existe en el catálogo' }, { status: 409, statusText: 'Conflict' });
    await pantalla.estable();

    expect(errores()).toContain('El código ya existe en el catálogo');
    expect(pantalla.url()).toBe('/admin/catalogos/ESPECIALIDAD/items/nuevo');
  });

  it('recargar items/:id/editar carga el propio con GET items/{id} y el PUT lleva su versión', async () => {
    await abrir(`/admin/catalogos/ESPECIALIDAD/items/${NUTRICION_ID}/editar`);
    pantalla.http.expectOne({ method: 'GET', url: `${URL_ITEMS}/${NUTRICION_ID}` }).flush(NUTRICION);
    await pantalla.estable();

    expect(campo('nombre')?.value).toBe('Nutrición clínica');
    await escribir('nombre', 'Nutrición clínica y deportiva');
    await enviar();
    const pedido = pantalla.http.expectOne({ method: 'PUT', url: `${URL_ITEMS}/${NUTRICION_ID}` });
    expect(pedido.request.body).toMatchObject({ nombre: 'Nutrición clínica y deportiva', version: 1 });
    pedido.flush({ ...NUTRICION, version: 2 });
    await pantalla.estable();
    descartarDetalle();
    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_FORMULARIO_ITEM_PROPIO.actualizado);
  });

  it('un id global en la ruta de edición muestra «El ítem no existe»', async () => {
    await abrir(`/admin/catalogos/ESPECIALIDAD/items/${MED_GEN_ID}/editar`);
    pantalla.http
      .expectOne(`${URL_ITEMS}/${MED_GEN_ID}`)
      .flush({ codigo: 'ITEM_NO_ENCONTRADO', mensaje: 'El ítem no existe' }, { status: 404, statusText: 'Not Found' });
    await pantalla.estable();

    expect(pantalla.elemento().textContent).toContain(MENSAJES_FORMULARIO_ITEM_PROPIO.noExiste);
    expect(campo('codigo')).toBeNull();
  });
});
