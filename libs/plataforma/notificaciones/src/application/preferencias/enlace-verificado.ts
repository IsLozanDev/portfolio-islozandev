import type { CargaEnlace } from '../../domain/enlace-preferencias.js';
import { EnlaceInvalidoError } from '../../domain/errores.js';
import type { DependenciasPreferencias } from '../dependencias.js';

/** TR-CA-194: firma mala, vencido, formato roto o sin clave configurada dan el mismo error, sin datos. */
export function verificarEnlace(dependencias: DependenciasPreferencias, token: string): CargaEnlace {
  const carga = dependencias.firmador?.verificar(token, dependencias.reloj.now()) ?? null;
  if (!carga) throw new EnlaceInvalidoError();
  return carga;
}
