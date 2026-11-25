import type { ProgramacionRegistrada } from '../../domain/eventos-not.js';
import type { DependenciasBarrido } from '../dependencias.js';

/**
 * Consumidor de `not.programacion.registrada`: agrega la programación a `not-programaciones` con retardo hasta
 * `enviar_en`. Idempotente por `event_id` (EVT) y por `jobId = ${programacionId}-${version}` (BullMQ).
 */
export class EncolarProgramacion {
  constructor(private readonly dependencias: Pick<DependenciasBarrido, 'cola'>) {}

  ejecutar(tenantId: string, registrada: ProgramacionRegistrada): Promise<void> {
    return this.dependencias.cola.encolar({
      tenantId,
      programacionId: registrada.programacion_id,
      version: registrada.version,
      enviarEn: new Date(registrada.enviar_en),
    });
  }
}
