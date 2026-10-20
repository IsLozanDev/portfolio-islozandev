import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { bajar, subir } from '../migrar.mjs';

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const rutaDb = (sub) => new URL(`../../../db/${sub}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const nombreDb = `esquemas_test_${randomBytes(4).toString('hex')}`;
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
  for (const rol of ['outbox_test_app', 'org_test_app', ...creados]) await ejecutar(ADMIN_URL, `DROP ROLE IF EXISTS ${rol}`);
});

// Una sola base para todas: los roles anon/authenticated son del clúster y dos archivos de Jest
// en paralelo los crearían y borrarían a la vez.
const CASOS = [
  { migracion: '01a_org.sql', esquema: 'org', prueba: 'tests/01a_org.test.sql' },
  { migracion: '01e_sync_outbox.sql', esquema: 'sync', prueba: 'tests/01e_sync_outbox.test.sql' },
];

const existeEsquema = async (esquema) =>
  (await ejecutar(urlDb, `SELECT 1 FROM pg_namespace WHERE nspname = '${esquema}'`)).rowCount === 1;

describe('db/', () => {
  test('aplica, pasa las pruebas SQL, revierte y vuelve a aplicar', async () => {
    const dir = rutaDb('');
    const migraciones = CASOS.map((c) => c.migracion);
    expect(await subir({ url: urlDb, dir })).toEqual(expect.arrayContaining(migraciones));
    for (const { esquema } of CASOS) expect(await existeEsquema(esquema)).toBe(true);

    for (const { prueba } of CASOS) await ejecutar(urlDb, await readFile(rutaDb(prueba), 'utf8'));

    expect(await bajar({ url: urlDb, dir })).toEqual(expect.arrayContaining(migraciones));
    for (const { esquema } of CASOS) expect(await existeEsquema(esquema)).toBe(false);

    expect(await subir({ url: urlDb, dir })).toEqual(expect.arrayContaining(migraciones));
    for (const { esquema } of CASOS) expect(await existeEsquema(esquema)).toBe(true);
  });
});
