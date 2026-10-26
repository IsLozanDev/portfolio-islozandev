import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { bajar, subir } from '../migrar.mjs';

// Aplica, prueba, revierte y reaplica todo: con lint, build y otras suites creando bases en paralelo
// pasa de los 5 s por defecto, y al vencer afterAll borra la base con la migración en curso.
const TIMEOUT_MS = 60_000;

// Crea bases temporales: solo con TEST_DATABASE_URL (CI), nunca contra la DATABASE_URL de .env.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? '';
const describeConDb = ADMIN_URL ? describe : describe.skip;
const ruta = (rel) => new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const rutaDb = (sub) => ruta(`../../../db/${sub}`);
const rutaSupabase = (sub) => ruta(`../../../supabase/${sub}`);

const nombreDb = `esquemas_test_${randomBytes(4).toString('hex')}`;
const urlDb = (() => {
  if (!ADMIN_URL) return '';
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
  if (!ADMIN_URL) return;
  await ejecutar(ADMIN_URL, `CREATE DATABASE ${nombreDb}`);
  await asegurarRol('anon');
  await asegurarRol('authenticated');
  await asegurarRol('supabase_auth_admin');
  // Como Supabase: lo que el dueño crea nace concedido a anon y authenticated.
  await ejecutar(
    urlDb,
    `ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated;
     ALTER DEFAULT PRIVILEGES GRANT ALL ON SCHEMAS TO anon, authenticated;`,
  );
}, TIMEOUT_MS);

afterAll(async () => {
  if (!ADMIN_URL) return;
  await ejecutar(ADMIN_URL, `DROP DATABASE IF EXISTS ${nombreDb} WITH (FORCE)`);
  // sync_lector no se borra: es del clúster, como anon, y es dueño de las funciones de otras bases temporales en paralelo.
  for (const rol of ['outbox_test_app', 'org_test_app', 'org_alta_test_app', 'org_alta_test_sin_permiso', 'seg_test_app', 'cfg_test_app', 'seq_test_app', 'sync_test_app', 'sync_test_sin_permiso', ...creados]) await ejecutar(ADMIN_URL, `DROP ROLE IF EXISTS ${rol}`);
}, TIMEOUT_MS);

// Una sola base para todas: los roles anon/authenticated son del clúster y dos archivos de Jest
// en paralelo los crearían y borrarían a la vez.
const CASOS = [
  { migracion: '01a_org.sql', esquema: 'org', prueba: 'tests/01a_org.test.sql' },
  { migracion: '01a_org_alta.sql', esquema: 'org', prueba: 'tests/01a_org_alta.test.sql' },
  { migracion: '01b_seg.sql', esquema: 'seg', prueba: 'tests/01b_seg.test.sql' },
  { migracion: '01b_seg_autorizacion.sql', esquema: 'seg', prueba: 'tests/01b_seg_autorizacion.test.sql' },
  { migracion: '01b_seg_membresias.sql', esquema: 'seg', prueba: 'tests/01b_seg_membresias.test.sql' },
  { migracion: '01c_cfg.sql', esquema: 'cfg', prueba: 'tests/01c_cfg.test.sql' },
  { migracion: '01d_seq.sql', esquema: 'seq', prueba: 'tests/01d_seq.test.sql' },
  { migracion: '01e_sync_outbox.sql', esquema: 'sync', prueba: 'tests/01e_sync_outbox.test.sql' },
  { migracion: '01e_sync_relay.sql', esquema: 'sync', prueba: 'tests/01e_sync_relay.test.sql' },
];

const MIGRACION_SUPABASE = '20261102000000_seg_supabase_auth.sql';

const existeEsquema = async (esquema) =>
  (await ejecutar(urlDb, `SELECT 1 FROM pg_namespace WHERE nspname = '${esquema}'`)).rowCount === 1;

const triggersAuth = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal ORDER BY tgname`,
    )
  ).rows.map((r) => r.tgname);

const columnasExtra = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
        WHERE table_schema = 'seg' AND column_name IN ('version', 'obsoleto', 'ultima_sucursal_id') ORDER BY 1`,
    )
  ).rows.map((r) => r.c);

