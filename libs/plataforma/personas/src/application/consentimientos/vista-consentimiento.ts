import type { Consentimiento, Finalidad } from '../../domain/consentimiento.js';
import type { TextoFinalidad } from '../../domain/texto-finalidad.js';
import type { ConsentimientoVigente, DecisionRegistrada, TextoVigente } from '../ports/consentimiento.port.js';

/** La decisión vigente de una finalidad, o `null` si la persona nunca decidió en ella. */
export interface DecisionPorFinalidad {
  finalidad: Finalidad;
  decision: DecisionRegistrada | null;
}

export interface TextoPublicado extends TextoVigente {
  id: string;
  publicadoPor: string;
}

export function decisionRegistradaDe(consentimiento: Consentimiento): DecisionRegistrada {
  const revocacion = consentimiento.revocacion;
  return {
    id: consentimiento.id,
    personaId: consentimiento.personaId,
    finalidad: consentimiento.finalidad,
    decision: consentimiento.decision,
    versionTexto: consentimiento.versionTexto,
    canal: consentimiento.canal,
    ...(consentimiento.evidenciaArchivoId ? { evidenciaArchivoId: consentimiento.evidenciaArchivoId } : {}),
    registradoPor: consentimiento.registradoPor,
    registradoEn: consentimiento.registradoEn,
    ...(revocacion ? { revocadoEn: revocacion.revocadoEn, revocadoPor: revocacion.revocadoPor, canalRevocacion: revocacion.canal } : {}),
  };
}

export function consentimientoVigenteDe(consentimiento: Consentimiento): ConsentimientoVigente {
  return {
    finalidad: consentimiento.finalidad,
    versionTexto: consentimiento.versionTexto,
    canal: consentimiento.canal,
    otorgadoEn: consentimiento.registradoEn,
  };
}

export function textoPublicadoDe(texto: TextoFinalidad): TextoPublicado {
  const { id, finalidad, version, texto: contenido, publicadoPor, publicadoEn } = texto.datos;
  return { id, finalidad, version, texto: contenido, publicadoPor, publicadoEn };
}
