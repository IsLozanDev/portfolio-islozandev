import { AlmacenNoDisponibleError } from '../src/domain/errores.js';
import { AlmacenArchivosSupabase, type BucketStorage } from '../src/infrastructure/supabase/almacen-archivos.supabase.js';
import { pdf } from './support/contenidos.js';
import { RelojFijo } from './support/reloj-fijo.js';

const RUTA = '33000000-0000-4000-8000-00000000000a/33000000-0000-4000-8000-0000000000a1/1';
const URL_CARGA = `https://proyecto.supabase.co/storage/v1/object/upload/sign/archivos/${RUTA}?token=tok-carga`;
const URL_DESCARGA = `https://proyecto.supabase.co/storage/v1/object/sign/archivos/${RUTA}?token=tok-descarga`;
const AHORA = '2026-11-18T15:00:00.000Z';
const VIGENCIA_SEGUNDOS = 900;
const ERROR_INTERNO = { name: 'StorageApiError', status: 500, statusCode: 'InternalError', message: `falló ${RUTA}` };

type Llamada = [metodo: string, ...argumentos: unknown[]];

/** Doble del cliente de Storage para un bucket: registra las llamadas y responde lo que se le programe. */
class BucketDoble implements BucketStorage {
  readonly llamadas: Llamada[] = [];
  respuestaCarga: Awaited<ReturnType<BucketStorage['createSignedUploadUrl']>> = { data: { signedUrl: URL_CARGA, token: 'tok-carga' }, error: null };
  respuestaDescarga: Awaited<ReturnType<BucketStorage['createSignedUrl']>> = { data: { signedUrl: URL_DESCARGA }, error: null };
  respuestaLectura: Awaited<ReturnType<BucketStorage['download']>> = { data: new Blob([new Uint8Array(pdf())]), error: null };
  respuestaBorrado: Awaited<ReturnType<BucketStorage['remove']>> = { data: [], error: null };
  respuestaSubida: Awaited<ReturnType<BucketStorage['upload']>> = { data: { path: RUTA }, error: null };

  upload(...argumentos: unknown[]) {
    this.llamadas.push(['upload', ...argumentos]);
    return Promise.resolve(this.respuestaSubida);
  }

  createSignedUploadUrl(...argumentos: unknown[]) {
    this.llamadas.push(['createSignedUploadUrl', ...argumentos]);
    return Promise.resolve(this.respuestaCarga);
  }

  createSignedUrl(...argumentos: unknown[]) {
    this.llamadas.push(['createSignedUrl', ...argumentos]);
    return Promise.resolve(this.respuestaDescarga);
  }

  download(...argumentos: unknown[]) {
    this.llamadas.push(['download', ...argumentos]);
    return Promise.resolve(this.respuestaLectura);
  }

  remove(...argumentos: unknown[]) {
    this.llamadas.push(['remove', ...argumentos]);
    return Promise.resolve(this.respuestaBorrado);
  }
}