const funcionesAutorizacion = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'seg' AND p.proname IN ('permisos_efectivos', 'menu_usuario', 'sucursales_accesibles',
              'versiones_seguridad', 'asignaciones_aplicables', 'subir_version_seguridad') ORDER BY 1`,
    )
  ).rows.map((r) => r.proname);

// Columnas, tabla y función que agrega 01b_seg_membresias (9 en total).
const objetosMembresias = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT table_name || '.' || column_name AS o FROM information_schema.columns
        WHERE table_schema = 'seg' AND (
              (table_name = 'membresia' AND column_name IN ('version', 'motivo', 'cambiado_por', 'cambiado_en'))
           OR (table_name = 'asignacion' AND column_name IN ('revocada_en', 'revocada_por', 'motivo_revocacion')))
       UNION ALL SELECT 'seg.invitacion' WHERE to_regclass('seg.invitacion') IS NOT NULL
       UNION ALL SELECT 'seg.invitacion_por_token' WHERE to_regprocedure('seg.invitacion_por_token(char)') IS NOT NULL
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

const estadoMembresia = async (id) =>
  (await ejecutar(urlDb, `SELECT estado FROM seg.membresia WHERE id = '${id}'`)).rows[0]?.estado;

// Tablas, funciones y política que agrega 01e_sync_relay (7 en total).
const objetosRelay = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'sync.' || relname AS o FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'sync' AND relname IN ('relay_cursor', 'evento_procesado', 'evento_fallido')
       UNION ALL SELECT 'sync.' || proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'sync' AND proname IN ('read_events', 'read_events_ventana', 'validar_lectura_relay')
       UNION ALL SELECT policyname FROM pg_policies WHERE schemaname = 'sync' AND policyname = 'outbox_relay_lectura'
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

// Tabla, función y políticas que agrega 01a_org_alta (4 en total).
const objetosAlta = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'org.aviso_vencimiento' AS o WHERE to_regclass('org.aviso_vencimiento') IS NOT NULL
       UNION ALL SELECT 'org.suscripciones_a_revisar' WHERE to_regprocedure('org.suscripciones_a_revisar(date)') IS NOT NULL
       UNION ALL SELECT policyname FROM pg_policies
        WHERE schemaname = 'org' AND policyname IN ('suscripcion_vencimientos', 'tenant_vencimientos')
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

const triggersSuscripcion = async () =>
  (
    await ejecutar(urlDb, `SELECT tgname FROM pg_trigger WHERE tgrelid = 'org.suscripcion'::regclass AND tgname LIKE '%version%'`)
  ).rows.map((r) => r.tgname);

describeConDb('db/ y supabase/migrations', () => {
  test('aplica, pasa las pruebas SQL, revierte y vuelve a aplicar', async () => {
    const dir = rutaDb('');
    const migraciones = CASOS.map((c) => c.migracion);
    expect(await subir({ url: urlDb, dir })).toEqual(expect.arrayContaining(migraciones));
    for (const { esquema } of CASOS) expect(await existeEsquema(esquema)).toBe(true);

    for (const { prueba } of CASOS) await ejecutar(urlDb, await readFile(rutaDb(prueba), 'utf8'));

    // El inverso de 01e_sync_relay deja sync como lo dejó 01e_sync_outbox (con datos) y se puede reaplicar.
    // Va primero: evento_fallido referencia seg.usuario.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01e_sync_relay.sql'), 'utf8'));
    expect(await objetosRelay()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01e_sync_relay.sql'), 'utf8'));
    expect(await objetosRelay()).toHaveLength(7);

    // El inverso de 01d_seq borra seq (con datos) y se puede reaplicar. Va primero: seq depende de org y seg.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01d_seq.sql'), 'utf8'));
    expect(await existeEsquema('seq')).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01d_seq.sql'), 'utf8'));
    expect(await existeEsquema('seq')).toBe(true);

    // El inverso de 01c_cfg borra cfg (con datos) y se puede reaplicar. Va primero: cfg depende de seg.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01c_cfg.sql'), 'utf8'));
    expect(await existeEsquema('cfg')).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01c_cfg.sql'), 'utf8'));
    expect(await existeEsquema('cfg')).toBe(true);

    // El inverso de 01b_seg_membresias deja seg como lo dejó 01b_seg_autorizacion (con datos, y la
    // membresía FINALIZADO como SUSPENDIDO). Va primero: reemplaza funciones de autorización.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01b_seg_membresias.sql'), 'utf8'));
    expect(await objetosMembresias()).toEqual([]);
    expect(await estadoMembresia('c1000000-0000-0000-0000-000000000f02')).toBe('SUSPENDIDO');

    // El inverso de 01b_seg_autorizacion deja seg como lo dejó 01b_seg (con datos) y se puede reaplicar.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01b_seg_autorizacion.sql'), 'utf8'));
    expect(await columnasExtra()).toEqual([]);
    expect(await funcionesAutorizacion()).toEqual([]);
    expect(await triggersSuscripcion()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01b_seg_autorizacion.sql'), 'utf8'));
    expect(await funcionesAutorizacion()).toHaveLength(6);
    await ejecutar(urlDb, await readFile(rutaDb('01b_seg_membresias.sql'), 'utf8'));
    expect(await objetosMembresias()).toHaveLength(9);

    // El inverso de 01a_org_alta deja org como lo dejó 01a_org (con datos) y se puede reaplicar.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01a_org_alta.sql'), 'utf8'));
    expect(await objetosAlta()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01a_org_alta.sql'), 'utf8'));
    expect(await objetosAlta()).toHaveLength(4);

    // supabase/migrations necesita auth.users y los roles de Supabase.
    const dirSupabase = rutaSupabase('migrations');
    await ejecutar(urlDb, await readFile(ruta('./fixtures/simular-supabase.sql'), 'utf8'));
    expect(await subir({ url: urlDb, dir: dirSupabase })).toEqual([MIGRACION_SUPABASE]);
    await ejecutar(urlDb, await readFile(rutaSupabase('tests/seg_supabase_auth.test.sql'), 'utf8'));
    expect(await bajar({ url: urlDb, dir: dirSupabase })).toEqual([MIGRACION_SUPABASE]);
    expect(await triggersAuth()).toEqual([]);

    expect(await bajar({ url: urlDb, dir })).toEqual(expect.arrayContaining(migraciones));
    for (const { esquema } of CASOS) expect(await existeEsquema(esquema)).toBe(false);

    expect(await subir({ url: urlDb, dir })).toEqual(expect.arrayContaining(migraciones));
    for (const { esquema } of CASOS) expect(await existeEsquema(esquema)).toBe(true);
    expect(await subir({ url: urlDb, dir: dirSupabase })).toEqual([MIGRACION_SUPABASE]);
    expect(await triggersAuth()).toEqual(['trg_auth_usuario_correo', 'trg_auth_usuario_creado']);
  }, TIMEOUT_MS);
});
