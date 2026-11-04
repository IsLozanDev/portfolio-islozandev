import type { BitacoraIngreso, EventoIngreso } from './ports/bitacora-ingreso.port.js';
import type { ClaveBloqueo, ContadorIntentos } from './ports/contador-intentos.port.js';
import { IngresoBloqueadoError } from '../domain/errores.js';

export type Avisar = (mensaje: string, datos: Record<string, unknown>) => void;

/** User-Agent recortado para la bitácora (spec 18b). */
const LONGITUD_MAXIMA_AGENTE = 200;

export function agenteRecortado(agente: string | null | undefined): string | null {
  return agente ? agente.slice(0, LONGITUD_MAXIMA_AGENTE) : null;
}

/**
 * El ingreso no depende de la bitácora: si la escritura falla, se avisa y se sigue (decisión del spec).
 * El aviso lleva solo el tipo y el nombre del error, nunca el correo (TR-RNF-026).
 */
export async function registrarSinBloquear(bitacora: BitacoraIngreso, evento: EventoIngreso, avisar: Avisar): Promise<void> {
  try {
    await bitacora.registrar(evento);
  } catch (error) {
    avisar('seg.ingreso.bitacora_error', { tipo: evento.tipo, error: error instanceof Error ? error.name : typeof error });
  }
}

/** Si alguna clave sigue bloqueada, corta antes de llamar al proveedor y sin escribir fila. */
export async function exigirSinBloqueo(contador: ContadorIntentos, claves: readonly ClaveBloqueo[], avisar: Avisar): Promise<void> {
  const restantes = await contador.bloqueoVigente(claves);
  if (restantes === null) return;
  avisar('seg.ingreso.bloqueado', { alcances: claves.map((clave) => clave.alcance) });
  throw new IngresoBloqueadoError(restantes);
}
