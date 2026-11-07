import type { CacheItems, ItemsEnCache } from '../application/ports/repositorios.js';

const MILISEGUNDOS_POR_SEGUNDO = 1000;

/** Doble de pruebas con el mismo contrato que la caché Redis, incluido el vencimiento. */
export class CacheItemsMemoria implements CacheItems {
  private readonly entradas = new Map<string, { valor: string; venceEn: number }>();

  constructor(private readonly ahora: () => number = Date.now) {}

  async leer(clave: string): Promise<ItemsEnCache | null> {
    const entrada = this.entradas.get(clave);
    if (!entrada || entrada.venceEn <= this.ahora()) return null;
    return JSON.parse(entrada.valor) as ItemsEnCache;
  }

  async guardar(clave: string, valor: ItemsEnCache, ttlSegundos: number): Promise<void> {
    this.entradas.set(clave, { valor: JSON.stringify(valor), venceEn: this.ahora() + ttlSegundos * MILISEGUNDOS_POR_SEGUNDO });
  }

  get claves(): string[] {
    return [...this.entradas.keys()];
  }
}
