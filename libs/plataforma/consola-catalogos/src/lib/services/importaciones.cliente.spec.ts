import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorCatalogos, ErrorFilasInvalidas } from '../models/error-catalogos';
import { ImportacionesCliente } from './importaciones.cliente';

const ID = '0193f3a0-0000-7000-8000-00000000a001';
const RESUMEN = { altas: 18, cambios: 0, bajas: 0, sin_cambios: 1874 };
const LISTADA = {
  id: ID,
  estado: 'EN_COLA',
  version_oficial: '2026-06',
  fecha_vigencia: '2026-06-01',
  archivo_nombre: 'ubigeo.csv',
  archivo_sha256: 'abc',
  resumen: RESUMEN,
  total_errores: 0,
  motivo_fallo: null,
  lanzado_por: 'u-1',
  creado_en: '2026-11-08T15:00:00.000Z',
  aplicado_por: null,
  terminado_en: null,
};

describe('ImportacionesCliente', () => {
  let cliente: ImportacionesCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(ImportacionesCliente);
  });

  afterEach(() => http.verify());

  it('previsualizar envía multipart con archivo, versión oficial y fecha, y mapea la muestra (TR-CA-072)', async () => {
    const archivo = new File(['codigo,descripcion'], 'ubigeo.csv', { type: 'text/csv' });
    const promesa = cliente.previsualizar('UBIGEO', { archivo, versionOficial: '2026-06', fechaVigencia: '2026-06-01' });
    const peticion = http.expectOne({ method: 'POST', url: `${API_URL}/catalogos/UBIGEO/importaciones` });
    const cuerpo = peticion.request.body as FormData;
    expect([cuerpo.get('version_oficial'), cuerpo.get('fecha_vigencia'), (cuerpo.get('archivo') as File).name]).toEqual(['2026-06', '2026-06-01', 'ubigeo.csv']);
    peticion.flush({
      id: ID,
      version: 0,
      estado: 'PREVISUALIZADA',
      version_oficial: '2026-06',
      fecha_vigencia: '2026-06-01',
      archivo_sha256: 'abc',
      resumen: { ...RESUMEN, total_filas: 1892 },
      muestra: {
        altas: [{ fila: 2, codigo: '150144', codigo_externo: null, nombre: 'Nuevo distrito', abreviatura: null, orden: 0, atributos: {} }],
        cambios: [],
        bajas: [{ item_id: 'i-9', codigo: '150199', nombre: 'Viejo', vigente_hasta: '2026-05-31' }],
      },
      vence_en: '2026-11-09T15:00:00.000Z',
    });

    expect(await promesa).toEqual({
      id: ID,
      version: 0,
      estado: 'PREVISUALIZADA',
      versionOficial: '2026-06',
      fechaVigencia: '2026-06-01',
      resumen: { altas: 18, cambios: 0, bajas: 0, sinCambios: 1874, totalFilas: 1892 },
      muestra: {
        altas: [{ fila: 2, codigo: '150144', codigoExterno: null, nombre: 'Nuevo distrito', abreviatura: null, orden: 0, atributos: {} }],
        cambios: [],
        bajas: [{ itemId: 'i-9', codigo: '150199', nombre: 'Viejo', vigenteHasta: '2026-05-31' }],
      },
      venceEn: '2026-11-09T15:00:00.000Z',
    });
  });

  it('el 422 sale como ErrorFilasInvalidas con el total y los primeros errores (TR-CA-073)', async () => {
    const archivo = new File(['x'], 'cie10.csv');
    const promesa = cliente.previsualizar('CIE10', { archivo, versionOficial: '2026', fechaVigencia: '2026-01-01' });
    const errores = [{ fila: 2, columna: 'codigo', valor: '', mensaje: 'Obligatorio' }];
    http
      .expectOne(`${API_URL}/catalogos/CIE10/importaciones`)
      .flush(
        { codigo: 'FILAS_INVALIDAS', mensaje: 'El archivo tiene filas inválidas', importacion_id: ID, total_errores: 3000, errores },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

    const error = await promesa.catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(ErrorFilasInvalidas);
    expect((error as ErrorFilasInvalidas).filas).toEqual({ importacionId: ID, totalErrores: 3000, errores });
  });

  it('el 400 de cabecera sale como ErrorCatalogos con el mensaje de la API', async () => {
    const promesa = cliente.previsualizar('CIE10', { archivo: new File(['x'], 'cie10.csv'), versionOficial: '2026', fechaVigencia: '2026-01-01' });
    http
      .expectOne(`${API_URL}/catalogos/CIE10/importaciones`)
      .flush({ codigo: 'COLUMNAS_INVALIDAS', mensaje: 'Falta la columna descripcion' }, { status: 400, statusText: 'Bad Request' });

    const error = await promesa.catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(ErrorCatalogos);
    expect(error).not.toBeInstanceOf(ErrorFilasInvalidas);
    expect(error).toMatchObject({ codigo: 'COLUMNAS_INVALIDAS', message: 'Falta la columna descripcion' });
  });

  it('aplicar envía la versión y devuelve la importación encolada', async () => {
    const promesa = cliente.aplicar(ID, 0);
    const peticion = http.expectOne({ method: 'POST', url: `${API_URL}/catalogos/importaciones/${ID}/aplicar` });
    expect(peticion.request.body).toEqual({ version: 0 });
    peticion.flush({ id: ID, estado: 'EN_COLA' });
    expect(await promesa).toEqual({ id: ID, estado: 'EN_COLA' });
  });

  it('IMPORTACION_NO_APLICABLE sin mensaje usa el texto de la consola', async () => {
    const promesa = cliente.aplicar(ID, 0);
    http.expectOne(`${API_URL}/catalogos/importaciones/${ID}/aplicar`).flush({ codigo: 'IMPORTACION_NO_APLICABLE' }, { status: 409, statusText: 'Conflict' });
    expect(await promesa.catch((causa: unknown) => causa)).toMatchObject({ message: 'La previsualización venció; vuelva a cargar el archivo' });
  });

  it('historial pide la página y mapea los items', async () => {
    const promesa = cliente.historial('UBIGEO', { pagina: 2, tamano: 20 });
    http.expectOne({ method: 'GET', url: `${API_URL}/catalogos/UBIGEO/importaciones?pagina=2&tamano=20` }).flush({ items: [{ ...LISTADA, estado: 'APLICADA' }], total: 21 });

    const historial = await promesa;
    expect(historial.total).toBe(21);
    expect(historial.items[0]).toMatchObject({ id: ID, estado: 'APLICADA', archivoNombre: 'ubigeo.csv', resumen: { altas: 18, sinCambios: 1874 } });
  });

  it('activas pide ?activas=true y trae el avance', async () => {
    const promesa = cliente.activas();
    http.expectOne({ method: 'GET', url: `${API_URL}/catalogos/importaciones?activas=true` }).flush([{ ...LISTADA, avance: 42 }]);
    expect(await promesa).toEqual([expect.objectContaining({ id: ID, estado: 'EN_COLA', avance: 42 })]);
  });

  it('detalle trae el código del catálogo, el estado y el vencimiento', async () => {
    const promesa = cliente.detalle(ID);
    http
      .expectOne({ method: 'GET', url: `${API_URL}/catalogos/importaciones/${ID}` })
      .flush({ ...LISTADA, codigo: 'UBIGEO', estado: 'EN_PROCESO', avance: 42, vence_en: '2026-11-09T15:00:00.000Z' });
    expect(await promesa).toMatchObject({ id: ID, codigo: 'UBIGEO', estado: 'EN_PROCESO', avance: 42, venceEn: '2026-11-09T15:00:00.000Z' });
  });

  it('descargarErrores pide el CSV con HttpClient y lo descarga con el nombre de Content-Disposition', async () => {
    const crearUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:prueba');
    const liberarUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect([this.href, this.download]).toEqual(['blob:prueba', 'errores-CIE10-2026-11-08.csv']);
    });

    const promesa = cliente.descargarErrores(ID);
    const peticion = http.expectOne({ method: 'GET', url: `${API_URL}/catalogos/importaciones/${ID}/errores.csv` });
    expect(peticion.request.responseType).toBe('blob');
    peticion.flush(new Blob(['fila;columna;valor;mensaje']), { headers: { 'Content-Disposition': 'attachment; filename="errores-CIE10-2026-11-08.csv"' } });
    await promesa;

    expect(clic).toHaveBeenCalledTimes(1);
    expect(liberarUrl).toHaveBeenCalledWith('blob:prueba');
    crearUrl.mockRestore();
    liberarUrl.mockRestore();
    clic.mockRestore();
  });
});
