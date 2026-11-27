import type { MotivoLogoInvalido } from '../../domain/logo.js';

export const VALIDADOR_LOGO_PORT = Symbol('ValidadorLogoPort');

export type ResultadoValidacionLogo = { valido: true } | { valido: false; motivo: MotivoLogoInvalido };

export interface ValidadorLogoPort {
  /** Archivo del tenant del contexto: categoría LOGO, DISPONIBLE y de la entidad EMPRESA con ese id. */
  validar(archivoId: string, empresaId: string): Promise<ResultadoValidacionLogo>;
}
