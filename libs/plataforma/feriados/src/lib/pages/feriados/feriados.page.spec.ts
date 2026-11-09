import type { TestRequest } from '@angular/common/http/testing';
import { aniversario, CUSCO, fiestasPatrias, intiRaymi, pagina } from '../../../testing/feriados-de-prueba';
import { URL_FERIADOS } from '../../../testing/http-de-prueba';
import { abrirFeriados, ALCANCES_ADMIN, ALCANCES_CONSOLA, crearDobleAvisos, type DobleAvisos, type PaginaDePrueba } from '../../../testing/rutas-de-prueba';
import type { FeriadoDelAnioRespuesta } from '../../models/feriado';
import { MENSAJES_FERIADOS } from '../../models/mensajes-feriados';

/** 31/12/2026 a las 23:00 en Lima: ya es 2027 en UTC. */
const AHORA = new Date('2027-01-01T04:00:00Z');

describe('FeriadosPage', () => {
  let avisos: DobleAvisos;
  let pantalla: PaginaDePrueba;

  const elemento = () => pantalla.elemento();
  const pedidosDeLista = (): TestRequest[] => pantalla.http.match((solicitud) => solicitud.method === 'GET' && solicitud.url === URL_FERIADOS);
  const fila = (nombre: string) => [...elemento().querySelectorAll('tr.mat-mdc-row')].find((candidata) => candidata.textContent?.includes(nombre));

  async function abrir(ruta: string, alcances = ALCANCES_ADMIN, items: FeriadoDelAnioRespuesta[] = [fiestasPatrias, intiRaymi, aniversario]): Promise<TestRequest> {
    pantalla = await abrirFeriados(ruta, alcances, avisos);
    const [pedido] = pedidosDeLista();
    pedido.flush(pagina(items));
    await pantalla.estable();
    return pedido;
  }

  async function responderLista(items: FeriadoDelAnioRespuesta[] = []): Promise<TestRequest> {
    await pantalla.estable();
    const [pedido] = pedidosDeLista();
    pedido.flush(pagina(items));
    await pantalla.estable();
    return pedido;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    avisos = crearDobleAvisos();
  });

  afterEach(() => {
    pantalla.http.verify();
    vi.useRealTimers();
  });

  it('el año por defecto es el de hoy en Lima', async () => {
    const pedido = await abrir('/feriados');
    expect(pedido.request.params.get('anio')).toBe('2026');
    expect(elemento().querySelector('[data-anio]')?.textContent?.trim()).toBe('2026');
  });

  it('el año, los filtros y la página de la URL viajan a la API', async () => {
    const pedido = await abrir(`/feriados?anio=2027&sucursal=${CUSCO}&alcance=SUCURSAL&pagina=2&tamano=50`);
    expect(pedido.request.urlWithParams).toBe(`${URL_FERIADOS}?anio=2027&sucursal_id=${CUSCO}&alcance=SUCURSAL&pagina=2&tamano=50`);
  });

  it('cambiar el año va a la página 1 y lo deja en la URL', async () => {
    await abrir('/feriados?anio=2027&pagina=3');
    elemento().querySelector<HTMLButtonElement>('[data-accion="anio-siguiente"]')?.click();
    const pedido = await responderLista();
    expect(pantalla.url()).toBe('/feriados?anio=2028');
    expect(pedido.request.params.get('pagina')).toBe('1');
  });

  it('la consola pide alcance=GLOBAL, sin filtros ni columna de sucursal', async () => {
    const pedido = await abrir(`/feriados?anio=2027&sucursal=${CUSCO}&alcance=TENANT`, ALCANCES_CONSOLA, [fiestasPatrias]);
    expect(pedido.request.urlWithParams).toBe(`${URL_FERIADOS}?anio=2027&alcance=GLOBAL&pagina=1&tamano=20`);
    expect(elemento().querySelector('vit-filtros')).toBeNull();
    expect(elemento().querySelector('.mat-column-sucursal')).toBeNull();
    expect(fila('Fiestas Patrias')?.querySelector('[data-accion="editar"]')).not.toBeNull();
  });

  it('en admin, un global no tiene acciones aunque editable sea true; los del tenant y de sucursal sí', async () => {
    await abrir('/feriados?anio=2027');
    expect(fila('Fiestas Patrias')?.querySelector('[data-accion]')).toBeNull();
    expect(fila('Inti Raymi')?.querySelector('[data-accion="borrar"]')).not.toBeNull();
    expect(fila('Aniversario')?.querySelector('[data-accion="editar"]')).not.toBeNull();
  });

  it('en admin muestra la sucursal, el día en español y el alcance', async () => {
    await abrir('/feriados?anio=2027');
    const celdas = [...(fila('Inti Raymi')?.querySelectorAll('td') ?? [])].map((celda) => celda.textContent?.trim());
    expect(celdas.slice(0, 6)).toEqual(['24/06/2027', 'jueves', 'Inti Raymi', 'Sucursal', 'Cusco', 'Sí']);
  });

  it('borrar un recurrente avisa que deja de aplicar en todos los años y envía la versión', async () => {
    await abrir('/feriados?anio=2027');
    fila('Inti Raymi')?.querySelector<HTMLButtonElement>('[data-accion="borrar"]')?.click();
    await pantalla.estable();

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith({
      titulo: '¿Borrar el feriado Inti Raymi del 24/06/2027?',
      texto: MENSAJES_FERIADOS.borrarRecurrente,
      textoConfirmar: MENSAJES_FERIADOS.confirmarBorrar,
    });
    pantalla.http.expectOne({ method: 'DELETE', url: `${URL_FERIADOS}/${intiRaymi.id}?version=2` }).flush(null);
    await responderLista();
    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_FERIADOS.borrado);
  });

  it('borrar uno que no es recurrente no agrega el aviso', async () => {
    await abrir('/feriados?anio=2027');
    avisos.confirmarDestructiva.mockResolvedValueOnce({ confirmado: false });
    fila('Aniversario')?.querySelector<HTMLButtonElement>('[data-accion="borrar"]')?.click();
    await pantalla.estable();
    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith(expect.objectContaining({ texto: undefined }));
  });

  it('sin feriados muestra «No hay feriados registrados para 2027»', async () => {
    await abrir('/feriados?anio=2027', ALCANCES_ADMIN, []);
    expect(elemento().textContent).toContain('No hay feriados registrados para 2027');
  });
});
