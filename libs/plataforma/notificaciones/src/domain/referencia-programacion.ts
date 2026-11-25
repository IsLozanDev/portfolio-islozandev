import { ReferenciaInvalidaError } from './errores.js';

/** El objeto del producto al que pertenece el recordatorio, p. ej. `{ tipo: 'psi.cita', id: '…' }`. */
export interface ReferenciaProgramacion {
  tipo: string;
  id: string;
}

/** Mismo formato que el CHECK de `ntf.programacion.referencia_tipo`. */
const FORMATO_TIPO = /^[a-z][a-z0-9_.]{1,39}$/;
const LARGO_MAXIMO_ID = 100;

export function validarReferencia(referencia: ReferenciaProgramacion): ReferenciaProgramacion {
  const { tipo, id } = referencia;
  if (!FORMATO_TIPO.test(tipo)) throw new ReferenciaInvalidaError();
  if (id.length === 0 || id.length > LARGO_MAXIMO_ID) throw new ReferenciaInvalidaError();
  return { tipo, id };
}
