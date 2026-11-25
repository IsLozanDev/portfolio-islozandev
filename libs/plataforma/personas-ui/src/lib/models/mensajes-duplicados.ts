import type { CodigoBloqueo, MotivoDuplicado } from './duplicados';
import type { ErrorPersonas } from './error-personas';
import { mensajeDeError } from './mensajes-personas';

export const ETIQUETAS_MOTIVO: Record<MotivoDuplicado, string> = {
  MISMO_NUMERO_OTRO_TIPO: 'Mismo número, otro tipo de documento',
  CELULAR_Y_NOMBRE_IGUAL: 'Mismo celular y nombre',
  CELULAR_Y_NOMBRE_PARECIDO: 'Mismo celular, nombre parecido',
};

export const MENSAJES_BLOQUEO: Record<CodigoBloqueo, string> = {
  DOCUMENTOS_DISTINTOS: 'Las personas tienen documentos distintos',
  TIPO_PERSONA_DISTINTO: 'Una es persona natural y la otra jurídica',
  PERSONA_FUSIONADA: 'Una de las fichas ya se fusionó con otra',
  MISMA_PERSONA: 'Es la misma ficha',
};

/** Errores de la fusión y del descarte; los que no están aquí, como el resto de personas. */
const MENSAJES_ERROR_DUPLICADOS: Record<string, string> = {
  ...MENSAJES_BLOQUEO,
  MOTIVO_INVALIDO: 'El motivo debe tener entre 5 y 300 caracteres',
  CAMPO_ELEGIDO_INVALIDO: 'La elección ya no corresponde a las fichas; se recargó la comparación',
  VERSION_OBSOLETA: 'Una de las fichas cambió; se recargó la comparación',
  DESCARTE_NO_ENCONTRADO: 'El par ya no estaba descartado',
};

export const MENSAJES_DUPLICADOS = {
  fusionada: 'Fichas fusionadas',
  descartado: (personaA: string, personaB: string) => `Se descartó el par ${personaA} — ${personaB}`,
  aliasResuelto: (denominacion: string) => `Esta ficha se fusionó en ${denominacion}. Se muestra la ficha vigente.`,
  vacioTitulo: 'No hay posibles duplicados',
  vacioTexto: 'Se proponen pares con el mismo número en otro tipo de documento o el mismo celular',
} as const;

export function motivosDe(motivos: readonly MotivoDuplicado[]): string {
  return motivos.map((motivo) => ETIQUETAS_MOTIVO[motivo]).join(', ');
}

export function mensajeDeErrorDuplicados(error: ErrorPersonas): string {
  return MENSAJES_ERROR_DUPLICADOS[error.codigo] ?? mensajeDeError(error);
}
