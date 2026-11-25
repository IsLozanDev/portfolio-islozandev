import { validarReferencia, type ReferenciaProgramacion } from '../../domain/referencia-programacion.js';
import type { DependenciasProgramacion } from '../dependencias.js';

/**
 * TR-CA-191. Cancela las vivas de la referencia (todas o la de esa plantilla) en la transacción del llamador. Sin
 * evento ni borrado del trabajo en Redis: la ejecución ve que ya no está PROGRAMADA y termina.
 */
export class CancelarProgramaciones {
  constructor(private readonly dependencias: Pick<DependenciasProgramacion, 'unidadDeTrabajo' | 'reloj' | 'programaciones'>) {}

  async ejecutar(referencia: ReferenciaProgramacion, plantilla?: string): Promise<number> {
    const validada = validarReferencia(referencia);
    return this.dependencias.unidadDeTrabajo.run(() => this.cancelarVivas(validada, plantilla));
  }

  private async cancelarVivas(referencia: ReferenciaProgramacion, plantilla: string | undefined): Promise<number> {
    const { programaciones, reloj } = this.dependencias;
    const vivas = await programaciones.vivas(referencia, plantilla);
    for (const viva of vivas) {
      const versionLeida = viva.version;
      viva.cancelar(reloj.now());
      await programaciones.actualizar(viva, versionLeida);
    }
    return vivas.length;
  }
}
