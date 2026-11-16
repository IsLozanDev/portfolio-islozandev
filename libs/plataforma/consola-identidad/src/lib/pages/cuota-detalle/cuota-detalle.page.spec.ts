import type { TestRequest } from '@angular/common/http/testing';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { abrirConsola, crearDobleAvisos, type ConsolaDePrueba, type DobleAvisos } from '../../../testing/rutas-de-prueba';
import { PERMISOS_CONSOLA_IDENTIDAD } from '../../models/permisos-identidad';

const TENANT_ID = 't-1';
const URL_DETALLE_ACTUAL = `${API_URL}/identidad/cuotas/${TENANT_ID}/2026-11`;
/** 16 de noviembre de 2026, 10:00 en Lima. */
const AHORA = new Date('2026-11-16T15:00:00Z');
const CONSULTAS = { CACHE: 40, PROVEEDOR: 70, NO_ENCONTRADO: 5, INVALIDO: 2, CUOTA_AGOTADA: 0, PROVEEDOR_NO_DISPONIBLE: 3 };

const detalle = (cambios: object = {}) => ({
  tenant_id: TENANT_ID,
  tenant_nombre: 'Pollería Doña Rosa',
  plan: 'BASICO',
  incluidas: 500,
  consumidas: 120,
  porcentaje: 24,
  avisado_umbral_en: null,
  avisado_agotada_en: null,
  version: 3,
  periodo: '2026-11',
  creada_en: '2026-11-01T05:00:00Z',
  consultas_por_resultado: CONSULTAS,
  ...cambios,
});

