import type { PseOsePort, ResolutorPse } from '../../application/ports/pse-ose.port.js';
import { ProveedorFeInvalidoError } from '../../domain/errores.js';

/** Adaptador por código de PROVEEDOR_FE: `{ SIMULADO, NUBEFACT }`. */
export class ResolutorPseMapa implements ResolutorPse {
  constructor(private readonly adaptadores: Readonly<Record<string, PseOsePort>>) {}

  para(proveedor: string): PseOsePort {
    const adaptador = this.adaptadores[proveedor];
    if (!adaptador) throw new ProveedorFeInvalidoError();
    return adaptador;
  }
}
