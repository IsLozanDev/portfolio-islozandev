import { CuotaNoEncontradaError } from '../domain/errores.js';
import type { Periodo } from '../domain/periodo.js';
import type { DependenciasConsolaCuotas } from './listar-cuotas.js';
import type { DetalleCuota } from './ports/cuotas.js';

/** Operador: una cuota con las consultas del periodo por resultado. */
export class DetalleDeCuota {
  constructor(private readonly dependencias: Omit<DependenciasConsolaCuotas, 'reloj'>) {}

  async ejecutar(tenantId: string, periodo: Periodo): Promise<DetalleCuota> {
    const { unidadDeTrabajo, verificador, lectura } = this.dependencias;
    await verificador.exigir();
    const detalle = await unidadDeTrabajo.run(() => lectura.detalle(tenantId, periodo));
    if (!detalle) throw new CuotaNoEncontradaError();
    return detalle;
  }
}
