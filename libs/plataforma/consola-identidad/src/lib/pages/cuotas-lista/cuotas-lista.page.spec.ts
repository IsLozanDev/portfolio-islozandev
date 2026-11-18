import type { TestRequest } from '@angular/common/http/testing';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { abrirConsola, crearDobleAvisos, type ConsolaDePrueba } from '../../../testing/rutas-de-prueba';
import { PERMISOS_CONSOLA_IDENTIDAD } from '../../models/permisos-identidad';

const URL_CUOTAS = `${API_URL}/identidad/cuotas`;
/** 16 de noviembre de 2026, 10:00 en Lima. */
const AHORA = new Date('2026-11-16T15:00:00Z');
const AVISO = '2026-11-10T15:00:00Z';

const fila = (tenantId: string, tenantNombre: string, consumidas: number, avisadoUmbralEn: string | null = null) => ({
  tenant_id: tenantId,
  tenant_nombre: tenantNombre,
  plan: 'BASICO',
  incluidas: 500,
  consumidas,
  porcentaje: Math.trunc((consumidas * 100) / 500),
  avisado_umbral_en: avisadoUmbralEn,
  avisado_agotada_en: null,
  version: 1,
});

const FILAS = [fila('t-1', 'Agotado SAC', 500, AVISO), fila('t-2', 'Umbral SAC', 400, AVISO), fila('t-3', 'Normal SAC', 100)];