describe('CuotaDetallePage', () => {
  let consola: ConsolaDePrueba;
  let avisos: DobleAvisos;

  const elemento = (selector: string) => consola.elemento().querySelector<HTMLElement>(selector);
  const panel = () => document.querySelector<HTMLElement>('vit-panel-ajuste-cuota');
  const pedido = (url: string): TestRequest => consola.http.expectOne(url);

  async function abrir(periodo = '2026-11', respuesta: object = detalle()): Promise<void> {
    avisos = crearDobleAvisos();
    consola = await abrirConsola(`/consola/identidad/cuotas/${TENANT_ID}/${periodo}`, new DobleSesion().conPermisos(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar), avisos);
    pedido(`${API_URL}/identidad/cuotas/${TENANT_ID}/${periodo}`).flush(respuesta);
    await consola.estable();
  }

  async function abrirPanel(): Promise<void> {
    elemento('[data-accion="ajustar"]')?.click();
    await consola.estable();
  }

  async function escribirIncluidas(valor: string): Promise<void> {
    const campo = panel()?.querySelector<HTMLInputElement>('[data-campo="incluidas"]');
    if (!campo) throw new Error('El panel no está abierto');
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    campo.dispatchEvent(new Event('blur'));
    await consola.estable();
  }

  async function guardar(): Promise<void> {
    panel()?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await consola.estable();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });

  afterEach(async () => {
    panel()?.querySelector<HTMLButtonElement>('vit-acciones-formulario button[type="button"]')?.click();
    await consola.estable();
    consola.http.verify();
    vi.useRealTimers();
  });

  it('muestra tenant, mes, plan, chip, barra grande, avisos y las seis cuentas con su total', async () => {
    await abrir('2026-11', detalle({ consumidas: 400, porcentaje: 80, avisado_umbral_en: '2026-11-10T15:00:00Z' }));

    expect(elemento('h1')?.textContent?.trim()).toBe('Pollería Doña Rosa');
    expect(consola.elemento().textContent).toContain('noviembre 2026 · Plan BASICO');
    expect(elemento('vit-chip-estado')?.textContent?.trim()).toBe('Sobre el umbral');
    expect(elemento('[data-consumo]')?.textContent?.trim()).toBe('400 de 500 (80 %)');
    expect(elemento('mat-progress-bar')?.classList).toContain('vit-barra-grande');
    expect(elemento('[data-aviso="umbral"]')?.textContent?.trim()).toBe('Enviado el 10/11/26, 10:00 a. m.');
    expect(elemento('[data-aviso="agotada"]')?.textContent?.trim()).toBe('Sin aviso');
    const filas = [...consola.elemento().querySelectorAll('[data-tabla="consultas"] tbody tr')].map((fila) =>
      [...fila.querySelectorAll('td')].map((celda) => celda.textContent?.trim()).join(' '),
    );
    expect(filas).toEqual([
      'Desde caché 40',
      'Al proveedor 70',
      'No encontrado 5',
      'Inválido 2',
      'Rechazada por cuota 0',
      'Proveedor no disponible 3',
    ]);
    expect(elemento('[data-total]')?.textContent?.trim()).toBe('120');
  });

  it('en un mes pasado no muestra «Ajustar incluidas»', async () => {
    await abrir('2026-10', detalle({ periodo: '2026-10' }));

    expect(elemento('[data-accion="ajustar"]')).toBeNull();
  });

  it('el enlace de vuelta lleva a la lista en el mismo mes', async () => {
    await abrir('2026-10', detalle({ periodo: '2026-10' }));

    expect(elemento('[data-accion="volver"]')?.getAttribute('href')).toBe('/consola/identidad/cuotas?periodo=2026-10');
  });

  it('ajustar a 800 manda PATCH { incluidas: 800, version }, avisa y recarga en 120 de 800', async () => {
    await abrir();
    await abrirPanel();
    expect(panel()?.querySelector<HTMLInputElement>('[data-campo="incluidas"]')?.value).toBe('500');

    await escribirIncluidas('800');
    await guardar();
    const patch = consola.http.expectOne({ method: 'PATCH', url: URL_DETALLE_ACTUAL });
    expect(patch.request.body).toEqual({ incluidas: 800, version: 3 });
    patch.flush({});
    await consola.estable();
    pedido(URL_DETALLE_ACTUAL).flush(detalle({ incluidas: 800, porcentaje: 15, version: 4 }));
    await consola.estable();

    expect(panel()).toBeNull();
    expect(avisos.toast).toHaveBeenCalledWith('exito', 'Cuota ajustada');
    expect(elemento('[data-consumo]')?.textContent?.trim()).toBe('120 de 800 (15 %)');
  });

  it('no deja guardar menos que las consumidas ni un decimal', async () => {
    await abrir();
    await abrirPanel();

    await escribirIncluidas('100');
    await guardar();
    expect(panel()?.querySelector('[data-error="incluidas"]')?.textContent?.trim()).toBe('Ya se consumieron 120: el mínimo es 120.');

    await escribirIncluidas('150.5');
    await guardar();
    expect(panel()?.querySelector('[data-error="incluidas"]')?.textContent?.trim()).toBe('Ingrese un número entero.');
    consola.http.expectNone({ method: 'PATCH', url: URL_DETALLE_ACTUAL });
  });

  it('422 INCLUIDAS_MENOR_QUE_CONSUMIDAS va bajo el campo y el panel sigue abierto', async () => {
    await abrir();
    await abrirPanel();
    await escribirIncluidas('130');
    await guardar();

    consola.http
      .expectOne({ method: 'PATCH', url: URL_DETALLE_ACTUAL })
      .flush({ codigo: 'INCLUIDAS_MENOR_QUE_CONSUMIDAS', mensaje: 'x' }, { status: 422, statusText: 'Unprocessable Entity' });
    await consola.estable();

    expect(panel()?.querySelector('[data-error="incluidas"]')?.textContent?.trim()).toBe('Las incluidas no pueden ser menos que las ya consumidas.');
  });

  it('409 VERSION_OBSOLETA avisa, recarga el detalle y el panel sigue abierto con la versión nueva', async () => {
    await abrir();
    await abrirPanel();
    await escribirIncluidas('800');
    await guardar();

    consola.http.expectOne({ method: 'PATCH', url: URL_DETALLE_ACTUAL }).flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'x' }, { status: 409, statusText: 'Conflict' });
    await consola.estable();
    pedido(URL_DETALLE_ACTUAL).flush(detalle({ consumidas: 130, porcentaje: 26, version: 5 }));
    await consola.estable();

    expect(panel()).not.toBeNull();
    expect(panel()?.querySelector('[data-error="panel"]')?.textContent).toContain('La cuota cambió mientras la editabas');
    expect(elemento('[data-consumo]')?.textContent?.trim()).toBe('130 de 500 (26 %)');

    await guardar();
    const reintento = consola.http.expectOne({ method: 'PATCH', url: URL_DETALLE_ACTUAL });
    expect(reintento.request.body).toEqual({ incluidas: 800, version: 5 });
    reintento.flush({});
    await consola.estable();
    pedido(URL_DETALLE_ACTUAL).flush(detalle({ incluidas: 800, version: 6 }));
    await consola.estable();
  });

  it('404 CUOTA_NO_ENCONTRADA dice que el tenant no tiene cuota en ese mes, con enlace a la lista', async () => {
    avisos = crearDobleAvisos();
    consola = await abrirConsola(`/consola/identidad/cuotas/${TENANT_ID}/2026-10`, new DobleSesion().conPermisos(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar), avisos);
    pedido(`${API_URL}/identidad/cuotas/${TENANT_ID}/2026-10`).flush({ codigo: 'CUOTA_NO_ENCONTRADA', mensaje: 'x' }, { status: 404, statusText: 'Not Found' });
    await consola.estable();

    const vacio = elemento('vit-estado-vacio');
    expect(vacio?.textContent).toContain('Este tenant no tiene cuota en octubre 2026');
    expect(vacio?.querySelector('a')?.getAttribute('href')).toBe('/consola/identidad/cuotas?periodo=2026-10');
  });

  it('403 OPERADOR_REQUERIDO muestra el estado de solo operador', async () => {
    avisos = crearDobleAvisos();
    consola = await abrirConsola(`/consola/identidad/cuotas/${TENANT_ID}/2026-11`, new DobleSesion().conPermisos(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar), avisos);
    pedido(URL_DETALLE_ACTUAL).flush({ codigo: 'OPERADOR_REQUERIDO', mensaje: 'x' }, { status: 403, statusText: 'Forbidden' });
    await consola.estable();

    expect(elemento('vit-estado-vacio')?.textContent).toContain('Esta pantalla solo está disponible para el operador de la plataforma');
    expect(elemento('[data-accion="ajustar"]')).toBeNull();
  });
});
