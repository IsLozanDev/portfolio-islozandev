import type { CacheParametros, ValorEnCache } from '../application/ports/repositorios.js';

const MILISEGUNDOS_POR_SEGUNDO = 1000;

/** Doble de pruebas con el mismo contrato que la caché Redis, incluido el vencimiento. */
export class CacheParametrosMemoria implements CacheParametros {
  private readonly entradas = new Map<string, { valor: string; venceEn: number }>();

  constructor(private readonly ahora: () => number = Date.now) {}

  async leer(clave: string): Promise<ValorEnCache | null> {
    const entrada = this.entradas.get(clave);
    if (!entrada || entrada.venceEn <= this.ahora()) return null;
    return JSON.parse(entrada.valor) as ValorEnCache;
  }

  async guardar(clave: string, valor: ValorEnCache, ttlSegundos: number): Promise<void> {
    this.entradas.set(clave, { valor: JSON.stringify(valor), venceEn: this.ahora() + ttlSegundos * MILISEGUNDOS_POR_SEGUNDO });
  }

  get tamano(): number {
    return this.entradas.size;
  }
}
