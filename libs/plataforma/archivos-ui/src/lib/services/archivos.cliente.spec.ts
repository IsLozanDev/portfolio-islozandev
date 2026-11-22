import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorArchivos } from '../models/error-archivos';
import { ArchivosCliente } from './archivos.cliente';

const ARCHIVO_ID = 'arc-1';
const URL_ARCHIVO = `${API_URL}/archivos/${ARCHIVO_ID}`;
const CARGA = { url: 'https://storage.test/subir', token: 'firma', expira_en: '2026-11-22T12:00:00Z' };
const CARGA_FRONT = { url: 'https://storage.test/subir', token: 'firma', expiraEn: '2026-11-22T12:00:00Z' };
const ESTADO = { archivo_id: ARCHIVO_ID, estado: 'EN_ANALISIS', categoria: 'DOCUMENTO', nombre_original: 'contrato.pdf' };
const VERSION = { numero: 2, estado: 'DISPONIBLE', vigente: true, hash_sha256: 'ab', bytes: 10, mime_real: 'application/pdf', subido_por: 'usr-1', subido_en: '2026-11-22T10:00:00Z' };

describe('ArchivosCliente', () => {
  let cliente: ArchivosCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(ArchivosCliente);
  });

  afterEach(() => http.verify());

  it('categorias pide GET /archivos/categorias y mapea a camelCase', async () => {
    const promesa = cliente.categorias();
    http.expectOne({ method: 'GET', url: `${API_URL}/archivos/categorias` }).flush([{ codigo: 'IMAGEN', mimes_permitidos: ['image/png'], tamano_max_bytes: 100 }]);

    expect(await promesa).toEqual([{ codigo: 'IMAGEN', mimesPermitidos: ['image/png'], tamanoMaxBytes: 100 }]);
  });

  it('solicitarCarga envía el cuerpo en snake_case y devuelve la carga firmada', async () => {
    const promesa = cliente.solicitarCarga({ categoria: 'DOCUMENTO', nombreOriginal: 'contrato.pdf', tamano: 10, mime: 'application/pdf', entidadTipo: 'PRUEBA_DEV', entidadId: 'e-1' });
    const peticion = http.expectOne({ method: 'POST', url: `${API_URL}/archivos/cargas` });
    expect(peticion.request.body).toEqual({ categoria: 'DOCUMENTO', nombre_original: 'contrato.pdf', tamano: 10, mime: 'application/pdf', entidad_tipo: 'PRUEBA_DEV', entidad_id: 'e-1' });
    peticion.flush({ archivo_id: ARCHIVO_ID, carga: CARGA });

    expect(await promesa).toEqual({ archivoId: ARCHIVO_ID, carga: CARGA_FRONT });
  });

  it('confirmarCarga hace POST /{id}/confirmar y mapea el estado', async () => {
    const promesa = cliente.confirmarCarga(ARCHIVO_ID);
    http.expectOne({ method: 'POST', url: `${URL_ARCHIVO}/confirmar` }).flush(ESTADO);

    expect(await promesa).toEqual({ archivoId: ARCHIVO_ID, estado: 'EN_ANALISIS', categoria: 'DOCUMENTO', nombreOriginal: 'contrato.pdf' });
  });

  it('solicitarVersion y confirmarVersion usan las rutas de versiones', async () => {
    const solicitada = cliente.solicitarVersion(ARCHIVO_ID, { tamano: 20, mime: 'image/png' });
    const pedida = http.expectOne({ method: 'POST', url: `${URL_ARCHIVO}/versiones` });
    expect(pedida.request.body).toEqual({ tamano: 20, mime: 'image/png' });
    pedida.flush({ archivo_id: ARCHIVO_ID, numero: 3, carga: CARGA });
    expect(await solicitada).toEqual({ archivoId: ARCHIVO_ID, numero: 3, carga: CARGA_FRONT });

    const confirmada = cliente.confirmarVersion(ARCHIVO_ID, 3);
    http.expectOne({ method: 'POST', url: `${URL_ARCHIVO}/versiones/3/confirmar` }).flush({ ...VERSION, numero: 3, estado: 'EN_ANALISIS', vigente: false });
    expect(await confirmada).toMatchObject({ numero: 3, estado: 'EN_ANALISIS', vigente: false, subidoPor: 'usr-1' });
  });

  it('versiones mapea la lista y la vigente', async () => {
    const promesa = cliente.versiones(ARCHIVO_ID);
    http.expectOne({ method: 'GET', url: `${URL_ARCHIVO}/versiones` }).flush({ archivo_id: ARCHIVO_ID, version_vigente: 2, versiones: [VERSION] });

    expect(await promesa).toEqual({
      archivoId: ARCHIVO_ID,
      versionVigente: 2,
      versiones: [{ numero: 2, estado: 'DISPONIBLE', vigente: true, hashSha256: 'ab', bytes: 10, mimeReal: 'application/pdf', subidoPor: 'usr-1', subidoEn: '2026-11-22T10:00:00Z' }],
    });
  });

  it('marcarVigente hace PATCH /{id}/version-vigente con la versión', async () => {
    const promesa = cliente.marcarVigente(ARCHIVO_ID, 1);
    const peticion = http.expectOne({ method: 'PATCH', url: `${URL_ARCHIVO}/version-vigente` });
    expect(peticion.request.body).toEqual({ version: 1 });
    peticion.flush({ ...ESTADO, estado: 'DISPONIBLE', version_vigente: 1 });

    expect(await promesa).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 1 });
  });

  it('estado mapea la versión en curso y el rechazo de versión', async () => {
    const promesa = cliente.estado(ARCHIVO_ID);
    http.expectOne({ method: 'GET', url: URL_ARCHIVO }).flush({
      ...ESTADO,
      estado: 'DISPONIBLE',
      version_en_curso: { numero: 3, estado: 'EN_ANALISIS' },
      rechazo_version: { motivo: 'IDENTICA', version_coincidente: 2, mensaje: 'El archivo es idéntico a la versión vigente' },
    });

    expect(await promesa).toMatchObject({
      versionEnCurso: { numero: 3, estado: 'EN_ANALISIS' },
      rechazoVersion: { motivo: 'IDENTICA', versionCoincidente: 2, mensaje: 'El archivo es idéntico a la versión vigente' },
    });
  });

  it('urlDescarga pide attachment y la versión solo si se indica', async () => {
    const vigente = cliente.urlDescarga(ARCHIVO_ID);
    http.expectOne(`${URL_ARCHIVO}/descarga?disposicion=attachment`).flush({ url: 'https://storage.test/bajar', expira_en: '2026-11-22T12:00:00Z' });
    expect(await vigente).toEqual({ url: 'https://storage.test/bajar', expiraEn: '2026-11-22T12:00:00Z' });

    const anterior = cliente.urlDescarga(ARCHIVO_ID, 1);
    http.expectOne(`${URL_ARCHIVO}/descarga?disposicion=attachment&version=1`).flush({ url: 'https://storage.test/v1', expira_en: '2026-11-22T12:00:00Z' });
    expect((await anterior).url).toBe('https://storage.test/v1');
  });

  it('un error de la API sale como ErrorArchivos con código, mensaje y estado', async () => {
    const promesa = cliente.solicitarVersion(ARCHIVO_ID, { tamano: 20, mime: 'image/png' });
    http.expectOne(`${URL_ARCHIVO}/versiones`).flush({ codigo: 'VERSION_EN_CURSO', mensaje: 'Ya hay una versión en curso', numero: 3 }, { status: 409, statusText: 'Conflict' });

    const error = await promesa.catch((fallo: unknown) => fallo);
    expect(error).toBeInstanceOf(ErrorArchivos);
    expect(error).toMatchObject({ codigo: 'VERSION_EN_CURSO', message: 'Ya hay una versión en curso', estado: 409 });
  });
});
