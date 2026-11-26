import type { Clock } from '@vitrina/plataforma/kernel';
import { createClient } from '@supabase/supabase-js';
import type { AlmacenArchivos, CargaFirmada } from '../../application/ports/almacen-archivos.js';
import { AlmacenNoDisponibleError } from '../../domain/errores.js';

export interface OpcionesAlmacenSupabase {
  url: string;
  /** Secret key del proyecto. Solo `apps/api` y `apps/worker` (regla 9). */
  secretKey: string;
  bucket: string;
}

/** Supabase no deja configurarla: la URL de carga vale 2 horas. */
const VIGENCIA_CARGA_MS = 2 * 60 * 60 * 1000;
const ESTADO_NO_ENCONTRADO = 404;
const CODIGO_NO_ENCONTRADO = '404';
const CODIGO_SIN_DETALLE = 'sin_codigo';

interface ErrorStorage {
  name: string;
  status?: number;
  statusCode?: string;
}

type RespuestaStorage<Datos> = { data: Datos; error: null } | { data: null; error: ErrorStorage };

/** Lo único que usa del cliente de Storage para un bucket; las pruebas lo doblan. */
export interface BucketStorage {
  createSignedUploadUrl(ruta: string): Promise<RespuestaStorage<{ signedUrl: string; token: string }>>;
  createSignedUrl(
    ruta: string,
    vigenciaSegundos: number,
    opciones?: { download?: string | boolean },
  ): Promise<RespuestaStorage<{ signedUrl: string }>>;
  upload(ruta: string, contenido: Uint8Array, opciones: { contentType: string; upsert: boolean }): Promise<RespuestaStorage<unknown>>;
  download(ruta: string): PromiseLike<RespuestaStorage<Blob>>;
  remove(rutas: string[]): Promise<RespuestaStorage<unknown>>;
}

/**
 * Bucket privado de Supabase Storage con la secret key. La carga se firma sin `upsert`: una segunda
 * subida a la misma ruta no reemplaza el objeto. Los errores salen como `AlmacenNoDisponibleError`
 * con solo el código: el mensaje de Storage puede llevar la ruta.
 */
export class AlmacenArchivosSupabase implements AlmacenArchivos {
  constructor(
    private readonly bucket: BucketStorage,
    private readonly reloj: Clock,
  ) {}

  static conectar(opciones: OpcionesAlmacenSupabase, reloj: Clock): AlmacenArchivosSupabase {
    const cliente = createClient(opciones.url, opciones.secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    return new AlmacenArchivosSupabase(cliente.storage.from(opciones.bucket), reloj);
  }

  async firmarCarga(ruta: string): Promise<CargaFirmada> {
    const { signedUrl, token } = exigirDatos(await this.bucket.createSignedUploadUrl(ruta));
    return { url: signedUrl, token, expiraEn: new Date(this.reloj.now().getTime() + VIGENCIA_CARGA_MS) };
  }

  async firmarDescarga(ruta: string, vigenciaSegundos: number, descargarComo?: string): Promise<string> {
    const opciones = descargarComo === undefined ? undefined : { download: descargarComo };
    return exigirDatos(await this.bucket.createSignedUrl(ruta, vigenciaSegundos, opciones)).signedUrl;
  }

  /** Sin `upsert`: subir a una ruta que ya existe falla. */
  async subir(ruta: string, contenido: Uint8Array, mime: string): Promise<void> {
    exigirDatos(await this.bucket.upload(ruta, contenido, { contentType: mime, upsert: false }));
  }

  async leer(ruta: string): Promise<Uint8Array | null> {
    const respuesta = await this.bucket.download(ruta);
    if (respuesta.error && esNoEncontrado(respuesta.error)) return null;
    const contenido = exigirDatos(respuesta);
    return new Uint8Array(await contenido.arrayBuffer());
  }

  async borrar(ruta: string): Promise<void> {
    exigirDatos(await this.bucket.remove([ruta]));
  }
}

function exigirDatos<Datos>(respuesta: RespuestaStorage<Datos>): Datos {
  if (respuesta.error) throw new AlmacenNoDisponibleError(codigoDe(respuesta.error));
  return respuesta.data;
}

function esNoEncontrado(error: ErrorStorage): boolean {
  return error.status === ESTADO_NO_ENCONTRADO || error.statusCode === CODIGO_NO_ENCONTRADO;
}

function codigoDe(error: ErrorStorage): string {
  return error.statusCode ?? error.status?.toString() ?? error.name ?? CODIGO_SIN_DETALLE;
}
