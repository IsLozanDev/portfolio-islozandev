import type { OpcionesClamav } from '../../src/infrastructure/antivirus/analizador-clamav.js';

const PUERTO_CLAMD = 3310;
// Las pruebas con clamd real solo corren con CLAMAV_HOST (el servicio `clamav` del CI): en local no hay ClamAV.
const HOST = process.env.CLAMAV_HOST ?? '';
export const describeConClamav = HOST ? describe : describe.skip;

export const OPCIONES_CLAMAV: OpcionesClamav = {
  host: HOST,
  puerto: Number(process.env.CLAMAV_PORT ?? PUERTO_CLAMD),
  tiempoConexionMs: 5_000,
  tiempoRespuestaMs: 60_000,
};
