import { z } from 'zod';
import { ClavesMaestras } from '../domain/claves-maestras.js';
import { ClaveMaestraInvalidaError } from '../domain/errores.js';

const AMBIENTE_PRODUCCION = 'production';
const SEPARADOR_CLAVES = ';';
const SEPARADOR_VERSION = ':';
const VERSION = /^\d+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// `VARIABLE=` en un .env llega como texto vacío: cuenta como no configurada.
const opcional = <Esquema extends z.ZodType>(esquema: Esquema) =>
  z.preprocess((valor) => (valor === '' ? undefined : valor), esquema.optional());

/**
 * Variables de la bóveda que validan apps/api y apps/worker con zod (regla 9: las claves maestras solo viven en el
 * entorno de esas dos apps). `SEC_CLAVES_MAESTRAS = "1:<base64 de 32 bytes>;2:<base64 de 32 bytes>"`.
 */
export const camposEntornoSecretos = {
  SEC_CLAVES_MAESTRAS: opcional(z.string().trim().min(1)),
  SEC_CLAVE_ACTIVA: opcional(z.coerce.number().int().positive()),
};

type EntornoSecretos = z.infer<z.ZodObject<typeof camposEntornoSecretos>>;

/**
 * Para `superRefine` del esquema de la app. En producción las dos variables son obligatorias; en cualquier ambiente,
 * si están, deben ser válidas: cada clave decodifica a 32 bytes y la activa está en la lista. Ningún mensaje lleva
 * una clave.
 */
export function exigirClaveMaestraEnProduccion(entorno: EntornoSecretos & { APP_ENV: string }, contexto: z.RefinementCtx): void {
  if (entorno.APP_ENV === AMBIENTE_PRODUCCION) exigirLasDos(entorno, contexto);
  try {
    clavesMaestrasDe(entorno);
  } catch (error) {
    if (!(error instanceof ClaveMaestraInvalidaError)) throw error;
    contexto.addIssue({ code: 'custom', path: ['SEC_CLAVES_MAESTRAS'], message: error.message });
  }
}

/** Las claves para `SecretosModule`, a partir de un entorno ya validado. Sin ninguna de las dos variables, `undefined`. */
export function clavesMaestrasDe(entorno: EntornoSecretos): ClavesMaestras | undefined {
  const { SEC_CLAVES_MAESTRAS: lista, SEC_CLAVE_ACTIVA: activa } = entorno;
  if (lista === undefined && activa === undefined) return undefined;
  if (lista === undefined || activa === undefined) {
    throw new ClaveMaestraInvalidaError('SEC_CLAVES_MAESTRAS y SEC_CLAVE_ACTIVA van juntas');
  }
  return ClavesMaestras.crear(leerClaves(lista), activa);
}

function exigirLasDos(entorno: EntornoSecretos, contexto: z.RefinementCtx): void {
  if (entorno.SEC_CLAVES_MAESTRAS === undefined) {
    contexto.addIssue({ code: 'custom', path: ['SEC_CLAVES_MAESTRAS'], message: 'obligatoria en producción' });
  }
  if (entorno.SEC_CLAVE_ACTIVA === undefined) {
    contexto.addIssue({ code: 'custom', path: ['SEC_CLAVE_ACTIVA'], message: 'obligatoria en producción' });
  }
}

function leerClaves(lista: string): Map<number, Uint8Array> {
  const claves = new Map<number, Uint8Array>();
  for (const entrada of lista.split(SEPARADOR_CLAVES).map((parte) => parte.trim()).filter(Boolean)) {
    const [version, base64, ...sobrante] = entrada.split(SEPARADOR_VERSION).map((parte) => parte.trim());
    if (!version || !base64 || sobrante.length > 0 || !VERSION.test(version) || !BASE64.test(base64)) {
      throw new ClaveMaestraInvalidaError('Cada clave maestra va como <versión>:<base64>, separadas por ;');
    }
    const numeroVersion = Number(version);
    if (claves.has(numeroVersion)) throw new ClaveMaestraInvalidaError(`La versión ${version} está repetida`);
    claves.set(numeroVersion, Buffer.from(base64, 'base64'));
  }
  return claves;
}
