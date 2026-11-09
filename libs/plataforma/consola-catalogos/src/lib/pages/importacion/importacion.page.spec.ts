import type { TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { abrirConsola, crearDobleAvisos, Destino, type ConsolaDePrueba, type DobleAvisos } from '../../../testing/rutas-de-prueba';
import { MENSAJES_IMPORTACION } from '../../models/mensajes-catalogos';
import { PERMISOS_CATALOGOS } from '../../models/permisos-catalogos';
import { SeguimientoImportacionesService } from '../../services/seguimiento-importaciones.service';

const URL_CATALOGOS = `${API_URL}/catalogos`;
const URL_PREVISUALIZAR = `${URL_CATALOGOS}/UBIGEO/importaciones`;
const ID = '0193f3a0-0000-7000-8000-00000000a001';
const MEGABYTE = 1024 * 1024;
/** El detalle como destino vacío: así no pide nada al llegar. */
const DETALLE_VACIO = [{ path: 'UBIGEO', component: Destino }];

const catalogo = (codigo: string, importable: boolean) => ({
  id: `c-${codigo}`,
  codigo,
  nombre: `Catálogo ${codigo}`,
  alcance: 'GLOBAL',
  fuente: 'INEI',
  editable_por_tenant: false,
  version: 4,
  importable,
});

const alta = (indice: number) => ({ fila: indice + 2, codigo: `1501${indice}`, codigo_externo: null, nombre: `Distrito ${indice}`, abreviatura: null, orden: 0, atributos: {} });

function previsualizacion(bajas = 0) {
  return {
    id: ID,
    version: 0,
    estado: 'PREVISUALIZADA',
    version_oficial: 'INEI 2026-10',
    fecha_vigencia: '2026-11-01',
    archivo_sha256: 'a'.repeat(64),
    resumen: { altas: 18, cambios: 1, bajas, sin_cambios: 1874, total_filas: 1892 + bajas },
    muestra: {
      altas: Array.from({ length: 18 }, (_, indice) => alta(indice)),
      cambios: [
        {
          antes: { id: 'i-1', codigo: '150101', codigo_externo: null, nombre: 'Lima', abreviatura: null, orden: 0, atributos: {}, vigente_desde: '2026-01-01', vigente_hasta: null, activo: true },
          despues: { fila: 3, codigo: '150101', codigo_externo: null, nombre: 'Lima Cercado', abreviatura: null, orden: 0, atributos: {} },
        },
      ],
      bajas: Array.from({ length: bajas }, (_, indice) => ({ item_id: `b-${indice}`, codigo: `1599${indice}`, nombre: 'Viejo', vigente_hasta: '2026-10-31' })),
    },
    vence_en: '2026-11-09T15:42:00.000Z',
  };
}

describe('ImportacionPage', () => {
  let sesion: DobleSesion;
  let avisos: DobleAvisos;
  let consola: ConsolaDePrueba;

  const elemento = () => consola.elemento();
  const pasoActual = () => elemento().querySelector('.mat-step-header[aria-selected="true"]')?.textContent?.trim();
  const accion = (nombre: string) => elemento().querySelector<HTMLButtonElement>(`[data-accion="${nombre}"]`);

  async function abrir(catalogos = [catalogo('UBIGEO', true), catalogo('MEDIO_PAGO', false)], ruta = '/consola/catalogos/UBIGEO/importar'): Promise<void> {
    consola = await abrirConsola(ruta, sesion, avisos, DETALLE_VACIO);
    consola.http.expectOne({ method: 'GET', url: URL_CATALOGOS }).flush(catalogos);
    await consola.estable();
  }

  async function elegir(archivo: File): Promise<void> {
    const entrada = elemento().querySelector<HTMLInputElement>('[data-campo="archivo"]');
    if (!entrada) throw new Error('sin selector de archivo');
    Object.defineProperty(entrada, 'files', { configurable: true, value: { 0: archivo, length: 1, item: () => archivo } });
    entrada.dispatchEvent(new Event('change'));
    await consola.estable();
  }

  async function escribir(nombre: string, valor: string): Promise<void> {
    const entrada = elemento().querySelector<HTMLInputElement>(`[data-campo="${nombre}"]`);
    if (!entrada) throw new Error(`sin campo ${nombre}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    entrada.dispatchEvent(new Event('blur'));
    await consola.estable();
  }

  async function llenarPaso1(archivo = new File(['codigo,descripcion'], 'ubigeo.csv', { type: 'text/csv' })): Promise<void> {
    await elegir(archivo);
    await escribir('versionOficial', 'INEI 2026-10');
    await escribir('fechaVigencia', '01/11/2026');
  }

  async function previsualizar(): Promise<void> {
    accion('previsualizar')?.click();
    await consola.estable();
  }

  async function llegarAlPaso2(bajas = 0): Promise<void> {
    await abrir();
    await llenarPaso1();
    await previsualizar();
    consola.http.expectOne({ method: 'POST', url: URL_PREVISUALIZAR }).flush(previsualizacion(bajas), { status: 201, statusText: 'Created' });
    await consola.estable();
  }

  const esperarAplicar = (): TestRequest => consola.http.expectOne({ method: 'POST', url: `${URL_CATALOGOS}/importaciones/${ID}/aplicar` });

  beforeEach(() => {
    sesion = new DobleSesion();
    sesion.contexto.set({ permisos: [PERMISOS_CATALOGOS.leer, PERMISOS_CATALOGOS.importar], mfaVigente: true });
    avisos = crearDobleAvisos();
  });

  afterEach(() => consola.http.verify());

  it('un archivo de 21 MB no se envía', async () => {
    await abrir();
    const grande = new File(['x'], 'ubigeo.csv');
    Object.defineProperty(grande, 'size', { value: 21 * MEGABYTE });
    await llenarPaso1(grande);
    await previsualizar();

    consola.http.expectNone(URL_PREVISUALIZAR);
    expect(elemento().querySelector('[data-error="archivo"]')?.textContent).toContain(MENSAJES_IMPORTACION.archivoGrande);
  });

  it('un .pdf no se envía', async () => {
    await abrir();
    await llenarPaso1(new File(['x'], 'ubigeo.pdf', { type: 'application/pdf' }));
    await previsualizar();

    consola.http.expectNone(URL_PREVISUALIZAR);
    expect(elemento().querySelector('[data-error="archivo"]')?.textContent).toContain(MENSAJES_IMPORTACION.archivoTipo);
  });

  it('TR-CA-073: el 422 muestra el total, los 100 errores y la descarga, y no avanza', async () => {
    await abrir();
    await llenarPaso1();
    await previsualizar();
    const errores = Array.from({ length: 100 }, (_, indice) => ({ fila: indice + 2, columna: 'codigo', valor: '', mensaje: 'Obligatorio' }));
    consola.http
      .expectOne({ method: 'POST', url: URL_PREVISUALIZAR })
      .flush({ codigo: 'FILAS_INVALIDAS', mensaje: 'Filas inválidas', importacion_id: ID, total_errores: 3000, errores }, { status: 422, statusText: 'Unprocessable Entity' });
    await consola.estable();

    expect(elemento().querySelector('[data-total-errores]')?.textContent).toContain('Se encontraron 3000 errores; se muestran los primeros 100');
    expect(pasoActual()).toContain('Archivo');
    expect(elemento().querySelector('vit-errores-importacion mat-paginator')?.textContent).toContain('de 100');
    expect(accion('descargar-errores')).not.toBeNull();
    expect(accion('aplicar')).toBeNull();
  });

  it('el 400 de cabecera va como alerta sobre el paso 1', async () => {
    await abrir();
    await llenarPaso1();
    await previsualizar();
    consola.http
      .expectOne({ method: 'POST', url: URL_PREVISUALIZAR })
      .flush({ codigo: 'COLUMNAS_INVALIDAS', mensaje: 'Falta la columna descripcion' }, { status: 400, statusText: 'Bad Request' });
    await consola.estable();

    expect(elemento().querySelector('[data-error="api"]')?.textContent).toContain('Falta la columna descripcion');
  });

  it('TR-CA-072: el 201 pasa al paso 2 con 18 altas, la muestra y el vencimiento', async () => {
    await llegarAlPaso2();

    expect(pasoActual()).toContain('Previsualización');
    expect(elemento().querySelector('[data-contador="Altas"]')?.textContent).toContain('18');
    expect(elemento().querySelectorAll('[data-muestra="altas"] tr[mat-row]')).toHaveLength(18);
    expect(elemento().querySelector('[data-vencimiento]')?.textContent).toContain('Puede aplicarla hasta el 09/11/2026 10:42');
  });

  it('un doble clic en «Previsualizar» envía una sola petición (TR-RNF-008)', async () => {
    await abrir();
    await llenarPaso1();
    accion('previsualizar')?.click();
    accion('previsualizar')?.click();
    await consola.estable();

    consola.http.expectOne({ method: 'POST', url: URL_PREVISUALIZAR }).flush(previsualizacion(), { status: 201, statusText: 'Created' });
    await consola.estable();
  });

  it('con bajas pide confirmación destructiva con el número de ítems', async () => {
    await llegarAlPaso2(3);
    avisos.confirmarDestructiva.mockResolvedValue({ confirmado: false });
    accion('aplicar')?.click();
    await consola.estable();

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith({
      titulo: '¿Aplicar la importación?',
      texto: 'Se cerrará la vigencia de 3 ítems',
      textoConfirmar: 'Aplicar y cerrar 3 vigencias',
    });
    expect(avisos.confirmar).not.toHaveBeenCalled();
    consola.http.expectNone(`${URL_CATALOGOS}/importaciones/${ID}/aplicar`);
  });

  it('sin bajas pide la confirmación normal; el 202 llama a seguir y navega a ?pestana=importaciones', async () => {
    await llegarAlPaso2();
    const seguir = vi.spyOn(TestBed.inject(SeguimientoImportacionesService), 'seguir').mockImplementation(() => undefined);
    accion('aplicar')?.click();
    await consola.estable();

    expect(avisos.confirmar).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Aplicar la importación?' }));
    expect(avisos.confirmarDestructiva).not.toHaveBeenCalled();
    const peticion = esperarAplicar();
    expect(peticion.request.body).toEqual({ version: 0 });
    peticion.flush({ id: ID, estado: 'EN_COLA' }, { status: 202, statusText: 'Accepted' });
    await consola.estable();

    expect(seguir).toHaveBeenCalledWith(ID, 'UBIGEO');
    expect(avisos.toast).toHaveBeenCalledWith('info', MENSAJES_IMPORTACION.enCola);
    expect(consola.url()).toBe('/consola/catalogos/UBIGEO?pestana=importaciones');
  });

  it('IMPORTACION_NO_APLICABLE vuelve al paso 1 con «La previsualización venció»', async () => {
    await llegarAlPaso2();
    accion('aplicar')?.click();
    await consola.estable();
    esperarAplicar().flush({ codigo: 'IMPORTACION_NO_APLICABLE', mensaje: 'La importación está VENCIDA' }, { status: 409, statusText: 'Conflict' });
    await consola.estable();

    expect(elemento().querySelector('[data-error="api"]')?.textContent).toContain(MENSAJES_IMPORTACION.vencida);
    expect(pasoActual()).toContain('Archivo');
    expect(accion('aplicar')).toBeNull();
    expect(accion('previsualizar')).not.toBeNull();
  });

  it('COLA_NO_DISPONIBLE avisa y se queda en el paso 2', async () => {
    await llegarAlPaso2();
    accion('aplicar')?.click();
    await consola.estable();
    esperarAplicar().flush({ codigo: 'COLA_NO_DISPONIBLE', mensaje: 'Cola caída' }, { status: 503, statusText: 'Service Unavailable' });
    await consola.estable();

    expect(elemento().querySelector('[data-error="api"]')?.textContent).toContain(MENSAJES_IMPORTACION.colaNoDisponible);
    expect(pasoActual()).toContain('Previsualización');
  });

  it('un catálogo no importable muestra «Este catálogo no se importa»', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_CATALOGOS.leer, PERMISOS_CATALOGOS.importar], mfaVigente: true });
    await abrir(undefined, '/consola/catalogos/MEDIO_PAGO/importar');

    expect(elemento().textContent).toContain(MENSAJES_IMPORTACION.noImportable);
    expect(accion('previsualizar')).toBeNull();
  });

  it('sin MFA vigente no carga nada y lleva a verificar', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_CATALOGOS.leer, PERMISOS_CATALOGOS.importar], mfaVigente: false });
    consola = await abrirConsola('/consola/catalogos/UBIGEO/importar', sesion, avisos, DETALLE_VACIO);

    consola.http.expectNone(URL_CATALOGOS);
    expect(consola.url()).toBe('/auth/mfa?returnUrl=%2Fconsola%2Fcatalogos%2FUBIGEO%2Fimportar');
  });

  it('«Cancelar» vuelve al detalle sin llamar a la API', async () => {
    await abrir();
    accion('cancelar')?.click();
    await consola.estable();

    expect(consola.url()).toBe('/consola/catalogos/UBIGEO');
  });

  it('sin plat.catalogo.importar la ruta lleva a /403', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_CATALOGOS.leer], mfaVigente: true });
    consola = await abrirConsola('/consola/catalogos/UBIGEO/importar', sesion, avisos, DETALLE_VACIO);
    expect(consola.url()).toBe('/403');
  });
});
