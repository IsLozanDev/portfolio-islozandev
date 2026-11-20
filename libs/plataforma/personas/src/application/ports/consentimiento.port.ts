import type { Canal, Decision, Finalidad } from '../../domain/consentimiento.js';

export const CONSENTIMIENTO_PORT = Symbol('ConsentimientoPort');

/** `versionTexto` es la aceptada: puede no ser la vigente del texto, y el producto decide si pide reconsentir. */
export interface ConsentimientoVigente {
  finalidad: Finalidad;
  versionTexto: string;
  canal: Canal;
  otorgadoEn: Date;
}

export interface TextoVigente {
  finalidad: Finalidad;
  version: string;
  texto: string;
  publicadoEn: Date;
}

/**
 * `accionExpresa` debe venir en verdadero por una acción del titular (casilla sin marcar por defecto);
 * ausente o falso rechaza el lote. `decision` no tiene valor por defecto.
 */
export interface DecisionComando {
  finalidad: Finalidad;
  decision: Decision;
  versionTexto: string;
  accionExpresa: boolean;
}

export interface RegistrarConsentimientosComando {
  personaId: string;
  canal: Canal;
  evidenciaArchivoId?: string;
  decisiones: DecisionComando[];
}

/** Vista de una fila de per.consentimiento. */
export interface DecisionRegistrada {
  id: string;
  finalidad: Finalidad;
  decision: Decision;
  versionTexto: string;
  canal: Canal;
  evidenciaArchivoId?: string;
  registradoPor: string;
  registradoEn: Date;
  revocadoEn?: Date;
  revocadoPor?: string;
  canalRevocacion?: Canal;
}

/** TR-RF-043. Tenant y usuario salen del TenantContext; no evalúa permisos (los evalúa HTTP). */
export interface ConsentimientoPort {
  vigente(personaId: string, finalidad: Finalidad): Promise<ConsentimientoVigente | null>;
  textosVigentes(): Promise<TextoVigente[]>;
  registrar(comando: RegistrarConsentimientosComando): Promise<DecisionRegistrada[]>;
  revocar(personaId: string, finalidad: Finalidad, canal: Canal): Promise<DecisionRegistrada>;
}