describe('AlmacenArchivosSupabase', () => {
  let bucket: BucketDoble;
  let almacen: AlmacenArchivosSupabase;

  beforeEach(() => {
    bucket = new BucketDoble();
    almacen = new AlmacenArchivosSupabase(bucket, new RelojFijo(AHORA));
  });

  it('firma la carga sin upsert y calcula la expiración a 2 horas', async () => {
    const carga = await almacen.firmarCarga(RUTA);

    expect(carga).toEqual({ url: URL_CARGA, token: 'tok-carga', expiraEn: new Date('2026-11-18T17:00:00.000Z') });
    expect(bucket.llamadas).toEqual([['createSignedUploadUrl', RUTA]]);
  });

  it('firma la descarga como adjunto con el nombre original', async () => {
    const url = await almacen.firmarDescarga(RUTA, VIGENCIA_SEGUNDOS, 'contrato.pdf');

    expect(url).toBe(URL_DESCARGA);
    expect(bucket.llamadas).toEqual([['createSignedUrl', RUTA, VIGENCIA_SEGUNDOS, { download: 'contrato.pdf' }]]);
  });

  it('firma la descarga en línea sin nombre de descarga', async () => {
    await almacen.firmarDescarga(RUTA, VIGENCIA_SEGUNDOS);

    expect(bucket.llamadas).toEqual([['createSignedUrl', RUTA, VIGENCIA_SEGUNDOS, undefined]]);
  });

  it('lee los bytes del objeto', async () => {
    expect(await almacen.leer(RUTA)).toEqual(pdf());
    expect(bucket.llamadas).toEqual([['download', RUTA]]);
  });

  it.each([
    ['status 404', { name: 'StorageApiError', status: 404, statusCode: 'NoSuchKey' }],
    ['statusCode 404 con status 400', { name: 'StorageApiError', status: 400, statusCode: '404' }],
  ])('leer un objeto que no existe da nulo (%s)', async (_caso, error) => {
    bucket.respuestaLectura = { data: null, error };

    expect(await almacen.leer(RUTA)).toBeNull();
  });

  it('sube los bytes desde el servidor con su tipo y sin upsert', async () => {
    const contenido = new Uint8Array([1, 2, 3]);

    await almacen.subir(RUTA, contenido, 'application/xml');

    expect(bucket.llamadas).toEqual([['upload', RUTA, contenido, { contentType: 'application/xml', upsert: false }]]);
  });

  it('borra el objeto por su ruta', async () => {
    await almacen.borrar(RUTA);

    expect(bucket.llamadas).toEqual([['remove', [RUTA]]]);
  });

  it.each([
    ['firmarCarga', (doble: BucketDoble) => (doble.respuestaCarga = { data: null, error: ERROR_INTERNO }), (a: AlmacenArchivosSupabase) => a.firmarCarga(RUTA)],
    ['firmarDescarga', (doble: BucketDoble) => (doble.respuestaDescarga = { data: null, error: ERROR_INTERNO }), (a: AlmacenArchivosSupabase) => a.firmarDescarga(RUTA, VIGENCIA_SEGUNDOS)],
    ['leer', (doble: BucketDoble) => (doble.respuestaLectura = { data: null, error: ERROR_INTERNO }), (a: AlmacenArchivosSupabase) => a.leer(RUTA)],
    ['borrar', (doble: BucketDoble) => (doble.respuestaBorrado = { data: null, error: ERROR_INTERNO }), (a: AlmacenArchivosSupabase) => a.borrar(RUTA)],
    ['subir', (doble: BucketDoble) => (doble.respuestaSubida = { data: null, error: ERROR_INTERNO }), (a: AlmacenArchivosSupabase) => a.subir(RUTA, new Uint8Array([1]), 'application/zip')],
  ])('%s traduce el error de Storage a ALMACEN_NO_DISPONIBLE con solo el código', async (_metodo, programarFallo, llamar) => {
    programarFallo(bucket);

    const error = await llamar(almacen).then(
      () => null,
      (fallo: unknown) => fallo,
    );

    expect(error).toBeInstanceOf(AlmacenNoDisponibleError);
    expect(error).toMatchObject({ code: 'ALMACEN_NO_DISPONIBLE', codigoOrigen: 'InternalError' });
    expect((error as Error).message).not.toContain(RUTA);
  });

  it('sin statusCode usa el estado HTTP y, sin él, el nombre del error', async () => {
    bucket.respuestaBorrado = { data: null, error: { name: 'StorageApiError', status: 503 } };
    await expect(almacen.borrar(RUTA)).rejects.toMatchObject({ codigoOrigen: '503' });

    bucket.respuestaBorrado = { data: null, error: { name: 'StorageUnknownError' } };
    await expect(almacen.borrar(RUTA)).rejects.toMatchObject({ codigoOrigen: 'StorageUnknownError' });
  });
});
