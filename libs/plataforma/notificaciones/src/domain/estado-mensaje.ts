export const ESTADOS_MENSAJE = [
  'ENCOLADO',
  'ENVIADO',
  'ENTREGADO',
  'LEIDO',
  'FALLIDO',
  'OMITIDO_SIN_CONSENTIMIENTO',
  'DESCARTADO',
] as const;
export type EstadoMensaje = (typeof ESTADOS_MENSAJE)[number];

const ORDEN_DE_AVANCE: readonly EstadoMensaje[] = ['ENCOLADO', 'ENVIADO', 'ENTREGADO', 'LEIDO'];
const ESTADOS_FINALES: readonly EstadoMensaje[] = ['FALLIDO', 'OMITIDO_SIN_CONSENTIMIENTO', 'DESCARTADO'];

export function esFinal(estado: EstadoMensaje): boolean {
  return ESTADOS_FINALES.includes(estado);
}

/**
 * Los avisos del proveedor llegan repetidos y desordenados: el estado solo avanza. Devuelve el estado nuevo, o
 * `null` si es el mismo, retrocede o el actual ya es final. `FALLIDO` se alcanza desde cualquier estado no final.
 */
export function avanzar(actual: EstadoMensaje, nuevo: EstadoMensaje): EstadoMensaje | null {
  if (esFinal(actual)) return null;
  if (nuevo === 'FALLIDO') return nuevo;
  if (esFinal(nuevo)) return null;
  return ORDEN_DE_AVANCE.indexOf(nuevo) > ORDEN_DE_AVANCE.indexOf(actual) ? nuevo : null;
}
