import { AccionExpresaRequeridaError, DatosConsentimientoInvalidosError, SinConsentimientoVigenteError } from './errores.js';

export const FINALIDADES = ['PRESTACION', 'PROMOCIONES', 'COMPARTIR_PRODUCTOS', 'DATOS_SALUD', 'IDENTIDAD_PORTABLE'] as const;
export type Finalidad = (typeof FINALIDADES)[number];

export const DECISIONES = ['ACEPTA', 'RECHAZA'] as const;
export type Decision = (typeof DECISIONES)[number];

export const CANALES = ['PRESENCIAL', 'WEB', 'WHATSAPP', 'KIOSCO'] as const;
export type Canal = (typeof CANALES)[number];

const DECISION_QUE_CONSIENTE: Decision = 'ACEPTA';

function esDeLaLista<Valor extends string>(lista: readonly Valor[], valor: string | undefined): valor is Valor {
  return (lista as readonly (string | undefined)[]).includes(valor);
}

/** Los consumidores en proceso pueden pasar cualquier texto: el dominio valida las listas. */
export function exigirFinalidad(valor: string): Finalidad {
  if (!esDeLaLista(FINALIDADES, valor)) throw new DatosConsentimientoInvalidosError('La finalidad no existe');
  return valor;
}

export function exigirCanal(valor: string): Canal {
  if (!esDeLaLista(CANALES, valor)) throw new DatosConsentimientoInvalidosError('El canal no existe');
  return valor;
}

function exigirDecision(valor: string | undefined): Decision {
  if (!esDeLaLista(DECISIONES, valor)) throw new DatosConsentimientoInvalidosError('Cada decisión debe ser ACEPTA o RECHAZA');
  return valor;
}

export interface Revocacion {
  revocadoEn: Date;
  revocadoPor: string;
  canal: Canal;
}

export interface DatosConsentimiento {
  id: string;
  personaId: string;
  finalidad: Finalidad;
  decision: Decision;
  versionTexto: string;
  canal: Canal;
  evidenciaArchivoId: string | null;
  registradoPor: string;
  registradoEn: Date;
  revocacion: Revocacion | null;
}

/** Lo que llega para crear una decisión: `decision` y `accionExpresa` pueden faltar y se rechazan. */
export interface DatosDecisionNueva extends Omit<DatosConsentimiento, 'decision' | 'revocacion' | 'finalidad' | 'canal'> {
  finalidad: string;
  canal: string;
  decision?: string;
  accionExpresa?: boolean;
}

/** TR-RF-043: una decisión expresa de la persona en una finalidad. Inmutable: revocar devuelve otra. */
export class Consentimiento {
  private constructor(private readonly datos: DatosConsentimiento) {}

  static crear(datos: DatosDecisionNueva): Consentimiento {
    const { accionExpresa, ...resto } = datos;
    const finalidad = exigirFinalidad(datos.finalidad);
    const canal = exigirCanal(datos.canal);
    const decision = exigirDecision(datos.decision);
    if (accionExpresa !== true) throw new AccionExpresaRequeridaError();
    return new Consentimiento({ ...resto, finalidad, canal, decision, revocacion: null });
  }

  static reconstituir(datos: DatosConsentimiento): Consentimiento {
    return new Consentimiento(datos);
  }

  get id(): string {
    return this.datos.id;
  }

  get personaId(): string {
    return this.datos.personaId;
  }

  get finalidad(): Finalidad {
    return this.datos.finalidad;
  }

  get decision(): Decision {
    return this.datos.decision;
  }

  get versionTexto(): string {
    return this.datos.versionTexto;
  }

  get canal(): Canal {
    return this.datos.canal;
  }

  get evidenciaArchivoId(): string | null {
    return this.datos.evidenciaArchivoId;
  }

  get registradoPor(): string {
    return this.datos.registradoPor;
  }

  get registradoEn(): Date {
    return this.datos.registradoEn;
  }

  get revocacion(): Revocacion | null {
    return this.datos.revocacion;
  }

  /** Aceptada y sin revocar, aunque su versión del texto ya no sea la vigente. */
  get consiente(): boolean {
    return this.datos.decision === DECISION_QUE_CONSIENTE && this.datos.revocacion === null;
  }

  revocar(usuarioId: string, canal: Canal, ahora: Date): Consentimiento {
    if (!this.consiente) throw new SinConsentimientoVigenteError();
    return new Consentimiento({ ...this.datos, revocacion: { revocadoEn: ahora, revocadoPor: usuarioId, canal } });
  }
}
