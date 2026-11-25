import { MismaPersonaError } from './errores.js';

/** Reglas fijas y explicables de TR-RF-042; sin IA ni fonética avanzada. */
export const MOTIVOS_DUPLICADO = ['MISMO_NUMERO_OTRO_TIPO', 'CELULAR_Y_NOMBRE_IGUAL', 'CELULAR_Y_NOMBRE_PARECIDO'] as const;
export type MotivoDuplicado = (typeof MOTIVOS_DUPLICADO)[number];

export const PUNTAJES_DUPLICADO: Record<MotivoDuplicado, number> = {
  MISMO_NUMERO_OTRO_TIPO: 100,
  CELULAR_Y_NOMBRE_IGUAL: 80,
  CELULAR_Y_NOMBRE_PARECIDO: 60,
};

/** Un par entra en la lista desde este puntaje. */
export const PUNTAJE_MINIMO = 60;

/** Similitud de trigramas de `busqueda_texto` para la regla `CELULAR_Y_NOMBRE_PARECIDO`. */
export const SIMILITUD_NOMBRE_MINIMA = 0.8;

/** El mayor de los motivos que cumple el par; 0 sin motivos. */
export function puntajeDe(motivos: readonly MotivoDuplicado[]): number {
  return Math.max(0, ...motivos.map((motivo) => PUNTAJES_DUPLICADO[motivo]));
}

/** Dos personas distintas en orden (menor, mayor), como `per.par_descartado`: (a, b) y (b, a) son el mismo par. */
export class ParPersonas {
  private constructor(
    readonly menor: string,
    readonly mayor: string,
  ) {}

  /** Los uuid en minúsculas se ordenan como en PostgreSQL. */
  static de(unaPersonaId: string, otraPersonaId: string): ParPersonas {
    const una = unaPersonaId.toLowerCase();
    const otra = otraPersonaId.toLowerCase();
    if (una === otra) throw new MismaPersonaError();
    return una < otra ? new ParPersonas(una, otra) : new ParPersonas(otra, una);
  }
}
