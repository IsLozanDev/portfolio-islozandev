import type { DependenciasBarrido } from '../dependencias.js';

/** Una vencida hace menos que esto puede estar en curso en el worker: aún no se considera perdida. */
export const MARGEN_ATRASO_MS = 5 * 60_000;
export const LIMITE_BARRIDO = 500;

export interface ResultadoBarrido {
  encoladas: number;
}

/**
 * TR-RNF-005. Vuelve a encolar las PROGRAMADA vencidas hace más de 5 min: Redis perdió el trabajo o el worker estuvo
 * caído. Mismo `jobId` que el trabajo original: si sigue en la cola no se duplica, y la ejecución descarta el que
 * llegue después del envío.
 */
export class BarrerProgramacionesAtrasadas {
  constructor(private readonly dependencias: DependenciasBarrido) {}

  async ejecutar(): Promise<ResultadoBarrido> {
    const { reloj, localizador, cola } = this.dependencias;
    const ahora = reloj.now();
    const atrasadas = await localizador.atrasadas(new Date(ahora.getTime() - MARGEN_ATRASO_MS), LIMITE_BARRIDO);
    for (const atrasada of atrasadas) await cola.encolar({ ...atrasada, enviarEn: ahora });
    return { encoladas: atrasadas.length };
  }
}
