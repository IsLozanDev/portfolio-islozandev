import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { SucursalNoAsignadaError } from '../domain/errores.js';
import type { CachePermisos, ConsultaPermisos, PermisosRepositorio, PermisosResueltos, VersionesSeguridad } from './ports/permisos.port.js';

/** Respaldo: la invalidación normal es por versión en la clave, al commit (TR-RNF-101). */
export const TTL_PERMISOS_SEG = 60;

export type Aviso = (mensaje: string, datos: Record<string, unknown>) => void;

/** La versión va en la clave: un cambio sube vt o vc y la clave anterior deja de leerse. */
export function clavePermisos({ usuarioId, tenantId, sucursalId, unidadId }: ConsultaPermisos, { vt, vc }: VersionesSeguridad): string {
  return `perm:${tenantId}:${vt}.${vc}:${usuarioId}:${sucursalId}:${unidadId ?? '-'}`;
}

/**
 * TR-RF-015: permisos efectivos y menú del usuario en una sucursal (y unidad), con caché Redis.
 * Si Redis falla resuelve desde la base: la respuesta es la misma, solo más lenta. Nunca falla abierto.
 */
export class ResolverPermisos {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly repositorio: PermisosRepositorio,
    private readonly cache: CachePermisos,
    private readonly aviso: Aviso = () => undefined,
  ) {}

  /** SucursalNoAsignadaError si la sucursal no está entre las accesibles del usuario. */
  ejecutar(consulta: ConsultaPermisos): Promise<PermisosResueltos> {
    return this.contexto.run({ tenantId: consulta.tenantId, branchId: consulta.sucursalId }, () =>
      this.uow.run(async () => {
        const clave = clavePermisos(consulta, await this.repositorio.versiones(consulta.tenantId));

        let cacheDisponible = true;
        try {
          const enCache = await this.cache.leer(clave);
          if (enCache) return enCache;
        } catch (error) {
          cacheDisponible = false;
          this.aviso('Caché de permisos no disponible; se resuelve desde la base', { evento: 'seg.cache.falla', error: nombreError(error) });
        }

        const accesibles = await this.repositorio.sucursalesAccesibles(consulta.usuarioId, consulta.tenantId);
        if (!accesibles.some((s) => s.id === consulta.sucursalId)) throw new SucursalNoAsignadaError();

        const resuelto = { permisos: await this.repositorio.efectivos(consulta), menu: await this.repositorio.menu(consulta) };
        if (cacheDisponible) {
          try {
            await this.cache.guardar(clave, consulta.tenantId, resuelto, TTL_PERMISOS_SEG);
          } catch (error) {
            this.aviso('No se pudo guardar en la caché de permisos', { evento: 'seg.cache.falla', error: nombreError(error) });
          }
        }
        return resuelto;
      }),
    );
  }
}

// Solo el nombre: el mensaje de un error de conexión puede traer la URL con la clave (RNF-026).
const nombreError = (error: unknown) => (error instanceof Error ? error.name : typeof error);
