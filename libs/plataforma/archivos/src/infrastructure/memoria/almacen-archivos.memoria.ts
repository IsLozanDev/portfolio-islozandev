import { randomUUID } from 'node:crypto';
import type { Clock } from '@vitrina/plataforma/kernel';
import type { AlmacenArchivos, CargaFirmada } from '../../application/ports/almacen-archivos.js';

const VIGENCIA_CARGA_MS = 2 * 60 * 60 * 1000;
const MILISEGUNDOS_POR_SEGUNDO = 1000;
const ORIGEN = 'https://almacen.memoria';
const PARAMETRO_TOKEN = 'token';
const PARAMETRO_DESCARGA = 'download';

type TipoFirma = 'carga' | 'descarga';

interface Firma {
  tipo: TipoFirma;
  ruta: string;
  expiraEn: Date;
}

export const MOTIVOS_URL_RECHAZADA = ['FIRMA_INVALIDA', 'EXPIRADA', 'OBJETO_YA_EXISTE', 'OBJETO_NO_EXISTE'] as const;
export type MotivoUrlRechazada = (typeof MOTIVOS_URL_RECHAZADA)[number];

/** Lo que respondería Storage al cliente que usa una URL firmada que ya no vale. */
export class UrlFirmadaRechazadaError extends Error {
  constructor(readonly motivo: MotivoUrlRechazada) {
    super(`URL firmada rechazada: ${motivo}`);
    this.name = 'UrlFirmadaRechazadaError';
  }
}

/**
 * Doble de Storage para pruebas de esta lib y de sus consumidores. Además del puerto, hace el papel del
 * navegador: `subirConUrl` y `descargarConUrl` usan las URL firmadas con las mismas reglas que Storage
 * (un solo objeto, sin reemplazo, vigencia según el reloj inyectado).
 */
export class AlmacenArchivosMemoria implements AlmacenArchivos {
  private readonly objetos = new Map<string, Uint8Array>();
  private readonly firmas = new Map<string, Firma>();

  constructor(private readonly reloj: Clock) {}

  firmarCarga(ruta: string): Promise<CargaFirmada> {
    const expiraEn = new Date(this.reloj.now().getTime() + VIGENCIA_CARGA_MS);
    const token = this.registrarFirma({ tipo: 'carga', ruta, expiraEn });
    return Promise.resolve({ url: armarUrl('carga', ruta, token), token, expiraEn });
  }

  firmarDescarga(ruta: string, vigenciaSegundos: number, descargarComo?: string): Promise<string> {
    const expiraEn = new Date(this.reloj.now().getTime() + vigenciaSegundos * MILISEGUNDOS_POR_SEGUNDO);
    const token = this.registrarFirma({ tipo: 'descarga', ruta, expiraEn });
    return Promise.resolve(armarUrl('descarga', ruta, token, descargarComo));
  }

  leer(ruta: string): Promise<Uint8Array | null> {
    return Promise.resolve(this.objetos.get(ruta) ?? null);
  }

  borrar(ruta: string): Promise<void> {
    this.objetos.delete(ruta);
    return Promise.resolve();
  }

  /** El `PUT` del cliente a la URL de carga. */
  subirConUrl(url: string, contenido: Uint8Array): void {
    const { ruta } = this.exigirFirmaVigente(url, 'carga');
    if (this.objetos.has(ruta)) throw new UrlFirmadaRechazadaError('OBJETO_YA_EXISTE');
    this.objetos.set(ruta, contenido);
  }

  /** El `GET` del cliente a la URL de descarga. */
  descargarConUrl(url: string): Uint8Array {
    const { ruta } = this.exigirFirmaVigente(url, 'descarga');
    const contenido = this.objetos.get(ruta);
    if (!contenido) throw new UrlFirmadaRechazadaError('OBJETO_NO_EXISTE');
    return contenido;
  }

  existe(ruta: string): boolean {
    return this.objetos.has(ruta);
  }

  private registrarFirma(firma: Firma): string {
    const token = randomUUID();
    this.firmas.set(token, firma);
    return token;
  }

  private exigirFirmaVigente(url: string, tipo: TipoFirma): Firma {
    const firma = this.firmas.get(new URL(url).searchParams.get(PARAMETRO_TOKEN) ?? '');
    if (!firma || firma.tipo !== tipo) throw new UrlFirmadaRechazadaError('FIRMA_INVALIDA');
    if (this.reloj.now().getTime() >= firma.expiraEn.getTime()) throw new UrlFirmadaRechazadaError('EXPIRADA');
    return firma;
  }
}

function armarUrl(tipo: TipoFirma, ruta: string, token: string, descargarComo?: string): string {
  const url = new URL(`${ORIGEN}/${tipo}/${ruta}`);
  url.searchParams.set(PARAMETRO_TOKEN, token);
  if (descargarComo !== undefined) url.searchParams.set(PARAMETRO_DESCARGA, descargarComo);
  return url.toString();
}
