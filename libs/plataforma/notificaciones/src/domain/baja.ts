import type { CanalNotificacion } from './canal.js';
import { MOTIVO_BAJA_CANAL } from './estado-mensaje.js';
import { FINALIDAD_PROMOCIONAL, type FinalidadNotificacion } from './finalidad-notificacion.js';

export const ALCANCES_BAJA = ['PROMOCIONAL', 'CANAL'] as const;
export type AlcanceBaja = (typeof ALCANCES_BAJA)[number];

export const ALCANCE_PROMOCIONAL = 'PROMOCIONAL' satisfies AlcanceBaja;
export const ALCANCE_CANAL = 'CANAL' satisfies AlcanceBaja;

export const MOTIVO_BAJA_PROMOCIONAL = 'BAJA_PROMOCIONAL';
export type MotivoBloqueoBaja = typeof MOTIVO_BAJA_CANAL | typeof MOTIVO_BAJA_PROMOCIONAL;

export interface DatosBaja {
  id: string;
  tenantId: string;
  canal: CanalNotificacion;
  alcance: AlcanceBaja;
  /** HashearDestino: el correo en claro no sale de NOT (TR-RNF-026). */
  destinoHash: string;
  /** Solo para reflejar la baja en el consentimiento de PER. */
  personaId: string | null;
}

export function esAlcanceBaja(valor: string): valor is AlcanceBaja {
  return (ALCANCES_BAJA as readonly string[]).includes(valor);
}

/** TR-RF-077: el destinatario deja las promociones o el canal entero. Solo se registra; no se deshace. */
export class Baja {
  private constructor(private readonly datos: DatosBaja) {}

  static registrar(datos: DatosBaja): Baja {
    return new Baja({ ...datos });
  }

  get id(): string {
    return this.datos.id;
  }

  get alcance(): AlcanceBaja {
    return this.datos.alcance;
  }

  get personaId(): string | null {
    return this.datos.personaId;
  }

  instantanea(): DatosBaja {
    return { ...this.datos };
  }
}

/**
 * TR-RN-025: una baja del canal bloquea todo, transaccional o promocional; una baja de promociones solo bloquea
 * las promocionales (TR-CA-193). null si el envío sigue.
 */
export function bloqueaEnvio(bajas: readonly Baja[], finalidad: FinalidadNotificacion): MotivoBloqueoBaja | null {
  if (bajas.some((baja) => baja.alcance === ALCANCE_CANAL)) return MOTIVO_BAJA_CANAL;
  const esPromocional = finalidad === FINALIDAD_PROMOCIONAL;
  if (esPromocional && bajas.some((baja) => baja.alcance === ALCANCE_PROMOCIONAL)) return MOTIVO_BAJA_PROMOCIONAL;
  return null;
}
