import { ValidationError } from '@vitrina/plataforma/kernel';

export function textoRequerido(valor: string, min: number, max: number, campo: string): string {
  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) {
    throw new ValidationError(`${campo} debe tener de ${min} a ${max} caracteres`);
  }
  return limpio;
}

/** Vacío o solo espacios se guarda como null. */
export function textoOpcional(valor: string | null | undefined, max: number, campo: string): string | null {
  const limpio = valor?.trim() || null;
  if (limpio !== null && limpio.length > max) throw new ValidationError(`${campo} admite hasta ${max} caracteres`);
  return limpio;
}
