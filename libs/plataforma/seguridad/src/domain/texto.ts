import { ValidationError } from '@vitrina/plataforma/kernel';
import { MotivoInvalidoError } from './errores.js';

export function textoRequerido(valor: string, min: number, max: number, campo: string): string {
  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) {
    throw new ValidationError(`${campo} debe tener de ${min} a ${max} caracteres`);
  }
  return limpio;
}

/** Motivo de suspender, reactivar, finalizar o revocar (TR-RNF-021). Mínimo 4, no 5 como TR-RF-014: TR-CA-039 usa «Cese». */
export function motivo(valor: string): string {
  const limpio = valor.trim();
  if (limpio.length < 4 || limpio.length > 300) throw new MotivoInvalidoError();
  return limpio;
}
