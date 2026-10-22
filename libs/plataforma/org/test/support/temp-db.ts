import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { DataSource } from 'typeorm';

const exec = promisify(execFile);
// Las pruebas de integración crean bases temporales: solo corren con TEST_DATABASE_URL (CI) y nunca
// contra la DATABASE_URL de .env, que apunta a Supabase dev.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
export const describeConDb = ADMIN_URL ? describe : describe.skip;

const withDb = (name: string): string => {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
};

async function admin(sql: string): Promise<void> {
  const ds = new DataSource({ type: 'postgres', url: ADMIN_URL });
  await ds.initialize();
  try {
    await ds.query(sql);
  } finally {
    await ds.destroy();
  }
}

export interface TempDb {
  readonly url: string;
  drop(): Promise<void>;
}

/** Base temporal con db/ aplicado por el runner de migraciones. */
export async function createTempDb(): Promise<TempDb> {
  const name = `org_${randomBytes(4).toString('hex')}`;
  const url = withDb(name);
  await admin(`CREATE DATABASE ${name}`);
  try {
    await exec('node', ['tools/migrar/cli.mjs', 'up', 'db'], { env: { ...process.env, DATABASE_URL: url } });
  } catch (error) {
    await admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    throw error;
  }
  return { url, drop: () => admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`) };
}
