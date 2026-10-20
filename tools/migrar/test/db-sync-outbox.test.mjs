import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { bajar, subir } from '../migrar.mjs';

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const rutaDb = (sub) => new URL(`../../../db/${sub}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const nombreDb = `outbox_test_${randomBytes(4).toString('hex')}`;
const urlDb = (() => {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${nombreDb}`;
  return u.toString();
})();

async function ejecutar(url, sql) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await c.query(sql);
  } finally {
    await c.end();
  }
}

// Los roles son del clúster: se crean solo si faltan y se borran solo los creados aquí.
const creados = [];
async function asegurarRol(nombre) {
  const { rowCount } = await ejecutar(ADMIN_URL, `SELECT 1 FROM pg_roles WHERE rolname = '${nombre}'`);
  if (rowCount === 0) {
    await ejecutar(ADMIN_URL, `CREATE ROLE ${nombre} NOLOGIN`);
    creados.push(nombre);
  }
}

beforeAll(async () => {
  await ejecutar(ADMIN_URL, `CREATE DATABASE ${nombreDb}`);
  await asegurarRol('anon');
  await asegurarRol('authenticated');
  // Como Supabase: lo que el dueño crea nace concedido a anon y authenticated.
  await ejecutar(
    urlDb,
    `ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated;
     ALTER DEFAULT PRIVILEGES GRANT ALL ON SCHEMAS TO anon, authenticated;`,
  );
});

afterAll(async () => {
  await ejecutar(ADMIN_URL, `DROP DATABASE IF EXISTS ${nombreDb} WITH (FORCE)`);
  await ejecutar(ADMIN_URL, 'DROP ROLE IF EXISTS outbox_test_app');
  for (const rol of creados) await ejecutar(ADMIN_URL, `DROP ROLE IF EXISTS ${rol}`);
});

const existeEsquema = async () => (await ejecutar(urlDb, "SELECT 1 FROM pg_namespace WHERE nspname = 'sync'")).rowCount === 1;

describe('db/01e_sync_outbox.sql', () => {
  test('aplica, pasa la prueba SQL, revierte y vuelve a aplicar', async () => {
    const dir = rutaDb('');
    expect(await subir({ url: urlDb, dir })).toContain('01e_sync_outbox.sql');
    expect(await existeEsquema()).toBe(true);

    await ejecutar(urlDb, await readFile(rutaDb('tests/01e_sync_outbox.test.sql'), 'utf8'));

    expect(await bajar({ url: urlDb, dir })).toContain('01e_sync_outbox.sql');
    expect(await existeEsquema()).toBe(false);

    expect(await subir({ url: urlDb, dir })).toContain('01e_sync_outbox.sql');
    expect(await existeEsquema()).toBe(true);
  });
});