describe('CuotasListaPage', () => {
  let consola: ConsolaDePrueba;

  const pedidoCuotas = (): TestRequest => consola.http.expectOne((solicitud) => solicitud.url === URL_CUOTAS);
  const filas = () => [...consola.elemento().querySelectorAll('tr[mat-row]')];
  const chips = () => filas().map((elemento) => elemento.querySelector('vit-chip-estado')?.textContent?.trim());

  async function abrir(ruta: string, respuesta: object = { periodo: '2026-11', items: FILAS, total: 3, pagina: 1, tamano: 20 }): Promise<TestRequest> {
    consola = await abrirConsola(ruta, new DobleSesion().conPermisos(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar), crearDobleAvisos());
    const pedido = pedidoCuotas();
    pedido.flush(respuesta);
    await consola.estable();
    return pedido;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    consola.http.verify();
    vi.useRealTimers();
  });

  it('sin periodo pide el mes actual de Lima, página 1 de 20', async () => {
    const pedido = await abrir('/consola/identidad/cuotas');

    expect(pedido.request.params.toString()).toBe('periodo=2026-11&pagina=1&tamano=20');
  });

  it('pinta los tres estados con su chip, la barra y consumidas / incluidas', async () => {
    await abrir('/consola/identidad/cuotas');

    expect(chips()).toEqual(['Agotada', 'Sobre el umbral', 'Normal']);
    expect(filas()[0].querySelector('vit-chip-estado')?.innerHTML).toContain('bg-contenedor-error');
    expect(filas()[1].querySelector('vit-chip-estado')?.innerHTML).toContain('bg-chip-advertencia');
    expect(filas()[2].querySelector('vit-chip-estado')?.innerHTML).toContain('bg-chip-exito');
    expect(filas()[1].textContent).toContain('400 / 500 · 80 %');
    expect(filas()[0].querySelector('mat-progress-bar')?.classList).toContain('vit-barra-error');
    expect(filas()[0].querySelector('mat-progress-bar')?.getAttribute('aria-label')).toBe('Consumo de Agotado SAC');
  });

  it('el select ofrece el mes actual y los 11 anteriores', async () => {
    await abrir('/consola/identidad/cuotas');
    const pagina = consola.harness.routeDebugElement?.componentInstance as { periodos: { valor: string; etiqueta: string }[] };

    expect(pagina.periodos).toHaveLength(12);
    expect(pagina.periodos[0]).toEqual({ valor: '2026-11', etiqueta: 'noviembre 2026' });
    expect(pagina.periodos[11].valor).toBe('2025-12');
  });

  it('el periodo, la búsqueda y la página de la URL van a la API y precargan la búsqueda', async () => {
    const pedido = await abrir('/consola/identidad/cuotas?periodo=2026-09&q=pollo&pagina=2', { periodo: '2026-09', items: [], total: 0, pagina: 2, tamano: 20 });

    expect(pedido.request.params.toString()).toBe('periodo=2026-09&pagina=2&tamano=20&q=pollo');
    expect(consola.elemento().querySelector<HTMLInputElement>('vit-filtros input')?.value).toBe('pollo');
  });

  it('cambiar el mes lo deja en la URL, vuelve a la página 1 y vuelve a pedir', async () => {
    await abrir('/consola/identidad/cuotas?q=pollo&pagina=3');
    const pagina = consola.harness.routeDebugElement?.componentInstance as { elegirPeriodo: (periodo: string) => void };

    pagina.elegirPeriodo('2026-10');
    await consola.estable();

    expect(consola.url()).toBe('/consola/identidad/cuotas?periodo=2026-10&q=pollo');
    expect(pedidoCuotas().request.params.get('pagina')).toBe('1');
  });

  it('cambiar la búsqueda lo deja en la URL y vuelve a la página 1', async () => {
    await abrir('/consola/identidad/cuotas?pagina=2');
    const filtros = consola.harness.fixture.debugElement.query((nodo) => nodo.name === 'vit-filtros');

    filtros.componentInstance.cambio.emit({ busqueda: ' rosa ' });
    await consola.estable();

    expect(consola.url()).toBe('/consola/identidad/cuotas?periodo=2026-11&q=rosa');
    pedidoCuotas().flush({ periodo: '2026-11', items: [], total: 0, pagina: 1, tamano: 20 });
  });

  it('gana la última consulta: una respuesta vieja no pisa la nueva', async () => {
    consola = await abrirConsola('/consola/identidad/cuotas', new DobleSesion().conPermisos(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar), crearDobleAvisos());
    const vieja = pedidoCuotas();
    const pagina = consola.harness.routeDebugElement?.componentInstance as { elegirPeriodo: (periodo: string) => void };
    pagina.elegirPeriodo('2026-10');
    await consola.estable();
    const nueva = pedidoCuotas();

    nueva.flush({ periodo: '2026-10', items: [fila('t-9', 'Octubre SAC', 10)], total: 1, pagina: 1, tamano: 20 });
    vieja.flush({ periodo: '2026-11', items: FILAS, total: 3, pagina: 1, tamano: 20 });
    await consola.estable();

    expect(filas().map((elemento) => elemento.querySelector('td')?.textContent?.trim())).toEqual(['Octubre SAC']);
  });

  it('el enlace de la fila abre el detalle del tenant en el mes elegido', async () => {
    await abrir('/consola/identidad/cuotas?periodo=2026-10', { periodo: '2026-10', items: FILAS, total: 3, pagina: 1, tamano: 20 });

    expect(filas()[2].querySelector('a')?.getAttribute('href')).toBe('/consola/identidad/cuotas/t-3/2026-10');
  });

  it('sin filas dice que no hay cuotas en el mes', async () => {
    await abrir('/consola/identidad/cuotas', { periodo: '2026-11', items: [], total: 0, pagina: 1, tamano: 20 });

    expect(consola.elemento().querySelector('vit-estado-vacio')?.textContent).toContain('No hay cuotas en noviembre 2026');
  });

  it('sin filas con búsqueda dice que ningún tenant coincide', async () => {
    await abrir('/consola/identidad/cuotas?q=zzz', { periodo: '2026-11', items: [], total: 0, pagina: 1, tamano: 20 });

    expect(consola.elemento().querySelector('vit-estado-vacio')?.textContent).toContain('Ningún tenant coincide con la búsqueda');
  });

  it('mientras carga muestra el indicador', async () => {
    consola = await abrirConsola('/consola/identidad/cuotas', new DobleSesion().conPermisos(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar), crearDobleAvisos());

    expect(consola.elemento().querySelector('vit-cargando')).not.toBeNull();
    pedidoCuotas().flush({ periodo: '2026-11', items: [], total: 0, pagina: 1, tamano: 20 });
  });

  it('403 OPERADOR_REQUERIDO muestra el estado de solo operador, sin tabla', async () => {
    consola = await abrirConsola('/consola/identidad/cuotas', new DobleSesion().conPermisos(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar), crearDobleAvisos());
    pedidoCuotas().flush({ codigo: 'OPERADOR_REQUERIDO', mensaje: 'x' }, { status: 403, statusText: 'Forbidden' });
    await consola.estable();

    expect(consola.elemento().querySelector('vit-estado-vacio')?.textContent).toContain('Esta pantalla solo está disponible para el operador de la plataforma');
    expect(consola.elemento().querySelector('vit-tabla')).toBeNull();
    expect(consola.elemento().querySelector('[role="alert"]')).toBeNull();
  });
});
