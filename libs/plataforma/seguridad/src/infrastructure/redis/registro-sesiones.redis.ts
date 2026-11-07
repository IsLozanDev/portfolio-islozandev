import type { Redis } from 'ioredis';
import type { RegistroSesiones } from '../../application/ports/registro-sesiones.port.js';
import type { AlFallarRedis } from './contador-intentos.redis.js';

/** Cubre la vida normal de un refresh; una sesión más larga deja un segundo LOGIN (aceptado en el spec). */
const TTL_SESION_VISTA_SEG = 30 * 24 * 60 * 60;

export class RegistroSesionesRedis implements RegistroSesiones {
  constructor(
    private readonly redis: Redis,
    private readonly alFallar: AlFallarRedis,
  ) {}

  async esNueva(sesionId: string): Promise<boolean> {
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      const respuesta = await this.redis.set(`seg:sesion:${sesionId}`, '1', 'EX', TTL_SESION_VISTA_SEG, 'NX');
      return respuesta === 'OK';
    } catch (error) {
      this.alFallar('sesion_nueva', error);
      return false;
    }
  }
}
