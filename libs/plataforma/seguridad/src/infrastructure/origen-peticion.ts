import { AsyncLocalStorage } from 'node:async_hooks';

/** Node entrega las IPv4 como IPv6 mapeadas («::ffff:190.42.10.8»); la bitácora las guarda como IPv4. */
const PREFIJO_IPV4_MAPEADA = /^::ffff:(?=\d{1,3}(?:\.\d{1,3}){3}$)/i;

export function ipLegible(ip: string | null): string | null {
  return ip ? ip.replace(PREFIJO_IPV4_MAPEADA, '') : null;
}

/**
 * IP de la petición HTTP en curso, para la bitácora de seguridad (TR-RF-019). Así los casos de uso
 * no la cargan en cada comando. Fuera de una petición (worker, CLI) no hay IP.
 */
export class OrigenPeticion {
  private readonly almacen = new AsyncLocalStorage<string | null>();

  ipActual(): string | null {
    return this.almacen.getStore() ?? null;
  }

  ejecutarCon<T>(ip: string | null, accion: () => Promise<T>): Promise<T> {
    return this.almacen.run(ip, accion);
  }
}
