import { validarDocumento } from './documento.js';

export function validarRuc(ruc: string): boolean {
  return validarDocumento('RUC', ruc).valido;
}
