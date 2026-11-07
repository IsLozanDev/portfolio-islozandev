import type { Clock } from '@vitrina/plataforma/kernel';
import { CatalogoNoExisteError } from '../domain/errores.js';
import { fechaDeVigencia } from '../domain/vigencia.js';
import type { CacheItems, FilaItemLeido, ItemsEnCache, LecturaItems, Versiones } from './ports/repositorios.js';

/** La invalidación normal es por versión y fecha en la clave; el TTL solo limpia las claves viejas. */
export const TTL_ITEMS_SEGUNDOS = 86_400;
export const EVENTO_ERROR_CACHE = 'cat.redis.error';

export type Aviso = (mensaje: string, datos: Record<string, unknown>) => void;

export interface DependenciasLectorItems {
  lectura: LecturaItems;
  cache: CacheItems;
  reloj: Clock;
  aviso?: Aviso;
}

/** Un propio o un ajuste cambia la versión del tenant; un global, la global; un día nuevo, la fecha. */
export function claveItems(codigo: string, tenantId: string, versiones: Versiones, fecha: string): string {
  return `cat:${codigo}:${tenantId}:${versiones.versionGlobal}.${versiones.versionTenant}:${fecha}`;
}

export function etagItems(versiones: Versiones, fecha: string): string {
  return `"${versiones.versionGlobal}.${versiones.versionTenant}.${fecha}"`;
}

/** Los visibles en el orden de `cat.items`; el resto por código, con el motivo. */
export function agruparItems(filas: FilaItemLeido[]): ItemsEnCache {
  const enCache: ItemsEnCache = { visibles: [], noVisibles: {} };
  for (const fila of filas) {
    if (fila.estado === 'VISIBLE') {
      const { itemId, codigo, codigoExterno, nombre, atributos, orden } = fila;
      enCache.visibles.push({ itemId, codigo, codigoExterno, nombre, atributos, orden });
    } else {
      enCache.noVisibles[fila.codigo] = { motivo: fila.estado, atributos: fila.atributos };
    }
  }
  return enCache;
}

/**
 * Lectura compartida de ConsultarItems y ValidarItem (TR-RF-024, TR-RNF-102). Va dentro de UnitOfWork.run.
 * Si Redis falla se resuelve desde la base: la respuesta es la misma, solo más lenta.
 */
export class LectorItems {
  private readonly aviso: Aviso;

  constructor(private readonly dependencias: DependenciasLectorItems) {
    this.aviso = dependencias.aviso ?? (() => undefined);
  }

  /** TR-CA-065: un catálogo inexistente no se cachea. */
  async versiones(codigo: string, tenantId: string): Promise<Versiones> {
    const versiones = await this.dependencias.lectura.versiones(codigo, tenantId);
    if (!versiones) throw new CatalogoNoExisteError();
    return versiones;
  }

  /** TR-CA-062: un ítem futuro aparece el día que empieza su vigencia, sin invalidar nada. */
  fechaDeHoy(): string {
    return fechaDeVigencia(this.dependencias.reloj.now());
  }

  async items(codigo: string, tenantId: string, versiones: Versiones, fecha: string): Promise<ItemsEnCache> {
    const clave = claveItems(codigo, tenantId, versiones, fecha);
    const enCache = await this.leerCache(clave);
    if (enCache) return enCache;
    const leidos = agruparItems(await this.dependencias.lectura.items(codigo, tenantId, fecha));
    await this.guardarCache(clave, leidos);
    return leidos;
  }

  private async leerCache(clave: string): Promise<ItemsEnCache | null> {
    try {
      return await this.dependencias.cache.leer(clave);
    } catch (error) {
      this.aviso('Caché de catálogos no disponible; se lee desde la base', { evento: EVENTO_ERROR_CACHE, error: nombreError(error) });
      return null;
    }
  }

  private async guardarCache(clave: string, valor: ItemsEnCache): Promise<void> {
    try {
      await this.dependencias.cache.guardar(clave, valor, TTL_ITEMS_SEGUNDOS);
    } catch (error) {
      this.aviso('No se pudo guardar en la caché de catálogos', { evento: EVENTO_ERROR_CACHE, error: nombreError(error) });
    }
  }
}

// Solo el nombre: el mensaje de un error de conexión puede traer la URL con la clave (TR-RNF-026).
function nombreError(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
