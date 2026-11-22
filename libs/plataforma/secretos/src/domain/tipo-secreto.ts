import { TipoSecretoInvalidoError } from './errores.js';

/** `componente.nombre`, p. ej. `fe.clave_certificado` o `pag.llave_privada`. Cada consumidor define los suyos. */
export type TipoSecreto = string & { readonly __tipoSecreto: unique symbol };

/** El mismo formato y largo que el CHECK de sec.secreto.tipo. */
const FORMATO_TIPO = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const LONGITUD_MAXIMA_TIPO = 60;

export function exigirTipoSecreto(tipo: string): TipoSecreto {
  if (tipo.length > LONGITUD_MAXIMA_TIPO || !FORMATO_TIPO.test(tipo)) throw new TipoSecretoInvalidoError();
  return tipo as TipoSecreto;
}
