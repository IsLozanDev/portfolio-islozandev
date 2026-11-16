import type { CuotaPort } from '../application/ports/cuota.port.js';

/** Sin límite hasta el spec 29. */
export class CuotaNula implements CuotaPort {
  reservar(): Promise<boolean> {
    return Promise.resolve(true);
  }

  liberar(): Promise<void> {
    return Promise.resolve();
  }
}
