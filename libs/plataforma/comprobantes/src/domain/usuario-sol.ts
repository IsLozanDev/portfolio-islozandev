import { UsuarioSolInvalidoError } from './errores.js';

const PATRON_USUARIO_SOL = /^[A-Z0-9]+$/;
/** Un RUC delante (11 dígitos): el usuario escribe solo lo que usa en SOL y no puede poner otro RUC. */
const PATRON_RUC_AL_INICIO = /^\d{11}/;

/** Usuario secundario SOL tal como se escribe en SOL: alfanumérico en mayúsculas, sin el RUC. */
export function exigirUsuarioSol(texto: string): string {
  const usuario = texto.trim();
  if (!PATRON_USUARIO_SOL.test(usuario) || PATRON_RUC_AL_INICIO.test(usuario)) throw new UsuarioSolInvalidoError();
  return usuario;
}

/** El `Username` de WS-Security que pide SUNAT: RUC del emisor seguido del usuario secundario SOL. */
export function usuarioWsSecurity(ruc: string, usuarioSol: string): string {
  return `${ruc}${usuarioSol}`;
}
