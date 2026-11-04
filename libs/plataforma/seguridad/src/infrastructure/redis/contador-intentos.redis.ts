import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { ClaveBloqueo, ContadorIntentos } from '../../application/ports/contador-intentos.port.js';
import { DURACION_BLOQUEO_SEG, normalizarCorreo, VENTANA_INTENTOS_SEG } from '../../domain/intentos-ingreso.js';

const MS_POR_SEGUNDO = 1000;

export type AlFallarRedis = (operacion: string, error: unknown) => void;

/** El correo nunca va en claro a Redis (TR-RNF-026). */
function huellaCorreo(correo: string): string {
  return createHash('sha256').update(normalizarCorreo(correo)).digest('hex');
}

function claveFallos(clave: ClaveBloqueo): string {
  switch (clave.alcance) {
    case 'CORREO_IP':
      return `seg:ingreso:fallos:${huellaCorreo(clave.correo)}:${clave.ip}`;
    case 'IP':
      return `seg:ingreso:fallos-ip:${clave.ip}`;
    case 'MFA':
      return `seg:mfa:fallos:${clave.usuarioId}`;
  }
}

function claveBloqueo(clave: ClaveBloqueo): string {
  switch (clave.alcance) {
    case 'CORREO_IP':
      return `seg:ingreso:bloqueo:${huellaCorreo(clave.correo)}:${clave.ip}`;
    case 'IP':
      return `seg:ingreso:bloqueo-ip:${clave.ip}`;
    case 'MFA':
      return `seg:mfa:bloqueo:${clave.usuarioId}`;
  }
}

/**
 * Ventana fija: el contador nace con su TTL y no se renueva con cada fallo (`EXPIRE NX`, Redis 7).
 * Falla abierto: cualquier error de Redis se informa a `alFallar` y se responde como si no hubiera bloqueo.
 */
export class ContadorIntentosRedis implements ContadorIntentos {
  constructor(
    private readonly redis: Redis,
    private readonly alFallar: AlFallarRedis,
    private readonly ahora: () => number = Date.now,
  ) {}

  async bloqueoVigente(claves: readonly ClaveBloqueo[]): Promise<number | null> {
    try {
      await this.conectar();
      const restantes = await Promise.all(claves.map((clave) => this.redis.ttl(claveBloqueo(clave))));
      const mayor = Math.max(...restantes);
      return mayor > 0 ? mayor : null;
    } catch (error) {
      this.alFallar('bloqueo_vigente', error);
      return null;
    }
  }

  async registrarFallo(clave: ClaveBloqueo, umbral: number): Promise<{ bloqueadoHasta: Date | null }> {
    try {
      await this.conectar();
      const fallos = await this.sumarFallo(claveFallos(clave));
      if (fallos < umbral) return { bloqueadoHasta: null };
      return { bloqueadoHasta: await this.bloquear(clave) };
    } catch (error) {
      this.alFallar('registrar_fallo', error);
      return { bloqueadoHasta: null };
    }
  }

  async limpiar(clave: ClaveBloqueo): Promise<void> {
    try {
      await this.conectar();
      await this.redis.del(claveFallos(clave));
    } catch (error) {
      this.alFallar('limpiar', error);
    }
  }

  private async sumarFallo(clave: string): Promise<number> {
    const resultados = await this.redis.multi().incr(clave).expire(clave, VENTANA_INTENTOS_SEG, 'NX').exec();
    const [errorIncr, fallos] = resultados?.[0] ?? [new Error('MULTI sin respuesta'), 0];
    if (errorIncr) throw errorIncr;
    return Number(fallos);
  }

  private async bloquear(clave: ClaveBloqueo): Promise<Date> {
    const hasta = new Date(this.ahora() + DURACION_BLOQUEO_SEG * MS_POR_SEGUNDO);
    await this.redis
      .multi()
      .set(claveBloqueo(clave), String(hasta.getTime()), 'EX', DURACION_BLOQUEO_SEG)
      .del(claveFallos(clave))
      .exec();
    return hasta;
  }

  /** lazyConnect: la primera llamada abre la conexión; después ioredis reconecta solo. */
  private async conectar(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}
