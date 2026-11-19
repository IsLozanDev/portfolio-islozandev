import type { OpcionesAntivirus } from '@vitrina/plataforma/archivos';
import { describeConDb } from './temp-db.js';

const PUERTO_CLAMD = 3310;
// El servicio `clamav` del CI: sin CLAMAV_HOST no hay clamd y estas pruebas se saltan.
const HOST = process.env.CLAMAV_HOST ?? '';
/** Pruebas que necesitan PostgreSQL y clamd reales. */
export const describeConDbYClamav = HOST ? describeConDb : describe.skip;

export const ANTIVIRUS_CLAMAV: OpcionesAntivirus = {
  motor: 'clamav',
  host: HOST,
  puerto: Number(process.env.CLAMAV_PORT ?? PUERTO_CLAMD),
  tiempoConexionMs: 5_000,
  tiempoRespuestaMs: 60_000,
};
