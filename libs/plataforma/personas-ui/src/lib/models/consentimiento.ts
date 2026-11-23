/** Valores del spec 37. */
export const FINALIDADES = ['PRESTACION', 'PROMOCIONES', 'COMPARTIR_PRODUCTOS', 'DATOS_SALUD', 'IDENTIDAD_PORTABLE'] as const;
export type Finalidad = (typeof FINALIDADES)[number];

export type Decision = 'ACEPTA' | 'RECHAZA';
export type Canal = 'PRESENCIAL' | 'WEB' | 'WHATSAPP' | 'KIOSCO';

/** Lo que se muestra: la decisión tomada o «Revocado» si se revocó después. */
export type EstadoConsentimiento = Decision | 'REVOCADO';

export interface DecisionVigente {
  finalidad: Finalidad;
  estado: EstadoConsentimiento;
  versionTexto: string;
  /** El de la revocación, si la hubo. */
  canal: Canal;
  /** ISO 8601: el de la revocación, si la hubo. */
  fecha: string;
}

export interface DecisionRegistradaRespuesta {
  id: string;
  finalidad: Finalidad;
  decision: Decision;
  version_texto: string;
  canal: Canal;
  registrado_en: string;
  revocado_en?: string;
  canal_revocacion?: Canal;
}

export interface ConsentimientosRespuesta {
  persona_id: string;
  vigentes?: { finalidad: Finalidad; decision: DecisionRegistradaRespuesta | null }[];
}

function aDecisionVigente(decision: DecisionRegistradaRespuesta): DecisionVigente {
  const revocada = decision.revocado_en !== undefined;
  return {
    finalidad: decision.finalidad,
    estado: revocada ? 'REVOCADO' : decision.decision,
    versionTexto: decision.version_texto,
    canal: revocada ? (decision.canal_revocacion ?? decision.canal) : decision.canal,
    fecha: revocada ? (decision.revocado_en as string) : decision.registrado_en,
  };
}

/** Solo las finalidades en las que la persona decidió algo. */
export function aDecisionesVigentes(respuesta: ConsentimientosRespuesta): DecisionVigente[] {
  return (respuesta.vigentes ?? []).flatMap(({ decision }) => (decision ? [aDecisionVigente(decision)] : []));
}
