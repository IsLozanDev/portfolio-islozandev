import type { CachePermisos, PermisosResueltos } from '../application/ports/permisos.port.js';

/** Doble de pruebas con el mismo contrato que la caché Redis, incluido el vencimiento. */
export class CachePermisosMemoria implements CachePermisos {
  private readonly valores = new Map<string, { valor: string; vence: number; tenantId: string }>();

  constructor(private readonly ahora: () => number = Date.now) {}

  async leer(clave: string): Promise<PermisosResueltos | null> {
    const e = this.valores.get(clave);
    if (!e || e.vence <= this.ahora()) return null;
    return JSON.parse(e.valor) as PermisosResueltos;
  }

  async guardar(clave: string, tenantId: string, valor: PermisosResueltos, ttlSeg: number): Promise<void> {
    this.valores.set(clave, { valor: JSON.stringify(valor), vence: this.ahora() + ttlSeg * 1000, tenantId });
  }

  async invalidarTenant(tenantId: string): Promise<void> {
    for (const [clave, e] of this.valores) if (e.tenantId === tenantId) this.valores.delete(clave);
  }
}
