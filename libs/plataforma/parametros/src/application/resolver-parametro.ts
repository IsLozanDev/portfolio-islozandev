import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { ParametroNoDefinidoError } from '../domain/errores.js';
import type { OrigenValor } from '../domain/tipos.js';
import type { ContextoParametro, ParametroPort } from './ports/parametro.port.js';
import type { CacheParametros, LecturaDefiniciones, ResolucionSql, ValorEnCache, VersionesParametros } from './ports/repositorios.js';

/** Respaldo: la invalidación normal es por versión en la clave, al commit (TR-RNF-101). */
export const TTL_PARAMETROS_SEGUNDOS = 60;
const SIN_NIVEL = '-';
export const EVENTO_ERROR_CACHE = 'cfg.redis.error';

export type Aviso = (mensaje: string, datos: Record<string, unknown>) => void;

export interface ConsultaParametro {
  tenantId: string;
  codigo: string;
  empresaId: string | null;
  sucursalId: string | null;
}

/** Las versiones van en la clave: un cambio sube vt o vd y la clave anterior deja de leerse. */
export function claveParametro(consulta: ConsultaParametro, { vt, vd }: VersionesParametros): string {
  return `cfg:${consulta.tenantId}:${vt}.${vd}:${consulta.codigo}:${consulta.empresaId ?? SIN_NIVEL}:${consulta.sucursalId ?? SIN_NIVEL}`;
}

/**
 * TR-RF-032: valor efectivo y su origen, con caché Redis. Si Redis falla resuelve desde la base: la
 * respuesta es la misma, solo más lenta. Un código inexistente no se cachea.
 */
export class ResolverParametro implements ParametroPort {
  constructor(
    private readonly unidadDeTrabajo: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly definiciones: LecturaDefiniciones,
    private readonly resolucion: ResolucionSql,
    private readonly cache: CacheParametros,
    private readonly aviso: Aviso = () => undefined,
  ) {}

  valor<T = unknown>(codigo: string, contexto: ContextoParametro = {}): Promise<{ valor: T; origen: OrigenValor }> {
    const consulta = this.consultaDesde(codigo, contexto);
    return this.unidadDeTrabajo.run(async () => {
      const clave = claveParametro(consulta, await this.resolucion.versiones(consulta.tenantId));
      const { valor, origen, obsoleto } = (await this.leerCache(clave)) ?? (await this.resolverYGuardar(consulta, clave));
      if (obsoleto) this.aviso('Se resolvió un parámetro obsoleto', { evento: 'cfg.parametro.obsoleto', codigo });
      return { valor: valor as T, origen };
    });
  }

  /** Sin empresa ni sucursal explícitas, la sucursal del contexto (X-Sucursal-Id) si existe. */
  private consultaDesde(codigo: string, contexto: ContextoParametro): ConsultaParametro {
    const contextoTenant = this.contexto.current();
    const empresaId = contexto.empresaId ?? null;
    const sucursalId = contexto.sucursalId ?? (empresaId === null ? (contextoTenant.branchId ?? null) : null);
    return { tenantId: contextoTenant.tenantId, codigo, empresaId, sucursalId };
  }

  private async resolverYGuardar(consulta: ConsultaParametro, clave: string): Promise<ValorEnCache> {
    const definicion = await this.definiciones.buscar(consulta.codigo);
    const efectivo = definicion && (await this.resolucion.valor(consulta.codigo, consulta.tenantId, consulta.empresaId, consulta.sucursalId));
    if (!definicion || !efectivo) throw new ParametroNoDefinidoError(consulta.codigo);
    const enCache: ValorEnCache = { ...efectivo, obsoleto: definicion.obsoleto };
    await this.guardarCache(clave, enCache);
    return enCache;
  }

  private async leerCache(clave: string): Promise<ValorEnCache | null> {
    try {
      return await this.cache.leer(clave);
    } catch (error) {
      this.aviso('Caché de parámetros no disponible; se resuelve desde la base', { evento: EVENTO_ERROR_CACHE, error: nombreError(error) });
      return null;
    }
  }

  private async guardarCache(clave: string, valor: ValorEnCache): Promise<void> {
    try {
      await this.cache.guardar(clave, valor, TTL_PARAMETROS_SEGUNDOS);
    } catch (error) {
      this.aviso('No se pudo guardar en la caché de parámetros', { evento: EVENTO_ERROR_CACHE, error: nombreError(error) });
    }
  }
}

// Solo el nombre: el mensaje de un error de conexión puede traer la URL con la clave (RNF-026).
function nombreError(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
