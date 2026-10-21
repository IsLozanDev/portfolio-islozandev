import { createHash } from 'node:crypto';
import { Manifiesto, resumir, totalCambios, type ResumenCambios } from '../domain/manifiesto.js';
import type { RepositorioManifiestos } from './ports/repositorios.js';

export interface ResultadoManifiesto {
  producto: string;
  version: string;
  /** true si esa versión con ese contenido ya estaba aplicada: no se escribió nada (TR-CA-023). */
  yaAplicado: boolean;
  total: number;
  cambios: ResumenCambios;
}

/** TR-RF-008: valida el manifiesto completo, calcula diferencias y las aplica en una transacción. */
export class AplicarManifiesto {
  constructor(private readonly manifiestos: RepositorioManifiestos) {}

  /** Lanza ManifiestoInvalidoError antes de tocar la base si algo no valida (TR-CA-024). */
  async ejecutar(json: unknown): Promise<ResultadoManifiesto> {
    const manifiesto = Manifiesto.leer(json);
    const hash = createHash('sha256').update(manifiesto.canonico()).digest('hex');

    return this.manifiestos.transaccion(async (sesion) => {
      const plan = manifiesto.planificar(await sesion.catalogoActual(manifiesto.productoCodigo), hash);
      const resumen = resumir(plan.cambios);
      if (!plan.yaAplicado) await sesion.aplicar(manifiesto, plan.cambios, { hash, resumen });
      return { producto: manifiesto.productoCodigo, version: manifiesto.version, yaAplicado: plan.yaAplicado, total: totalCambios(plan.cambios), cambios: resumen };
    });
  }
}
