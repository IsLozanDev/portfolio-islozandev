import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { abrirConsola, crearDobleAvisos, type ConsolaDePrueba, type DobleAvisos } from '../../../testing/rutas-de-prueba';
import { PERMISOS_CONSOLA_IDENTIDAD } from '../../models/permisos-identidad';

const URL_PROVEEDORES = `${API_URL}/identidad/proveedores`;
const URL_DECOLECTA = `${URL_PROVEEDORES}/DECOLECTA`;

const proveedor = (codigo: string, prioridad: number, cambios: object = {}) => ({
  codigo,
  tipos_doc: ['DNI', 'RUC'],
  prioridad,
  ttl_dias: 30,
  timeout_ms: 3000,
  activo: true,
  version: 2,
  ...cambios,
});

const DECOLECTA = proveedor('DECOLECTA', 1);
const APIS_PERU = proveedor('APIS_PERU', 2, { tipos_doc: ['DNI'] });

describe('ProveedoresListaPage', () => {
  let consola: ConsolaDePrueba;
  let avisos: DobleAvisos;

  const filas = () => [...consola.elemento().querySelectorAll('tr[mat-row]')];
  const codigos = () => filas().map((fila) => fila.querySelectorAll('td')[1]?.textContent?.trim());
  const panel = () => document.querySelector<HTMLElement>('vit-panel-proveedor');
  const campo = <T extends HTMLElement>(nombre: string) => panel()?.querySelector<T>(`[data-campo="${nombre}"]`);

  async function abrir(respuesta: object[] = [DECOLECTA, APIS_PERU]): Promise<void> {
    avisos = crearDobleAvisos();
    consola = await abrirConsola('/consola/identidad/proveedores', new DobleSesion().conPermisos(PERMISOS_CONSOLA_IDENTIDAD.proveedor), avisos);
    consola.http.expectOne({ method: 'GET', url: URL_PROVEEDORES }).flush(respuesta);
    await consola.estable();
  }

  async function editar(codigo: string): Promise<void> {
    consola.elemento().querySelector<HTMLButtonElement>(`[data-editar="${codigo}"]`)?.click();
    await consola.estable();
  }

  async function escribir(nombre: string, valor: string): Promise<void> {
    const entrada = campo<HTMLInputElement>(nombre);
    if (!entrada) throw new Error(`No está el campo ${nombre}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    entrada.dispatchEvent(new Event('blur'));
    await consola.estable();
  }

  async function alternarActivo(): Promise<void> {
    campo('activo')?.querySelector<HTMLButtonElement>('button')?.click();
    await consola.estable();
  }

  const activoMarcado = () => campo('activo')?.querySelector('button')?.getAttribute('aria-checked');

  async function guardar(): Promise<void> {
    panel()?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await consola.estable();
  }

  afterEach(async () => {
    panel()?.querySelector<HTMLButtonElement>('vit-acciones-formulario button[type="button"]')?.click();
    await consola.estable();
    consola.http.verify();
  });

  it('lista por prioridad, con tipos como texto, TTL, timeout y chip Activo/Inactivo', async () => {
    await abrir([DECOLECTA, proveedor('APIS_PERU', 2, { tipos_doc: ['DNI'], activo: false })]);

    expect(codigos()).toEqual(['DECOLECTA', 'APIS_PERU']);
    const primera = [...filas()[0].querySelectorAll('td')].map((celda) => celda.textContent?.trim());
    expect(primera.slice(0, 6)).toEqual(['1', 'DECOLECTA', 'DNI, RUC', '30', '3000', 'Activo']);
    expect(filas()[1].querySelector('vit-chip-estado')?.textContent?.trim()).toBe('Inactivo');
    expect(filas()[1].querySelector('vit-chip-estado')?.innerHTML).toContain('bg-chip-neutro');
  });

  it('pasar DECOLECTA de prioridad 1 a 3 manda solo { prioridad, version } y la lista recargada lo muestra después', async () => {
    await abrir();
    await editar('DECOLECTA');
    expect(campo<HTMLInputElement>('prioridad')?.value).toBe('1');

    await escribir('prioridad', '3');
    await guardar();
    const patch = consola.http.expectOne({ method: 'PATCH', url: URL_DECOLECTA });
    expect(patch.request.body).toEqual({ prioridad: 3, version: 2 });
    patch.flush({});
    await consola.estable();
    consola.http.expectOne({ method: 'GET', url: URL_PROVEEDORES }).flush([APIS_PERU, proveedor('DECOLECTA', 3, { version: 3 })]);
    await consola.estable();

    expect(panel()).toBeNull();
    expect(avisos.toast).toHaveBeenCalledWith('exito', 'Proveedor actualizado');
    expect(codigos()).toEqual(['APIS_PERU', 'DECOLECTA']);
  });

  it('valida los rangos sin mandar nada', async () => {
    await abrir();
    await editar('DECOLECTA');

    await escribir('ttlDias', '400');
    await escribir('timeoutMs', '50');
    await escribir('prioridad', '0');
    await guardar();

    expect(panel()?.querySelector('[data-error="ttlDias"]')?.textContent?.trim()).toBe('El valor máximo es 365.');
    expect(panel()?.querySelector('[data-error="timeoutMs"]')?.textContent?.trim()).toBe('El valor mínimo es 100.');
    expect(panel()?.querySelector('[data-error="prioridad"]')?.textContent?.trim()).toBe('El valor mínimo es 1.');
    consola.http.expectNone({ method: 'PATCH', url: URL_DECOLECTA });
  });

  it('sin cambios cierra sin mandar nada', async () => {
    await abrir();
    await editar('DECOLECTA');

    await guardar();

    expect(panel()).toBeNull();
    consola.http.expectNone({ method: 'PATCH', url: URL_DECOLECTA });
  });

  it('desactivar pide confirmación con el código; cancelar no manda nada y el interruptor vuelve a activo', async () => {
    await abrir();
    avisos.confirmarDestructiva.mockResolvedValue({ confirmado: false });
    await editar('DECOLECTA');

    await alternarActivo();
    await guardar();

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith(expect.objectContaining({ texto: 'Las consultas dejarán de usar DECOLECTA', textoConfirmar: 'Desactivar' }));
    consola.http.expectNone({ method: 'PATCH', url: URL_DECOLECTA });
    expect(panel()).not.toBeNull();
    expect(activoMarcado()).toBe('true');
  });

  it('desactivar confirmado manda { activo: false, version }', async () => {
    await abrir();
    await editar('DECOLECTA');

    await alternarActivo();
    await guardar();
    const patch = consola.http.expectOne({ method: 'PATCH', url: URL_DECOLECTA });
    expect(patch.request.body).toEqual({ activo: false, version: 2 });
    patch.flush({});
    await consola.estable();
    consola.http.expectOne({ method: 'GET', url: URL_PROVEEDORES }).flush([DECOLECTA, APIS_PERU]);
    await consola.estable();
  });

  it('422 ULTIMO_PROVEEDOR_ACTIVO lo explica en el panel y el interruptor vuelve a activo', async () => {
    await abrir();
    await editar('DECOLECTA');

    await alternarActivo();
    await guardar();
    consola.http
      .expectOne({ method: 'PATCH', url: URL_DECOLECTA })
      .flush({ codigo: 'ULTIMO_PROVEEDOR_ACTIVO', mensaje: 'x' }, { status: 422, statusText: 'Unprocessable Entity' });
    await consola.estable();

    expect(panel()?.querySelector('[data-error="panel"]')?.textContent?.trim()).toBe('Debe quedar al menos un proveedor activo.');
    expect(activoMarcado()).toBe('true');
  });

  it('409 VERSION_OBSOLETA avisa, recarga la lista y el panel sigue abierto con la versión nueva', async () => {
    await abrir();
    await editar('DECOLECTA');
    await escribir('ttlDias', '60');
    await guardar();

    consola.http.expectOne({ method: 'PATCH', url: URL_DECOLECTA }).flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'x' }, { status: 409, statusText: 'Conflict' });
    await consola.estable();
    consola.http.expectOne({ method: 'GET', url: URL_PROVEEDORES }).flush([proveedor('DECOLECTA', 1, { timeout_ms: 5000, version: 7 }), APIS_PERU]);
    await consola.estable();

    expect(panel()?.querySelector('[data-error="panel"]')?.textContent).toContain('El proveedor cambió mientras lo editabas');
    expect(campo<HTMLInputElement>('timeoutMs')?.value).toBe('5000');

    await escribir('ttlDias', '60');
    await guardar();
    const reintento = consola.http.expectOne({ method: 'PATCH', url: URL_DECOLECTA });
    expect(reintento.request.body).toEqual({ ttl_dias: 60, version: 7 });
    reintento.flush({});
    await consola.estable();
    consola.http.expectOne({ method: 'GET', url: URL_PROVEEDORES }).flush([DECOLECTA, APIS_PERU]);
    await consola.estable();
  });

  it('ni la tabla ni el panel muestran credenciales', async () => {
    await abrir([{ ...DECOLECTA, token: 'secreto-que-no-debe-verse' }]);
    await editar('DECOLECTA');

    expect(document.body.textContent).not.toContain('secreto-que-no-debe-verse');
    const campos = [...(panel()?.querySelectorAll('[data-campo]') ?? [])].map((elemento) => elemento.getAttribute('data-campo'));
    expect(campos).toEqual(['prioridad', 'ttlDias', 'timeoutMs', 'activo']);
  });

  it('403 OPERADOR_REQUERIDO muestra el estado de solo operador, sin tabla', async () => {
    avisos = crearDobleAvisos();
    consola = await abrirConsola('/consola/identidad/proveedores', new DobleSesion().conPermisos(PERMISOS_CONSOLA_IDENTIDAD.proveedor), avisos);
    consola.http.expectOne(URL_PROVEEDORES).flush({ codigo: 'OPERADOR_REQUERIDO', mensaje: 'x' }, { status: 403, statusText: 'Forbidden' });
    await consola.estable();

    expect(consola.elemento().querySelector('vit-estado-vacio')?.textContent).toContain('Esta pantalla solo está disponible para el operador de la plataforma');
    expect(consola.elemento().querySelector('vit-tabla')).toBeNull();
  });
});
