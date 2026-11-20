import { Consentimiento, exigirCanal, exigirFinalidad, type Canal, type Finalidad } from './consentimiento.js';
import {
  DatosConsentimientoInvalidosError,
  FinalidadRepetidaError,
  SinConsentimientoVigenteError,
  TextoNoPublicadoError,
  VersionTextoNoVigenteError,
} from './errores.js';
import type { TextoFinalidad } from './texto-finalidad.js';

export interface DecisionDelLote {
  finalidad: string;
  decision?: string;
  versionTexto: string;
  accionExpresa?: boolean;
}

/** Lo común a todas las decisiones del lote. */
export interface RegistroDelLote {
  canal: string;
  evidenciaArchivoId: string | null;
  registradoPor: string;
  registradoEn: Date;
  nuevoId: () => string;
}

/**
 * `revocadas`: los ACEPTA que un RECHAZA revocó (publican `consentimiento.revocado`). `reemplazadas`: los ACEPTA
 * que un ACEPTA nuevo deja atrás; el consentimiento sigue, así que no publican evento.
 */
export interface ResultadoDelLote {
  nuevas: Consentimiento[];
  revocadas: Consentimiento[];
  reemplazadas: Consentimiento[];
}

/** Decisiones de una persona por finalidad. La vigente de cada finalidad es la de mayor `registradoEn`. */
export class ConsentimientosDePersona {
  constructor(
    private readonly personaId: string,
    private readonly historial: readonly Consentimiento[],
  ) {}

  decisionVigente(finalidad: Finalidad): Consentimiento | null {
    return this.historial
      .filter((consentimiento) => consentimiento.finalidad === finalidad)
      .reduce<Consentimiento | null>((masReciente, consentimiento) =>
        masReciente && masReciente.registradoEn >= consentimiento.registradoEn ? masReciente : consentimiento, null);
  }

  consentimientoVigente(finalidad: Finalidad): Consentimiento | null {
    const decision = this.decisionVigente(finalidad);
    return decision?.consiente ? decision : null;
  }

  /** Todo o nada: valida el lote completo contra los textos vigentes antes de crear una sola decisión. */
  registrar(lote: readonly DecisionDelLote[], textosVigentes: readonly TextoFinalidad[], registro: RegistroDelLote): ResultadoDelLote {
    exigirLoteSinRepetidas(lote);
    const canal = exigirCanal(registro.canal);
    const nuevas = lote.map((decision) => this.crearDecision(decision, textosVigentes, registro));
    const resultado: ResultadoDelLote = { nuevas, revocadas: [], reemplazadas: [] };
    for (const nueva of nuevas) this.dejarAtrasLaAceptada(nueva, canal, resultado);
    return resultado;
  }

  revocar(finalidad: Finalidad, usuarioId: string, canal: Canal, ahora: Date): Consentimiento {
    const vigente = this.consentimientoVigente(finalidad);
    if (!vigente) throw new SinConsentimientoVigenteError();
    return vigente.revocar(usuarioId, canal, ahora);
  }

  private crearDecision(decision: DecisionDelLote, textosVigentes: readonly TextoFinalidad[], registro: RegistroDelLote): Consentimiento {
    const finalidad = exigirFinalidad(decision.finalidad);
    const textoVigente = textosVigentes.find((texto) => texto.finalidad === finalidad);
    if (!textoVigente) throw new TextoNoPublicadoError(finalidad);
    if (decision.versionTexto !== textoVigente.version) throw new VersionTextoNoVigenteError(finalidad, textoVigente.version);
    return Consentimiento.crear({
      ...decision,
      id: registro.nuevoId(),
      personaId: this.personaId,
      canal: registro.canal,
      evidenciaArchivoId: registro.evidenciaArchivoId,
      registradoPor: registro.registradoPor,
      registradoEn: registro.registradoEn,
    });
  }

  private dejarAtrasLaAceptada(nueva: Consentimiento, canal: Canal, resultado: ResultadoDelLote): void {
    const aceptada = this.consentimientoVigente(nueva.finalidad);
    if (!aceptada) return;
    const cerrada = aceptada.revocar(nueva.registradoPor, canal, nueva.registradoEn);
    if (nueva.consiente) resultado.reemplazadas.push(cerrada);
    else resultado.revocadas.push(cerrada);
  }
}

function exigirLoteSinRepetidas(lote: readonly DecisionDelLote[]): void {
  if (lote.length === 0) throw new DatosConsentimientoInvalidosError('El lote debe traer al menos una decisión');
  const finalidades = new Set<string>();
  for (const { finalidad } of lote) {
    if (finalidades.has(finalidad)) throw new FinalidadRepetidaError(finalidad);
    finalidades.add(finalidad);
  }
}
