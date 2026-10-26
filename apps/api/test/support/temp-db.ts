import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { DataSource } from 'typeorm';

const ejecutarArchivo = promisify(execFile);
// Las pruebas de integración crean bases temporales: solo corren con TEST_DATABASE_URL (CI) y nunca
// contra la DATABASE_URL de .env, que apunta a Supabase dev.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
export const describeConDb = ADMIN_URL ? describe : describe.skip;

const conBase = (nombre: string): string => {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${nombre}`;
  return url.toString();
};

async function administrar(sql: string): Promise<void> {
  const dataSource = new DataSource({ type: 'postgres', url: ADMIN_URL });
  await dataSource.initialize();
  try {
    await dataSource.query(sql);
  } finally {
    await dataSource.destroy();
  }
}

export interface BaseTemporal {
  readonly url: string;
  borrar(): Promise<void>;
}

/** Base temporal con db/ aplicado por el runner de migraciones. */
export async function crearBaseTemporal(): Promise<BaseTemporal> {
  const nombre = `api_${randomBytes(4).toString('hex')}`;
  const url = conBase(nombre);
  const borrar = () => administrar(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
  await administrar(`CREATE DATABASE ${nombre}`);
  try {
    await ejecutarArchivo('node', ['tools/migrar/cli.mjs', 'up', 'db'], { env: { ...process.env, DATABASE_URL: url } });
  } catch (error) {
    await borrar();
    throw error;
  }
  return { url, borrar };
}
