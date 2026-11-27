import type { ResultadoValidacionLogo, ValidadorLogoPort } from '../application/ports/validador-logo.port.js';

/** Por defecto en OrgModule: sin el adaptador real sobre ARC, un logo nunca entra sin validar. */
export class ValidadorLogoRechazaTodo implements ValidadorLogoPort {
  async validar(): Promise<ResultadoValidacionLogo> {
    return { valido: false, motivo: 'NO_ENCONTRADO' };
  }
}
