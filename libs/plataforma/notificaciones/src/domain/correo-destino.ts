import { validarCorreo } from '@vitrina/shared/util';
import { DestinoInvalidoError } from './errores.js';

/** Sin espacios alrededor y en minúsculas: el mismo correo da el mismo hash en `ntf.contacto_invalido`. */
export function normalizarCorreo(valor: string): string {
  const correo = valor.trim().toLowerCase();
  if (!validarCorreo(correo)) throw new DestinoInvalidoError();
  return correo;
}
