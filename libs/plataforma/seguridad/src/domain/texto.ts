import { ValidationError } from '@vitrina/plataforma/kernel';

export function textoRequerido(valor: string, min: number, max: number, campo: string): string {
  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) {
    throw new ValidationError(`${campo} debe tener de ${min} a ${max} caracteres`);
  }
  return limpio;
}
