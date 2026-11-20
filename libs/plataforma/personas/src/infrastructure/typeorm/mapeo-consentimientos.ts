import { Consentimiento, type Canal, type Decision, type Finalidad } from '../../domain/consentimiento.js';
import { TextoFinalidad } from '../../domain/texto-finalidad.js';
import type { FilaConsentimiento, FilaTextoFinalidad } from './entidades.js';

/** Una decisión siempre llega con acción expresa: el dominio no crea otra y el CHECK de la base tampoco la admite. */
const CON_ACCION_EXPRESA = true;

type ColumnasDeRevocacion = Pick<FilaConsentimiento, 'revocadoEn' | 'revocadoPor' | 'canalRevocacion'>;

export function filaDesdeConsentimiento(consentimiento: Consentimiento, tenantId: string): FilaConsentimiento {
  return {
    id: consentimiento.id,
    tenantId,
    personaId: consentimiento.personaId,
    finalidad: consentimiento.finalidad,
    decision: consentimiento.decision,
    versionTexto: consentimiento.versionTexto,
    canal: consentimiento.canal,
    accionExpresa: CON_ACCION_EXPRESA,
    evidenciaArchivoId: consentimiento.evidenciaArchivoId,
    registradoPor: consentimiento.registradoPor,
    registradoEn: consentimiento.registradoEn,
    ...columnasDeRevocacion(consentimiento),
  };
}

export function columnasDeRevocacion(consentimiento: Consentimiento): ColumnasDeRevocacion {
  const revocacion = consentimiento.revocacion;
  return {
    revocadoEn: revocacion?.revocadoEn ?? null,
    revocadoPor: revocacion?.revocadoPor ?? null,
    canalRevocacion: revocacion?.canal ?? null,
  };
}

// Los CHECK de per garantizan que cada texto pertenece a su lista del dominio.
export function consentimientoDesdeFila(fila: FilaConsentimiento): Consentimiento {
  const revocacion =
    fila.revocadoEn && fila.revocadoPor && fila.canalRevocacion
      ? { revocadoEn: fila.revocadoEn, revocadoPor: fila.revocadoPor, canal: fila.canalRevocacion as Canal }
      : null;
  return Consentimiento.reconstituir({
    id: fila.id,
    personaId: fila.personaId,
    finalidad: fila.finalidad as Finalidad,
    decision: fila.decision as Decision,
    versionTexto: fila.versionTexto,
    canal: fila.canal as Canal,
    evidenciaArchivoId: fila.evidenciaArchivoId,
    registradoPor: fila.registradoPor,
    registradoEn: fila.registradoEn,
    revocacion,
  });
}

export function filaDesdeTexto(texto: TextoFinalidad, tenantId: string): FilaTextoFinalidad {
  return { ...texto.datos, tenantId };
}

export function textoDesdeFila(fila: FilaTextoFinalidad): TextoFinalidad {
  return TextoFinalidad.reconstituir({
    id: fila.id,
    finalidad: fila.finalidad as Finalidad,
    version: fila.version,
    texto: fila.texto,
    publicadoPor: fila.publicadoPor,
    publicadoEn: fila.publicadoEn,
  });
}
