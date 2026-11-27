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
  for (const rol of ['outbox_test_app', 'org_test_app', 'org_alta_test_app', 'org_alta_test_sin_permiso', 'org_consola_test_app', 'org_consola_test_sin_permiso', 'seg_test_app', 'cfg_test_app', 'seq_test_app', 'cat_test_app', 'sync_test_app', 'sync_test_sin_permiso', 'aud_test_app', 'aud_integridad_test_app', 'obs_test_app', 'obs_test_sin_permiso', 'idn_test_app', 'idn_cuota_test_app', 'idn_cuota_test_sin_permiso', 'per_test_app', 'arc_test_app', 'arc_test_sin_permiso', 'arc_fk_test_dueno', ...creados]) await ejecutar(ADMIN_URL, `DROP ROLE IF EXISTS ${rol}`);
  for (const rol of ['sec_test_app', 'sec_test_sin_permiso']) await ejecutar(ADMIN_URL, `DROP ROLE IF EXISTS ${rol}`);
  for (const rol of ['not_test_app', 'not_test_sin_permiso', 'not_plantillas_test_app', 'fe_test_app', 'fe_prueba_test_app', 'fe_comprobante_test_app', 'org_identidad_test_app']) await ejecutar(ADMIN_URL, `DROP ROLE IF EXISTS ${rol}`);
}, TIMEOUT_MS);

// Una sola base para todas: los roles anon/authenticated son del clúster y dos archivos de Jest
// en paralelo los crearían y borrarían a la vez.
const CASOS = [
  { migracion: '01a_org.sql', esquema: 'org', prueba: 'tests/01a_org.test.sql' },
  { migracion: '01a_org_alta.sql', esquema: 'org', prueba: 'tests/01a_org_alta.test.sql' },
  { migracion: '01a_org_consola.sql', esquema: 'org', prueba: 'tests/01a_org_consola.test.sql' },
  { migracion: '01b_seg.sql', esquema: 'seg', prueba: 'tests/01b_seg.test.sql' },
  { migracion: '01b_seg_autorizacion.sql', esquema: 'seg', prueba: 'tests/01b_seg_autorizacion.test.sql' },
  { migracion: '01b_seg_membresias.sql', esquema: 'seg', prueba: 'tests/01b_seg_membresias.test.sql' },
  { migracion: '01b_seg_soporte.sql', esquema: 'seg', prueba: 'tests/01b_seg_soporte.test.sql' },
  { migracion: '01b_seg_tipos_ingreso.sql', esquema: 'seg', prueba: 'tests/01b_seg_tipos_ingreso.test.sql' },
  { migracion: '01c_cfg.sql', esquema: 'cfg', prueba: 'tests/01c_cfg.test.sql' },
  { migracion: '01d_seq.sql', esquema: 'seq', prueba: 'tests/01d_seq.test.sql' },
  { migracion: '01e_sync_outbox.sql', esquema: 'sync', prueba: 'tests/01e_sync_outbox.test.sql' },
  { migracion: '01e_sync_relay.sql', esquema: 'sync', prueba: 'tests/01e_sync_relay.test.sql' },
  { migracion: '01e_sync_traza.sql', esquema: 'sync', prueba: 'tests/01e_sync_traza.test.sql' },
  { migracion: '01f_cat.sql', esquema: 'cat', prueba: 'tests/01f_cat.test.sql' },
  { migracion: '01f_cat_feriado.sql', esquema: 'cat', prueba: 'tests/01f_cat_feriado.test.sql' },
  { migracion: '01f_cat_importacion.sql', esquema: 'cat', prueba: 'tests/01f_cat_importacion.test.sql' },
  { migracion: '01f_cat_items_busqueda.sql', esquema: 'cat', prueba: 'tests/01f_cat_items_busqueda.test.sql' },
  { migracion: '01f_cat_tablas_fe.sql', esquema: 'cat', prueba: 'tests/01f_cat_tablas_fe.test.sql' },
  { migracion: '01g_aud.sql', esquema: 'aud', prueba: 'tests/01g_aud.test.sql' },
  { migracion: '01g_aud_integridad.sql', esquema: 'aud', prueba: 'tests/01g_aud_integridad.test.sql' },
  { migracion: '01h_obs_estado_outbox.sql', esquema: 'sync', prueba: 'tests/01h_obs_estado_outbox.test.sql' },
  { migracion: '01i_seg_vigencia_peru.sql', esquema: 'seg', prueba: 'tests/01i_seg_vigencia_peru.test.sql' },
  { migracion: '01j_idn.sql', esquema: 'idn', prueba: 'tests/01j_idn.test.sql' },
  { migracion: '01k_idn_cuota.sql', esquema: 'idn', prueba: 'tests/01k_idn_cuota.test.sql' },
  { migracion: '01l_per.sql', esquema: 'per', prueba: 'tests/01l_per.test.sql' },
  { migracion: '01l_per_busqueda.sql', esquema: 'per', prueba: 'tests/01l_per_busqueda.test.sql' },
  { migracion: '01l_per_contactos.sql', esquema: 'per', prueba: 'tests/01l_per_contactos.test.sql' },
  { migracion: '01l_per_fusion.sql', esquema: 'per', prueba: 'tests/01l_per_fusion.test.sql' },
  { migracion: '01m_arc.sql', esquema: 'arc', prueba: 'tests/01m_arc.test.sql' },
  { migracion: '01m_arc_analisis.sql', esquema: 'arc', prueba: 'tests/01m_arc_analisis.test.sql' },
  { migracion: '01m_arc_categoria_fk.sql', esquema: 'arc', prueba: 'tests/01m_arc_categoria_fk.test.sql' },
  { migracion: '01m_arc_versiones.sql', esquema: 'arc', prueba: 'tests/01m_arc_versiones.test.sql' },
  { migracion: '01n_sec.sql', esquema: 'sec', prueba: 'tests/01n_sec.test.sql' },
  { migracion: '01o_not.sql', esquema: 'ntf', prueba: 'tests/01o_not.test.sql' },
  { migracion: '01p_fe.sql', esquema: 'fe', prueba: 'tests/01p_fe.test.sql' },
  { migracion: '01q_not_plantillas.sql', esquema: 'ntf', prueba: 'tests/01q_not_plantillas.test.sql' },
  { migracion: '01r_fe_prueba.sql', esquema: 'fe', prueba: 'tests/01r_fe_prueba.test.sql' },
  { migracion: '01s_not_avisos_plataforma.sql', esquema: 'ntf', prueba: 'tests/01s_not_avisos_plataforma.test.sql' },
  { migracion: '01t_not_programacion.sql', esquema: 'ntf', prueba: 'tests/01t_not_programacion.test.sql' },
  { migracion: '01u_fe_comprobante.sql', esquema: 'fe', prueba: 'tests/01u_fe_comprobante.test.sql' },
  { migracion: '01v_fe_sunat_directo.sql', esquema: 'fe', prueba: 'tests/01v_fe_sunat_directo.test.sql' },
  { migracion: '01w_arc_carga_sistema.sql', esquema: 'arc', prueba: 'tests/01w_arc_carga_sistema.test.sql' },
  { migracion: '01x_fe_envio.sql', esquema: 'fe', prueba: 'tests/01x_fe_envio.test.sql' },
  { migracion: '01y_org_identidad_empresa.sql', esquema: 'org', prueba: 'tests/01y_org_identidad_empresa.test.sql' },
  { migracion: '02a_not_bajas.sql', esquema: 'ntf', prueba: 'tests/02a_not_bajas.test.sql' },
];

// Definiciones de las tablas SUNAT de facturación electrónica que siembra 01f_cat_tablas_fe (6 en total).
const catalogosFacturacion = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT codigo FROM cat.catalogo
        WHERE codigo IN ('TRIBUTO', 'TIPO_NOTA_CREDITO', 'TIPO_NOTA_DEBITO', 'TIPO_PRECIO', 'TIPO_OPERACION', 'LEYENDA')
        ORDER BY codigo`,
    )
  ).rows.map((r) => r.codigo);

const ITEM_TRIBUTO_PRUEBA = 'ca700000-0000-0000-0000-0000000d1000';

// Columnas, índices, función, política y número en el barrido que agrega 01m_arc_versiones (8 en total).
const objetosVersiones = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT table_name || '.' || column_name AS o FROM information_schema.columns
        WHERE table_schema = 'arc' AND ((table_name = 'version_archivo' AND column_name = 'estado')
           OR (table_name = 'archivo' AND column_name IN ('motivo_rechazo_version', 'version_coincidente')))
       UNION ALL SELECT indexname FROM pg_indexes WHERE schemaname = 'arc' AND indexname IN ('ux_version_en_curso', 'ix_version_pendiente')
       UNION ALL SELECT 'arc.versiones_pendientes_vencidas'
        WHERE to_regprocedure('arc.versiones_pendientes_vencidas(timestamptz, integer)') IS NOT NULL
       UNION ALL SELECT policyname FROM pg_policies WHERE schemaname = 'arc' AND policyname = 'version_archivo_lector'
       UNION ALL SELECT 'barrido con numero'
        WHERE pg_get_function_result('arc.archivos_en_analisis_atascados(timestamptz, integer)'::regprocedure) LIKE '%numero%'
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

const TENANT_RELLENO = '35000000-0000-0000-0000-0000000000aa';
const ESTADOS_ARCHIVO = ['PENDIENTE_CARGA', 'EN_ANALISIS', 'DISPONIBLE', 'CUARENTENA', 'RECHAZADO'];
const archivoRelleno = (indice) => `35000000-0000-0000-0000-00000000010${indice}`;

// Un archivo por estado con su versión 1 sin estado, como los deja el spec 33 antes de 01m_arc_versiones.
async function insertarArchivosDelSpec33() {
  const filas = ESTADOS_ARCHIVO.map((estado, indice) => {
    const analizado = estado === 'DISPONIBLE' || estado === 'CUARENTENA';
    return `SET app.tenant_id = '${TENANT_RELLENO}';
      INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, motivo_rechazo, version_vigente, creado_por)
      VALUES ('${archivoRelleno(indice)}', '${TENANT_RELLENO}', 'IMAGEN', 'PRODUCTO', 'P-${indice}', 'foto.png', '${estado}',
              ${estado === 'RECHAZADO' ? `'TIPO_NO_PERMITIDO'` : 'NULL'}, ${estado === 'DISPONIBLE' ? 1 : 'NULL'}, gen_random_uuid());
      INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, hash_sha256, subido_por)
      VALUES ('${archivoRelleno(indice)}', 1, '${TENANT_RELLENO}', 'relleno/${indice}/1', 'image/png', 64,
              ${analizado ? `repeat('${indice}', 64)` : 'NULL'}, gen_random_uuid());`;
  });
  await ejecutar(urlDb, filas.join('\n'));
}

const estadosRellenados = async () =>
  (
    await ejecutar(
      urlDb,
      `SET app.tenant_id = '${TENANT_RELLENO}';
       SELECT a.estado AS archivo, v.estado AS version FROM arc.archivo a JOIN arc.version_archivo v ON v.archivo_id = a.id ORDER BY a.id`,
    )
  ).at(-1).rows;

const borrarArchivosDelRelleno = () => ejecutar(urlDb, `SET app.tenant_id = '${TENANT_RELLENO}'; DELETE FROM arc.archivo;`);

// Con una versión numero > 1 el inverso de 01m_arc_versiones se niega; la transacción se revierte.
async function inversoVersionesConVersionNueva() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.tenant_id', '${TENANT_RELLENO}', true)`);
    await c.query(
      `INSERT INTO arc.version_archivo (archivo_id, numero, tenant_id, ruta_storage, mime_declarado, bytes_declarados, estado, subido_por)
       VALUES ('${archivoRelleno(2)}', 2, '${TENANT_RELLENO}', 'relleno/2/2', 'image/png', 64, 'PENDIENTE_CARGA', gen_random_uuid())`,
    );
    return await c.query(await readFile(rutaDb('rollback/01m_arc_versiones.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con un secreto guardado el inverso de 01n_sec se niega (spec 41); la transacción se revierte.
async function inversoSecretosConFilas() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '41000000-0000-0000-0000-0000000000ff';
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO sec.clave_tenant (tenant_id, clave_cifrada, iv, version_clave_maestra)
       VALUES ('${tenantId}', decode(repeat('ab', 48), 'hex'), decode(repeat('ab', 12), 'hex'), 1)`,
    );
    await c.query(
      `INSERT INTO sec.secreto (id, tenant_id, tipo, cifrado, iv, creado_por)
       VALUES (gen_random_uuid(), '${tenantId}', 'fe.clave_certificado', decode(repeat('ab', 17), 'hex'), decode(repeat('ab', 12), 'hex'), gen_random_uuid())`,
    );
    return await c.query(await readFile(rutaDb('rollback/01n_sec.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con una programación PROGRAMADA el inverso de 01t_not_programacion se niega (spec 45); la transacción se revierte.
async function inversoProgramacionesConVivas() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '45000000-0000-0000-0000-0000000000ff';
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO ntf.programacion (id, tenant_id, referencia_tipo, referencia_id, plantilla_codigo, destinatario, finalidad, enviar_en, estado)
       VALUES (gen_random_uuid(), '${tenantId}', 'cita', 'c-1', 'PRUEBA_CORREO', '{"correo":"prueba@ejemplo.pe"}', 'TRANSACCIONAL',
               now() + interval '1 day', 'PROGRAMADA')`,
    );
    return await c.query(await readFile(rutaDb('rollback/01t_not_programacion.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con una baja registrada el inverso de 02a_not_bajas se niega (spec 46); la transacción se revierte.
async function inversoBajasConFilas() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '46000000-0000-0000-0000-0000000000ff';
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO ntf.baja (id, tenant_id, canal, alcance, destino_hash)
       VALUES (gen_random_uuid(), '${tenantId}', 'CORREO', 'CANAL', 'sha256:prueba')`,
    );
    return await c.query(await readFile(rutaDb('rollback/02a_not_bajas.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Tabla y función del trigger que agrega 02a_not_bajas (2 en total).
const objetosBajas = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT table_name::text AS o FROM information_schema.tables WHERE table_schema = 'ntf' AND table_name = 'baja'
       UNION ALL SELECT proname::text FROM pg_proc WHERE proname = 'baja_solo_insercion'`,
    )
  ).rows.map((r) => r.o);

// Tabla y función que agrega 01t_not_programacion (2 en total).
const objetosProgramacion = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT table_name::text AS o FROM information_schema.tables WHERE table_schema = 'ntf' AND table_name = 'programacion'
       UNION ALL SELECT proname::text FROM pg_proc WHERE proname = 'programaciones_atrasadas'`,
    )
  ).rows.map((r) => r.o);

// Con un mensaje ENCOLADO el inverso de 01o_not se niega (spec 42); la transacción se revierte.
async function inversoNotificacionesConEncolados() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '42000000-0000-0000-0000-0000000000ff';
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO ntf.mensaje (id, tenant_id, plantilla_id, canal, destino, destino_hash, finalidad, asunto, cuerpo, clave_idempotencia, estado)
       VALUES (gen_random_uuid(), '${tenantId}', '42000000-0000-0000-0000-000000000001', 'CORREO', 'prueba@ejemplo.pe',
               'sha256:prueba', 'TRANSACCIONAL', 'Prueba', '<p>Prueba</p>', gen_random_uuid(), 'ENCOLADO')`,
    );
    return await c.query(await readFile(rutaDb('rollback/01o_not.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con una plantilla personalizada por un tenant el inverso de 01q_not_plantillas se niega (spec 43); la transacción se revierte.
async function inversoPlantillasConPersonalizacion() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '43000000-0000-0000-0000-0000000000ff';
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, plantilla_base_id)
       VALUES (gen_random_uuid(), '${tenantId}', 'PRUEBA_CORREO', 'CORREO', 1, 'Prueba', '<p>Prueba</p>', '42000000-0000-0000-0000-000000000001')`,
    );
    return await c.query(await readFile(rutaDb('rollback/01q_not_plantillas.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con una personalización de un aviso de plataforma el inverso de 01s_not_avisos_plataforma se niega (spec 44);
// la transacción se revierte.
async function inversoAvisosConPersonalizacion() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '44000000-0000-0000-0000-0000000000ff';
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, plantilla_base_id)
       VALUES (gen_random_uuid(), '${tenantId}', 'TENANT_SUSPENDIDO', 'CORREO', 1, 'Suspendida', '<p>Suspendida</p>', '44000000-0000-0000-0000-000000000002')`,
    );
    return await c.query(await readFile(rutaDb('rollback/01s_not_avisos_plataforma.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Plantillas base de los avisos de plataforma que siembra 01s_not_avisos_plataforma (4 en total).
const plantillasAvisos = async () =>
  (await ejecutar(urlDb, `SELECT codigo FROM ntf.plantilla WHERE tenant_id IS NULL AND id::text LIKE '44000000-%' ORDER BY codigo`)).rows.map(
    (r) => r.codigo,
  );

// Columna, índice y ejemplos de PRUEBA_CORREO que agrega 01q_not_plantillas (3 en total).
const objetosPlantillas = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'plantilla.creado_por' AS o FROM information_schema.columns
        WHERE table_schema = 'ntf' AND table_name = 'plantilla' AND column_name = 'creado_por'
       UNION ALL SELECT indexname FROM pg_indexes WHERE schemaname = 'ntf' AND indexname = 'uq_plantilla_activa_tenant'
       UNION ALL SELECT 'ejemplos' FROM ntf.plantilla
        WHERE id = '42000000-0000-0000-0000-000000000001' AND variables @> '[{"ejemplo":"María Quispe"}]'`,
    )
  ).rows.map((r) => r.o);

// Con un emisor que guarda ids de secretos el inverso de 01p_fe se niega (spec 49); la transacción se revierte.
async function inversoFeConSecretos() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '49000000-0000-0000-0000-0000000000ff';
    const empresaId = '49000000-0000-0000-0000-0000000000fe';
    await c.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ('${tenantId}', 'fe-inverso', 'FE inverso', 'ACTIVO', 1)`);
    await c.query(
      `INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ('${empresaId}', '${tenantId}', '20601234561', 'FE inverso SAC', 1)`,
    );
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, secreto_credencial_id)
       VALUES (gen_random_uuid(), '${tenantId}', '${empresaId}', 'SIMULADO', gen_random_uuid(), gen_random_uuid())`,
    );
    return await c.query(await readFile(rutaDb('rollback/01p_fe.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con un comprobante emitido el inverso de 01u_fe_comprobante se niega (spec 51); la transacción se revierte.
async function inversoComprobantesConFilas() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '51000000-0000-0000-0000-0000000000ff';
    const empresaId = '51000000-0000-0000-0000-0000000000fe';
    const sucursalId = '51000000-0000-0000-0000-0000000000fd';
    const emisorId = '51000000-0000-0000-0000-0000000000fc';
    await c.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ('${tenantId}', 'fe-cpe-inverso', 'FE comprobante inverso', 'ACTIVO', 1)`);
    await c.query(
      `INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ('${empresaId}', '${tenantId}', '20601234561', 'FE comprobante inverso SAC', 1)`,
    );
    await c.query(
      `INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version)
       VALUES ('${sucursalId}', '${tenantId}', '${empresaId}', 'PRI', 'Principal', '0000', true, 1)`,
    );
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, estado)
       VALUES ('${emisorId}', '${tenantId}', '${empresaId}', 'SIMULADO', gen_random_uuid(), 'CONFIGURADO')`,
    );
    await c.query(
      `INSERT INTO fe.comprobante (id, tenant_id, empresa_id, sucursal_id, emisor_id, tipo, serie, numero, fecha_emision, moneda, forma_pago,
                                   adquirente_tipo_doc, adquirente_numero, adquirente_nombre, regimen_igv, tasa_igv, total_gravado,
                                   total_exonerado, total_inafecto, igv, total, estado, clave_idempotencia, huella_solicitud)
       VALUES (gen_random_uuid(), '${tenantId}', '${empresaId}', '${sucursalId}', '${emisorId}', '03', 'B001', 1, '2026-11-24', 'PEN', 'CONTADO',
               'DOC_0', '0', 'CLIENTES VARIOS', 'GENERAL', 0.18, 10, 0, 0, 1.80, 11.80, 'PENDIENTE_ENVIO', gen_random_uuid(), repeat('c', 64))`,
    );
    return await c.query(await readFile(rutaDb('rollback/01u_fe_comprobante.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Tablas de 01u_fe_comprobante y su catálogo TASA_IGV (4 en total).
const objetosComprobante = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT table_name AS o FROM information_schema.tables
        WHERE table_schema = 'fe' AND table_name IN ('comprobante', 'comprobante_linea', 'comprobante_cuota')
       UNION ALL SELECT codigo FROM cat.catalogo WHERE codigo = 'TASA_IGV'`,
    )
  ).rows.map((r) => r.o);

// La tabla de intentos y las columnas de respuesta que agrega 01x_fe_envio (spec 52).
const objetosEnvio = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT table_name AS o FROM information_schema.tables WHERE table_schema = 'fe' AND table_name = 'envio'
       UNION ALL SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'fe' AND table_name = 'comprobante' AND column_name IN ('cdr_archivo_id', 'respondido_en')`,
    )
  ).rows.map((r) => r.o);

// Con un intento de envío registrado el inverso de 01x_fe_envio se niega (spec 52); la transacción se revierte.
async function inversoEnvioConIntentos() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '52000000-0000-0000-0000-0000000000ef';
    const empresaId = '52000000-0000-0000-0000-0000000000ee';
    const sucursalId = '52000000-0000-0000-0000-0000000000ed';
    const emisorId = '52000000-0000-0000-0000-0000000000ec';
    const comprobanteId = '52000000-0000-0000-0000-0000000000eb';
    await c.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ('${tenantId}', 'fe-envio-inverso', 'FE envío inverso', 'ACTIVO', 1)`);
    await c.query(
      `INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ('${empresaId}', '${tenantId}', '20601234561', 'FE envío inverso SAC', 1)`,
    );
    await c.query(
      `INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version)
       VALUES ('${sucursalId}', '${tenantId}', '${empresaId}', 'PRI', 'Principal', '0000', true, 1)`,
    );
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, estado)
       VALUES ('${emisorId}', '${tenantId}', '${empresaId}', 'SIMULADO', gen_random_uuid(), 'CONFIGURADO')`,
    );
    await c.query(
      `INSERT INTO fe.comprobante (id, tenant_id, empresa_id, sucursal_id, emisor_id, tipo, serie, numero, fecha_emision, moneda, forma_pago,
                                   adquirente_tipo_doc, adquirente_numero, adquirente_nombre, regimen_igv, tasa_igv, total_gravado,
                                   total_exonerado, total_inafecto, igv, total, estado, clave_idempotencia, huella_solicitud)
       VALUES ('${comprobanteId}', '${tenantId}', '${empresaId}', '${sucursalId}', '${emisorId}', '03', 'B001', 1, '2026-11-25', 'PEN', 'CONTADO',
               'DOC_0', '0', 'CLIENTES VARIOS', 'GENERAL', 0.18, 10, 0, 0, 1.80, 11.80, 'PENDIENTE_ENVIO', gen_random_uuid(), repeat('c', 64))`,
    );
    await c.query(
      `INSERT INTO fe.envio (id, tenant_id, comprobante_id, intento, proveedor, resultado, enviado_en)
       VALUES (gen_random_uuid(), '${tenantId}', '${comprobanteId}', 1, 'SIMULADO', 'ERROR_TECNICO', now())`,
    );
    return await c.query(await readFile(rutaDb('rollback/01x_fe_envio.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Columnas, CHECK de sucursal, categoría LOGO y logo en org.tenant_detalle que agrega 01y_org_identidad_empresa
// (spec 17d, 7 en total).
const objetosIdentidadEmpresa = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT column_name AS o FROM information_schema.columns
        WHERE table_schema = 'org' AND table_name = 'empresa' AND column_name IN ('logo_archivo_id', 'telefono', 'correo', 'sitio_web')
       UNION ALL SELECT conname FROM pg_constraint WHERE conname = 'ck_sucursal_telefono_e164'
       UNION ALL SELECT codigo FROM arc.categoria WHERE codigo = 'LOGO'
       UNION ALL SELECT 'tenant_detalle con logo' FROM pg_proc
        WHERE oid = 'org.tenant_detalle(uuid)'::regprocedure AND prosrc LIKE '%logo_archivo_id%'`,
    )
  ).rows.map((r) => r.o);

const OBJETOS_IDENTIDAD_EMPRESA = [
  'LOGO',
  'ck_sucursal_telefono_e164',
  'correo',
  'logo_archivo_id',
  'sitio_web',
  'telefono',
  'tenant_detalle con logo',
];

// Ejecuta `preparar` en una transacción, corre el inverso de 01y_org_identidad_empresa y devuelve el SQLSTATE con
// que falla (o null); la transacción se revierte.
async function inversoIdentidadEmpresaCon(preparar) {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    await preparar(c);
    return await c.query(await readFile(rutaDb('rollback/01y_org_identidad_empresa.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

const TENANT_IDENTIDAD = '17d00000-0000-0000-0000-0000000000ff';
const EMPRESA_IDENTIDAD = '17d00000-0000-0000-0000-0000000000fe';

async function insertarEmpresaIdentidad(cliente, contacto = '') {
  await cliente.query(
    `INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ('${TENANT_IDENTIDAD}', 'identidad-inverso', 'Identidad inverso', 'ACTIVO', 1)`,
  );
  await cliente.query(
    `INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version${contacto ? ', telefono' : ''})
     VALUES ('${EMPRESA_IDENTIDAD}', '${TENANT_IDENTIDAD}', '20601234561', 'Identidad inverso SAC', 1${contacto ? `, '${contacto}'` : ''})`,
  );
}

const empresaConTelefono = (cliente) => insertarEmpresaIdentidad(cliente, '+51987654321');

async function archivoLogo(cliente) {
  await cliente.query(`SELECT set_config('app.tenant_id', '${TENANT_IDENTIDAD}', true)`);
  await cliente.query(
    `INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por)
     VALUES (gen_random_uuid(), '${TENANT_IDENTIDAD}', 'LOGO', 'EMPRESA', '${EMPRESA_IDENTIDAD}', 'logo.png', 'PENDIENTE_CARGA', gen_random_uuid())`,
  );
}

// Revierte 01y, deja dos sucursales con teléfonos de antes y la reaplica: devuelve cómo quedaron. La transacción se revierte.
async function telefonosSucursalNormalizados() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(await readFile(rutaDb('rollback/01y_org_identidad_empresa.sql'), 'utf8'));
    await insertarEmpresaIdentidad(c);
    await c.query(
      `INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, telefono, version)
       VALUES ('17d00000-0000-0000-0000-0000000000f1', '${TENANT_IDENTIDAD}', '${EMPRESA_IDENTIDAD}', 'PRI', 'Principal', '0000', true, '987 654 321', 1),
              ('17d00000-0000-0000-0000-0000000000f2', '${TENANT_IDENTIDAD}', '${EMPRESA_IDENTIDAD}', 'ANX', 'Anexo', '0001', false, 'anexo 12', 1)`,
    );
    await c.query(await readFile(rutaDb('01y_org_identidad_empresa.sql'), 'utf8'));
    return (await c.query(`SELECT codigo, telefono FROM org.sucursal WHERE empresa_id = '${EMPRESA_IDENTIDAD}' ORDER BY codigo`)).rows;
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Columnas y CHECK que agrega 01w_arc_carga_sistema (spec 52).
const objetosCargaSistema = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT column_name AS o FROM information_schema.columns
        WHERE table_schema = 'arc' AND table_name = 'archivo' AND column_name = 'origen'
       UNION ALL SELECT conname FROM pg_constraint WHERE conname = 'ck_archivo_actor'`,
    )
  ).rows.map((r) => r.o);

// Con un archivo SISTEMA el inverso de 01w_arc_carga_sistema se niega (spec 52); la transacción se revierte.
async function inversoCargaSistemaConArchivos() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '52000000-0000-0000-0000-0000000000ff';
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, origen)
       VALUES (gen_random_uuid(), '${tenantId}', 'CPE_XML', 'FE_COMPROBANTE', 'C-1', 'cdr.zip', 'PENDIENTE_CARGA', 'SISTEMA')`,
    );
    return await c.query(await readFile(rutaDb('rollback/01w_arc_carga_sistema.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con un emisor SUNAT el inverso de 01v_fe_sunat_directo se niega (spec 51c); la transacción se revierte.
async function inversoSunatConEmisores() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '51c00000-0000-0000-0000-0000000000ff';
    const empresaId = '51c00000-0000-0000-0000-0000000000fe';
    await c.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ('${tenantId}', 'fe-sunat-inverso', 'FE SUNAT inverso', 'ACTIVO', 1)`);
    await c.query(
      `INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ('${empresaId}', '${tenantId}', '20601234561', 'FE SUNAT inverso SAC', 1)`,
    );
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, estado)
       VALUES (gen_random_uuid(), '${tenantId}', '${empresaId}', 'SUNAT', gen_random_uuid(), 'CONFIGURADO')`,
    );
    return await c.query(await readFile(rutaDb('rollback/01v_fe_sunat_directo.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con un emisor VERIFICADO el inverso de 01r_fe_prueba se niega (spec 50); la transacción se revierte.
async function inversoFePruebaConVerificados() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '50000000-0000-0000-0000-0000000000ff';
    const empresaId = '50000000-0000-0000-0000-0000000000fe';
    await c.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ('${tenantId}', 'fe-prueba-inverso', 'FE prueba inverso', 'ACTIVO', 1)`);
    await c.query(
      `INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ('${empresaId}', '${tenantId}', '20601234561', 'FE prueba inverso SAC', 1)`,
    );
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, estado)
       VALUES (gen_random_uuid(), '${tenantId}', '${empresaId}', 'SIMULADO', gen_random_uuid(), 'VERIFICADO')`,
    );
    return await c.query(await readFile(rutaDb('rollback/01r_fe_prueba.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

const columnasPruebaFe = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'fe' AND table_name = 'emisor' AND (column_name LIKE 'prueba%' OR column_name IN ('url_proveedor', 'produccion_habilitada_en', 'produccion_habilitada_por'))`,
    )
  ).rows.length;

const proveedoresFe = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT i.codigo FROM cat.catalogo_item i JOIN cat.catalogo c ON c.id = i.catalogo_id WHERE c.codigo = 'PROVEEDOR_FE' ORDER BY i.codigo`,
    )
  ).rows.map((r) => r.codigo);

// El UPDATE sobre arc.categoria.codigo que 01m_arc_categoria_fk da al rol que migra. Se lee del ACL de la columna:
// has_column_privilege da true a cualquier superusuario.
const updateCodigoCategoria = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT coalesce(bool_or(acl.privilege_type = 'UPDATE' AND acl.grantee = (SELECT oid FROM pg_roles WHERE rolname = current_user)), false) AS tiene
         FROM pg_attribute a
         LEFT JOIN LATERAL aclexplode(a.attacl) acl ON true
        WHERE a.attrelid = 'arc.categoria'::regclass AND a.attname = 'codigo'`,
    )
  ).rows[0].tiene;

// Función e índice que agrega 01m_arc_analisis (2 en total).
const objetosAnalisis = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'arc.archivos_en_analisis_atascados' AS o
        WHERE to_regprocedure('arc.archivos_en_analisis_atascados(timestamptz, integer)') IS NOT NULL
       UNION ALL SELECT indexname FROM pg_indexes WHERE schemaname = 'arc' AND indexname = 'ix_archivo_en_analisis'
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

const existeEstadoOutbox = async () =>
  (await ejecutar(urlDb, `SELECT to_regprocedure('sync.estado_outbox()') IS NOT NULL AS existe`)).rows[0].existe;

const MIGRACIONES_SUPABASE = ['20261102000000_seg_supabase_auth.sql', '20261118000000_arc_storage.sql'];

const bucketArchivos = async () =>
  (await ejecutar(urlDb, `SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'archivos'`)).rows[0];

// Con un objeto en el bucket el inverso de arc_storage se niega; la transacción se revierte.
async function inversoBucketConObjetos() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('archivos', 'tenant/archivo/1')`);
    return await c.query(await readFile(rutaSupabase('migrations/rollback/20261118000000_arc_storage.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

const existeEsquema = async (esquema) =>
  (await ejecutar(urlDb, `SELECT 1 FROM pg_namespace WHERE nspname = '${esquema}'`)).rowCount === 1;

const triggersAuth = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal ORDER BY tgname`,
    )
  ).rows.map((r) => r.tgname);

// acceso_soporte nace con su version en 01b_seg_soporte, que la prueba vuelve a aplicar antes de revertir 01b_seg_autorizacion.
const columnasExtra = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
        WHERE table_schema = 'seg' AND table_name <> 'acceso_soporte'
          AND column_name IN ('version', 'obsoleto', 'ultima_sucursal_id') ORDER BY 1`,
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

// Tabla, funciones, índices y CHECK que agrega 01b_seg_soporte (7 en total).
const objetosSoporte = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'seg.acceso_soporte' AS o WHERE to_regclass('seg.acceso_soporte') IS NOT NULL
       UNION ALL SELECT 'seg.accesos_soporte_de_agente' WHERE to_regprocedure('seg.accesos_soporte_de_agente(uuid)') IS NOT NULL
       UNION ALL SELECT 'seg.accesos_soporte_por_vencer' WHERE to_regprocedure('seg.accesos_soporte_por_vencer(timestamptz)') IS NOT NULL
       UNION ALL SELECT indexname FROM pg_indexes WHERE schemaname = 'seg' AND tablename = 'evento_seguridad' AND indexname LIKE 'ix_evento_seguridad_%'
       UNION ALL SELECT conname FROM pg_constraint WHERE conname = 'ck_evento_seguridad_tipo'
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

// Funciones y políticas que agrega 01b_seg_tipos_ingreso, y si el CHECK ya admite LOGIN_FALLIDO (5 en total).
const objetosTiposIngreso = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'seg.usuario_para_ingreso' AS o WHERE to_regprocedure('seg.usuario_para_ingreso(text)') IS NOT NULL
       UNION ALL SELECT 'seg.registrar_evento_ingreso'
        WHERE to_regprocedure('seg.registrar_evento_ingreso(varchar, uuid, uuid, jsonb, inet)') IS NOT NULL
       UNION ALL SELECT policyname FROM pg_policies
        WHERE schemaname = 'seg' AND policyname IN ('membresia_ingreso', 'evento_seguridad_ingreso')
       UNION ALL SELECT 'ck_tipo_login_fallido' FROM pg_constraint
        WHERE conname = 'ck_evento_seguridad_tipo' AND pg_get_constraintdef(oid) LIKE '%LOGIN_FALLIDO%'
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

// Con una fila LOGIN_FALLIDO el inverso corta antes de tocar nada; la transacción se revierte.
async function inversoTiposIngresoConFilas() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(`INSERT INTO seg.evento_seguridad (tipo) VALUES ('LOGIN_FALLIDO')`);
    return await c.query(await readFile(rutaDb('rollback/01b_seg_tipos_ingreso.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con una fila en aud.evento_auditoria el inverso de 01g_aud se niega (TR-RN-028); la transacción se revierte.
async function inversoAuditoriaConFilas() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, ocurrido_en)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'OPERACION', 'DIRECTO', 'rest.venta.anular', 'venta', 'V-000981', now())`,
    );
    return await c.query(await readFile(rutaDb('rollback/01g_aud.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con una fila en aud.verificacion_integridad el inverso de 01g_aud_integridad se niega; la transacción se revierte.
async function inversoIntegridadConFilas() {
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    const tenantId = '0a000000-0000-0000-0000-0000000000f1';
    await c.query(`SELECT set_config('app.tenant_id', '${tenantId}', true)`);
    await c.query(
      `INSERT INTO aud.verificacion_integridad (id, tenant_id, modo, desde_numero, hasta_numero, ultimo_hash, filas, estado,
                                               iniciada_en, terminada_en)
       VALUES (gen_random_uuid(), '${tenantId}', 'COMPLETA', 0, 0, repeat('0', 64), 0, 'OK', now(), now())`,
    );
    return await c.query(await readFile(rutaDb('rollback/01g_aud_integridad.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Índices, tabla, funciones y política que agrega 01g_aud_integridad (8 en total).
const objetosIntegridad = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT indexname AS o FROM pg_indexes WHERE schemaname = 'aud' AND indexname IN
              ('evento_auditoria_sucursal_fecha_ix', 'evento_auditoria_accion_fecha_ix', 'evento_auditoria_entidad_ix')
       UNION ALL SELECT 'aud.verificacion_integridad' WHERE to_regclass('aud.verificacion_integridad') IS NOT NULL
       UNION ALL SELECT 'aud.' || proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'aud' AND proname IN ('verificar_cadena', 'maximo_numero', 'tenants_con_eventos')
       UNION ALL SELECT policyname FROM pg_policies WHERE schemaname = 'aud' AND policyname = 'evento_auditoria_lector'
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

// Columnas que agrega 01e_sync_traza a sync.outbox (3 en total).
const columnasTraza = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT column_name AS c FROM information_schema.columns
        WHERE table_schema = 'sync' AND table_name = 'outbox' AND column_name IN ('actor_id', 'ip', 'trace_id') ORDER BY 1`,
    )
  ).rows.map((r) => r.c);

// Tabla, funciones y marca en cat.subir_version_global() que agrega 01f_cat_importacion (7 en total).
const objetosImportacion = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'cat.importacion' AS o WHERE to_regclass('cat.importacion') IS NOT NULL
       UNION ALL SELECT 'cat.' || proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'cat' AND proname IN ('importacion_en_curso', 'iniciar_importacion', 'aplicar_lote_importacion',
              'cerrar_bajas_importacion', 'finalizar_importacion')
       UNION ALL SELECT 'subir_version_global con cat.importando' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'cat' AND proname = 'subir_version_global' AND prosrc LIKE '%cat.importando%'
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

// Tabla y funciones que agrega 01f_cat_feriado (6 en total).
const objetosFeriado = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'cat.feriado' AS o WHERE to_regclass('cat.feriado') IS NOT NULL
       UNION ALL SELECT 'cat.' || proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'cat' AND proname IN ('fechas_feriado', 'feriado_choca', 'items_administracion',
              'guardar_feriado_global', 'eliminar_feriado_global')
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

// Si cat.items_administracion busca también en los valores de los atributos (01f_cat_items_busqueda).
const buscaEnAtributos = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'cat' AND proname = 'items_administracion' AND prosrc LIKE '%jsonb_each_text%'`,
    )
  ).rowCount === 1;

const feriadosSemilla = async () =>
  Number((await ejecutar(urlDb, `SELECT count(*) AS n FROM cat.feriado WHERE creado_por IS NULL`)).rows[0].n);

const catalogosOficialesNuevos = async () =>
  Number(
    (
      await ejecutar(
        urlDb,
        `SELECT count(*) AS n FROM cat.catalogo WHERE codigo IN ('UBIGEO', 'CIE10', 'UNIDAD_MEDIDA', 'AFECTACION_IGV', 'MONEDA')`,
      )
    ).rows[0].n,
  );

// Tabla, funciones y políticas que agrega 01a_org_alta (5 en total).
const objetosAlta = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'org.aviso_vencimiento' AS o WHERE to_regclass('org.aviso_vencimiento') IS NOT NULL
       UNION ALL SELECT 'org.suscripciones_a_revisar' WHERE to_regprocedure('org.suscripciones_a_revisar(date)') IS NOT NULL
       UNION ALL SELECT 'org.tenant_por_codigo' WHERE to_regprocedure('org.tenant_por_codigo(varchar)') IS NOT NULL
       UNION ALL SELECT policyname FROM pg_policies
        WHERE schemaname = 'org' AND policyname IN ('suscripcion_vencimientos', 'tenant_vencimientos')
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

// Funciones y políticas que agrega 01a_org_consola (5 en total).
const objetosConsola = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'org.tenants_listar' AS o WHERE to_regprocedure('org.tenants_listar(varchar, varchar, varchar, int, int)') IS NOT NULL
       UNION ALL SELECT 'org.tenant_detalle' WHERE to_regprocedure('org.tenant_detalle(uuid)') IS NOT NULL
       UNION ALL SELECT policyname FROM pg_policies
        WHERE schemaname = 'org' AND policyname IN ('empresa_consola', 'sucursal_consola', 'historial_consola')
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

// Tabla, funciones, políticas y columna version de proveedor que agrega 01k_idn_cuota (6 en total).
const objetosCuota = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'idn.cuota' AS o WHERE to_regclass('idn.cuota') IS NOT NULL
       UNION ALL SELECT 'idn.' || proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'idn' AND proname IN ('cuotas_del_periodo', 'cuota_detalle')
       UNION ALL SELECT policyname FROM pg_policies WHERE policyname IN ('proveedor_update', 'tenant_cuotas')
       UNION ALL SELECT 'idn.proveedor.version' FROM information_schema.columns
        WHERE table_schema = 'idn' AND table_name = 'proveedor' AND column_name = 'version'
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

const triggersSuscripcion = async () =>
  (
    await ejecutar(urlDb, `SELECT tgname FROM pg_trigger WHERE tgrelid = 'org.suscripcion'::regclass AND tgname LIKE '%version%'`)
  ).rows.map((r) => r.tgname);

// Tabla, índice único y política de borrado que agrega 01l_per_contactos (3 en total).
const objetosContactos = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'tabla:' || tablename AS o FROM pg_tables WHERE schemaname = 'per' AND tablename = 'direccion'
       UNION ALL SELECT 'indice:' || indexname FROM pg_indexes WHERE schemaname = 'per' AND indexname = 'uq_contacto_valor'
       UNION ALL SELECT 'politica:' || policyname FROM pg_policies WHERE schemaname = 'per' AND policyname = 'contacto_delete'
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

// Funciones, columnas generadas e índices que agrega 01l_per_busqueda (8 en total).
const objetosBusqueda = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'funcion:' || proname AS o FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'per' AND proname IN ('normalizar_busqueda', 'clave_fonetica')
       UNION ALL SELECT 'columna:' || column_name FROM information_schema.columns
        WHERE table_schema = 'per' AND table_name = 'persona' AND column_name IN ('busqueda_texto', 'busqueda_fonetica')
       UNION ALL SELECT 'indice:' || indexname FROM pg_indexes WHERE schemaname = 'per'
        AND indexname IN ('ix_persona_busqueda_texto', 'ix_persona_busqueda_fonetica', 'ix_persona_documento_prefijo', 'ix_contacto_valor_prefijo')
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

const extensionesBusqueda = async () =>
  (await ejecutar(urlDb, `SELECT extname FROM pg_extension WHERE extname IN ('unaccent', 'pg_trgm', 'btree_gin') ORDER BY 1`)).rows.map((r) => r.extname);

// Tablas y función de solo revocación que agrega 01l_per_consentimientos (3 en total).
const objetosConsentimientos = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'tabla:' || tablename AS o FROM pg_tables WHERE schemaname = 'per' AND tablename IN ('texto_finalidad', 'consentimiento')
       UNION ALL SELECT 'funcion:' || proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'per' AND proname = 'consentimiento_solo_revocacion'
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

// Tablas, columnas de alias e índice que agrega 01l_per_fusion (5 en total).
const objetosFusion = async () =>
  (
    await ejecutar(
      urlDb,
      `SELECT 'tabla:' || tablename AS o FROM pg_tables WHERE schemaname = 'per' AND tablename IN ('fusion', 'par_descartado')
       UNION ALL SELECT 'columna:' || column_name FROM information_schema.columns
        WHERE table_schema = 'per' AND table_name = 'persona' AND column_name IN ('fusionada_en_id', 'fusionada_en')
       UNION ALL SELECT 'indice:' || indexname FROM pg_indexes WHERE schemaname = 'per' AND indexname = 'ix_persona_fusionada_en'
       ORDER BY 1`,
    )
  ).rows.map((r) => r.o);

// Con una persona fusionada el inverso de 01l_per_fusion se niega; la transacción se revierte.
async function inversoFusionConFilas() {
  const tenant = '39000000-0000-0000-0000-0000000000e0';
  const conservada = '39000000-0000-0000-0000-0000000000e1';
  const absorbida = '39000000-0000-0000-0000-0000000000e2';
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
       VALUES ('${conservada}', '${tenant}', 'NATURAL', 'DNI', '45781236', 'Juana', 'Quispe');
       INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno,
                                activo, fusionada_en_id, fusionada_en)
       VALUES ('${absorbida}', '${tenant}', 'NATURAL', 'PASAPORTE', 'P1234567', 'Juana', 'Quispe', false, '${conservada}', now())`,
    );
    return await c.query(await readFile(rutaDb('rollback/01l_per_fusion.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

// Con un consentimiento guardado el inverso de 01l_per_consentimientos se niega; la transacción se revierte.
async function inversoConsentimientosConFilas() {
  const tenant = '37000000-0000-0000-0000-0000000000e0';
  const persona = '37000000-0000-0000-0000-0000000000e1';
  const c = new pg.Client({ connectionString: urlDb });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno)
       VALUES ('${persona}', '${tenant}', 'NATURAL', 'DNI', '45781236', 'Juana', 'Quispe');
       INSERT INTO per.texto_finalidad (id, tenant_id, finalidad, version, texto, publicado_por)
       VALUES (gen_random_uuid(), '${tenant}', 'PRESTACION', 'v1', repeat('a', 20), gen_random_uuid());
       INSERT INTO per.consentimiento (id, tenant_id, persona_id, finalidad, decision, version_texto, canal, accion_expresa, registrado_por)
       VALUES (gen_random_uuid(), '${tenant}', '${persona}', 'PRESTACION', 'ACEPTA', 'v1', 'WEB', true, gen_random_uuid())`,
    );
    return await c.query(await readFile(rutaDb('rollback/01l_per_consentimientos.sql'), 'utf8')).then(
      () => null,
      (error) => error.code,
    );
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

describeConDb('db/ y supabase/migrations', () => {
  test('aplica, pasa las pruebas SQL, revierte y vuelve a aplicar', async () => {
    const dir = rutaDb('');
    const migraciones = CASOS.map((c) => c.migracion);
    expect(await subir({ url: urlDb, dir })).toEqual(expect.arrayContaining(migraciones));
    for (const { esquema } of CASOS) expect(await existeEsquema(esquema)).toBe(true);

    for (const { prueba } of CASOS) await ejecutar(urlDb, await readFile(rutaDb(prueba), 'utf8'));

    // El inverso de 02a_not_bajas se niega con bajas; sin ellas borra la tabla y su trigger, y se puede reaplicar.
    // Va primero: es la última migración. Queda revertida hasta reaplicar 01o_not y 01t_not_programacion.
    expect((await objetosBajas()).sort()).toEqual(['baja', 'baja_solo_insercion']);
    expect(await inversoBajasConFilas()).toBe('55006');
    await ejecutar(urlDb, await readFile(rutaDb('rollback/02a_not_bajas.sql'), 'utf8'));
    expect(await objetosBajas()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('02a_not_bajas.sql'), 'utf8'));
    expect((await objetosBajas()).sort()).toEqual(['baja', 'baja_solo_insercion']);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/02a_not_bajas.sql'), 'utf8'));

    // El inverso de 01y_org_identidad_empresa se niega con archivos LOGO o empresas con datos de contacto; sin ellos
    // quita las columnas, el CHECK de sucursal y la categoría, y se puede reaplicar. Al reaplicarla normaliza los
    // teléfonos de sucursal que puede y deja los demás. Va después del de 02a_not_bajas.
    expect((await objetosIdentidadEmpresa()).sort()).toEqual(OBJETOS_IDENTIDAD_EMPRESA);
    expect(await inversoIdentidadEmpresaCon(empresaConTelefono)).toBe('55006');
    expect(await inversoIdentidadEmpresaCon(archivoLogo)).toBe('55006');
    expect(await telefonosSucursalNormalizados()).toEqual([
      { codigo: 'ANX', telefono: 'anexo 12' },
      { codigo: 'PRI', telefono: '+51987654321' },
    ]);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01y_org_identidad_empresa.sql'), 'utf8'));
    expect(await objetosIdentidadEmpresa()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01y_org_identidad_empresa.sql'), 'utf8'));
    expect((await objetosIdentidadEmpresa()).sort()).toEqual(OBJETOS_IDENTIDAD_EMPRESA);

    // El inverso de 01x_fe_envio se niega con intentos de envío; sin ellos quita fe.envio y las columnas de respuesta, y
    // se puede reaplicar. Va después del de 01y_org_identidad_empresa. Queda revertida hasta reaplicar 01u_fe_comprobante.
    expect((await objetosEnvio()).sort()).toEqual(['cdr_archivo_id', 'envio', 'respondido_en']);
    expect(await inversoEnvioConIntentos()).toBe('55006');
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01x_fe_envio.sql'), 'utf8'));
    expect(await objetosEnvio()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01x_fe_envio.sql'), 'utf8'));
    expect((await objetosEnvio()).sort()).toEqual(['cdr_archivo_id', 'envio', 'respondido_en']);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01x_fe_envio.sql'), 'utf8'));

    // El inverso de 01w_arc_carga_sistema se niega con archivos SISTEMA; sin ellos quita origen y vuelve a exigir
    // actor, y se puede reaplicar. Va después del de 01x_fe_envio. Queda revertida hasta reaplicar 01m_arc.
    expect((await objetosCargaSistema()).sort()).toEqual(['ck_archivo_actor', 'origen']);
    expect(await inversoCargaSistemaConArchivos()).toBe('55006');
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01w_arc_carga_sistema.sql'), 'utf8'));
    expect(await objetosCargaSistema()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01w_arc_carga_sistema.sql'), 'utf8'));
    expect((await objetosCargaSistema()).sort()).toEqual(['ck_archivo_actor', 'origen']);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01w_arc_carga_sistema.sql'), 'utf8'));

    // El inverso de 01v_fe_sunat_directo se niega con emisores SUNAT; sin ellos quita el ítem. Va después del de
    // 01w_arc_carga_sistema. Queda revertida hasta reaplicar 01p_fe, 01r_fe_prueba y 01u_fe_comprobante.
    expect(await proveedoresFe()).toEqual(['NUBEFACT', 'SIMULADO', 'SUNAT']);
    expect(await inversoSunatConEmisores()).toBe('55006');
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01v_fe_sunat_directo.sql'), 'utf8'));
    expect(await proveedoresFe()).toEqual(['NUBEFACT', 'SIMULADO']);

    // El inverso de 01u_fe_comprobante se niega con comprobantes; sin ellos borra las tablas y TASA_IGV, y se puede
    // reaplicar. Va después del de 01v_fe_sunat_directo. Queda revertida hasta reaplicar 01p_fe y 01r_fe_prueba.
    expect((await objetosComprobante()).sort()).toEqual(['TASA_IGV', 'comprobante', 'comprobante_cuota', 'comprobante_linea']);
    expect(await inversoComprobantesConFilas()).toBe('55006');
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01u_fe_comprobante.sql'), 'utf8'));
    expect(await objetosComprobante()).toEqual([]);

    // El inverso de 01t_not_programacion se niega con programaciones vivas; sin ellas borra la tabla y la función
    // del barrido. Va después del de 01u_fe_comprobante. Queda revertida hasta reaplicar 01o_not y 01q_not_plantillas.
    expect(await objetosProgramacion()).toHaveLength(2);
    expect(await inversoProgramacionesConVivas()).toBe('55006');
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01t_not_programacion.sql'), 'utf8'));
    expect(await objetosProgramacion()).toEqual([]);

    // El inverso de 01s_not_avisos_plataforma se niega con personalizaciones; sin ellas borra las cuatro bases y se
    // puede reaplicar. Va después del de 01t_not_programacion.
    expect(await plantillasAvisos()).toEqual(['INTEGRIDAD_ROTA', 'SOPORTE_SOLICITADO', 'SUSCRIPCION_POR_VENCER', 'TENANT_SUSPENDIDO']);
    expect(await inversoAvisosConPersonalizacion()).toBe('55006');
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01s_not_avisos_plataforma.sql'), 'utf8'));
    expect(await plantillasAvisos()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01s_not_avisos_plataforma.sql'), 'utf8'));
    expect(await plantillasAvisos()).toHaveLength(4);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01s_not_avisos_plataforma.sql'), 'utf8'));

    // El inverso de 01r_fe_prueba se niega con emisores verificados; sin ellos quita las columnas de la prueba y
    // NUBEFACT, y se puede reaplicar. Va después del de 01s_not_avisos_plataforma.
    expect(await inversoFePruebaConVerificados()).toBe('55006');
    expect(await columnasPruebaFe()).toBe(9);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01r_fe_prueba.sql'), 'utf8'));
    expect(await columnasPruebaFe()).toBe(0);
    expect(await proveedoresFe()).toEqual(['SIMULADO']);

    // El inverso de 01q_not_plantillas se niega con personalizaciones; sin ellas deja ntf.plantilla como la dejó
    // 01o_not y se puede reaplicar. Va después del de 01r_fe_prueba. Queda revertida hasta reaplicar 01o_not.
    expect(await objetosPlantillas()).toHaveLength(3);
    expect(await inversoPlantillasConPersonalizacion()).toBe('55006');
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01q_not_plantillas.sql'), 'utf8'));
    expect(await objetosPlantillas()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01q_not_plantillas.sql'), 'utf8'));
    expect(await objetosPlantillas()).toHaveLength(3);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01q_not_plantillas.sql'), 'utf8'));

    // El inverso de 01p_fe se niega con emisores que guardan secretos; sin ellos borra fe y la semilla de
    // PROVEEDOR_FE, y se puede reaplicar junto con 01r_fe_prueba.
    expect(await inversoFeConSecretos()).toBe('55006');
    expect(await existeEsquema('fe')).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01p_fe.sql'), 'utf8'));
    expect(await existeEsquema('fe')).toBe(false);
    expect(await proveedoresFe()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01p_fe.sql'), 'utf8'));
    expect(await proveedoresFe()).toEqual(['SIMULADO']);
    await ejecutar(urlDb, await readFile(rutaDb('01r_fe_prueba.sql'), 'utf8'));
    expect(await proveedoresFe()).toEqual(['NUBEFACT', 'SIMULADO']);
    expect(await columnasPruebaFe()).toBe(9);
    await ejecutar(urlDb, await readFile(rutaDb('01u_fe_comprobante.sql'), 'utf8'));
    expect(await objetosComprobante()).toHaveLength(4);
    await ejecutar(urlDb, await readFile(rutaDb('01v_fe_sunat_directo.sql'), 'utf8'));
    expect(await proveedoresFe()).toEqual(['NUBEFACT', 'SIMULADO', 'SUNAT']);
    await ejecutar(urlDb, await readFile(rutaDb('01x_fe_envio.sql'), 'utf8'));
    expect((await objetosEnvio()).sort()).toEqual(['cdr_archivo_id', 'envio', 'respondido_en']);

    // Después, el de 01o_not se niega con mensajes ENCOLADO; sin ellos borra ntf y se puede reaplicar.
    expect(await inversoNotificacionesConEncolados()).toBe('55006');
    expect(await existeEsquema('ntf')).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01o_not.sql'), 'utf8'));
    expect(await existeEsquema('ntf')).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01o_not.sql'), 'utf8'));
    expect(await existeEsquema('ntf')).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('01q_not_plantillas.sql'), 'utf8'));
    expect(await objetosPlantillas()).toHaveLength(3);
    await ejecutar(urlDb, await readFile(rutaDb('01s_not_avisos_plataforma.sql'), 'utf8'));
    expect(await plantillasAvisos()).toHaveLength(4);
    await ejecutar(urlDb, await readFile(rutaDb('01t_not_programacion.sql'), 'utf8'));
    expect(await objetosProgramacion()).toHaveLength(2);
    await ejecutar(urlDb, await readFile(rutaDb('02a_not_bajas.sql'), 'utf8'));
    expect(await objetosBajas()).toHaveLength(2);

    // El inverso de 01n_sec se niega con secretos guardados; sin ellos borra sec y se puede reaplicar.
    expect(await inversoSecretosConFilas()).toBe('55006');
    expect(await existeEsquema('sec')).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01n_sec.sql'), 'utf8'));
    expect(await existeEsquema('sec')).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01n_sec.sql'), 'utf8'));
    expect(await existeEsquema('sec')).toBe(true);

    // El inverso de 01m_arc_versiones se niega con versiones numero > 1; sin ellas deja arc como lo dejó
    // 01m_arc_analisis. Reaplicada sobre archivos del spec 33, cada versión 1 toma el estado de su archivo.
    expect(await objetosVersiones()).toHaveLength(8);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01m_arc_versiones.sql'), 'utf8'));
    expect(await objetosVersiones()).toEqual([]);
    await insertarArchivosDelSpec33();
    await ejecutar(urlDb, await readFile(rutaDb('01m_arc_versiones.sql'), 'utf8'));
    expect(await objetosVersiones()).toHaveLength(8);
    expect(await estadosRellenados()).toEqual(ESTADOS_ARCHIVO.map((estado) => ({ archivo: estado, version: estado })));
    expect(await inversoVersionesConVersionNueva()).toBe('55006');
    await borrarArchivosDelRelleno();
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01m_arc_versiones.sql'), 'utf8'));

    // El inverso de 01m_arc_categoria_fk le quita al rol que migra el UPDATE sobre arc.categoria.codigo y se puede reaplicar.
    expect(await updateCodigoCategoria()).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01m_arc_categoria_fk.sql'), 'utf8'));
    expect(await updateCodigoCategoria()).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01m_arc_categoria_fk.sql'), 'utf8'));
    expect(await updateCodigoCategoria()).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01m_arc_categoria_fk.sql'), 'utf8'));

    // El inverso de 01m_arc_analisis deja arc como lo dejó 01m_arc y se puede reaplicar. Va antes que el de 01m_arc.
    expect(await objetosAnalisis()).toHaveLength(2);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01m_arc_analisis.sql'), 'utf8'));
    expect(await objetosAnalisis()).toEqual([]);
    expect(await existeEsquema('arc')).toBe(true);

    // El inverso de 01m_arc borra arc y se puede reaplicar.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01m_arc.sql'), 'utf8'));
    expect(await existeEsquema('arc')).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01m_arc.sql'), 'utf8'));
    expect(await existeEsquema('arc')).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('01m_arc_analisis.sql'), 'utf8'));
    expect(await objetosAnalisis()).toHaveLength(2);
    await ejecutar(urlDb, await readFile(rutaDb('01m_arc_categoria_fk.sql'), 'utf8'));
    await ejecutar(urlDb, await readFile(rutaDb('01m_arc_versiones.sql'), 'utf8'));
    expect(await objetosVersiones()).toHaveLength(8);
    await ejecutar(urlDb, await readFile(rutaDb('01w_arc_carga_sistema.sql'), 'utf8'));
    expect((await objetosCargaSistema()).sort()).toEqual(['ck_archivo_actor', 'origen']);

    // El inverso de 01l_per_fusion se niega con personas fusionadas; sin ellas quita alias, fusiones y descartes,
    // y se puede reaplicar (spec 39). Va antes que los demás de per.
    expect(await objetosFusion()).toHaveLength(5);
    expect(await inversoFusionConFilas()).toBe('55006');
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01l_per_fusion.sql'), 'utf8'));
    expect(await objetosFusion()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01l_per_fusion.sql'), 'utf8'));
    expect(await objetosFusion()).toHaveLength(5);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01l_per_fusion.sql'), 'utf8'));

    // El inverso de 01l_per_consentimientos se niega con consentimientos; sin ellos quita textos y decisiones,
    // y se puede reaplicar (spec 37).
    expect(await objetosConsentimientos()).toHaveLength(3);
    expect(await inversoConsentimientosConFilas()).toBe('55006');
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01l_per_consentimientos.sql'), 'utf8'));
    expect(await objetosConsentimientos()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01l_per_consentimientos.sql'), 'utf8'));
    expect(await objetosConsentimientos()).toHaveLength(3);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01l_per_consentimientos.sql'), 'utf8'));

    // El inverso de 01l_per_contactos deja per como lo dejó 01l_per (spec 32) y va antes que el de 01l_per.
    expect(await objetosContactos()).toHaveLength(3);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01l_per_contactos.sql'), 'utf8'));
    expect(await objetosContactos()).toEqual([]);
    expect(await existeEsquema('per')).toBe(true);

    // El inverso de 01l_per_busqueda quita funciones, columnas e índices de búsqueda, deja las extensiones
    // y se puede reaplicar (spec 38). Va antes que el de 01l_per.
    expect(await objetosBusqueda()).toHaveLength(8);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01l_per_busqueda.sql'), 'utf8'));
    expect(await objetosBusqueda()).toEqual([]);
    expect(await extensionesBusqueda()).toEqual(['btree_gin', 'pg_trgm', 'unaccent']);
    await ejecutar(urlDb, await readFile(rutaDb('01l_per_busqueda.sql'), 'utf8'));
    expect(await objetosBusqueda()).toHaveLength(8);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01l_per_busqueda.sql'), 'utf8'));

    // El inverso de 01l_per borra per; ambas se pueden reaplicar.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01l_per.sql'), 'utf8'));
    expect(await existeEsquema('per')).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01l_per.sql'), 'utf8'));
    expect(await existeEsquema('per')).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('01l_per_busqueda.sql'), 'utf8'));
    expect(await objetosBusqueda()).toHaveLength(8);
    await ejecutar(urlDb, await readFile(rutaDb('01l_per_contactos.sql'), 'utf8'));
    expect(await objetosContactos()).toHaveLength(3);
    await ejecutar(urlDb, await readFile(rutaDb('01l_per_consentimientos.sql'), 'utf8'));
    expect(await objetosConsentimientos()).toHaveLength(3);
    await ejecutar(urlDb, await readFile(rutaDb('01l_per_fusion.sql'), 'utf8'));
    expect(await objetosFusion()).toHaveLength(5);

    // El inverso de 01k_idn_cuota deja idn como lo dejó 01j_idn (con el proveedor sembrado) y se puede reaplicar.
    expect(await objetosCuota()).toHaveLength(6);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01k_idn_cuota.sql'), 'utf8'));
    expect(await objetosCuota()).toEqual([]);
    expect(await existeEsquema('idn')).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('01k_idn_cuota.sql'), 'utf8'));
    expect(await objetosCuota()).toHaveLength(6);

    // El inverso de 01h_obs_estado_outbox quita la función y la política, y se puede reaplicar (spec 21).
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01h_obs_estado_outbox.sql'), 'utf8'));
    expect(await existeEstadoOutbox()).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01h_obs_estado_outbox.sql'), 'utf8'));
    expect(await existeEstadoOutbox()).toBe(true);

    // El inverso de 01g_aud_integridad se niega con verificaciones; sin ellas deja aud como lo dejó 01g_aud
    // y se puede reaplicar. Va antes que el de 01g_aud.
    expect(await inversoIntegridadConFilas()).toBe('55006');
    expect(await objetosIntegridad()).toHaveLength(8);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01g_aud_integridad.sql'), 'utf8'));
    expect(await objetosIntegridad()).toEqual([]);
    expect(await existeEsquema('aud')).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('01g_aud_integridad.sql'), 'utf8'));
    expect(await objetosIntegridad()).toHaveLength(8);

    // El inverso de 01g_aud se niega con filas; sin filas borra aud y se puede reaplicar.
    expect(await inversoAuditoriaConFilas()).toBe('55006');
    expect(await existeEsquema('aud')).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01g_aud_integridad.sql'), 'utf8'));
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01g_aud.sql'), 'utf8'));
    expect(await existeEsquema('aud')).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01g_aud.sql'), 'utf8'));
    await ejecutar(urlDb, await readFile(rutaDb('01g_aud_integridad.sql'), 'utf8'));
    expect(await existeEsquema('aud')).toBe(true);
    expect(await objetosIntegridad()).toHaveLength(8);

    // El inverso de 01f_cat_tablas_fe borra las definiciones vacías, deja la que tiene ítems y se puede reaplicar.
    // Va antes que el de 01f_cat_importacion: consulta cat.importacion.
    expect(await catalogosFacturacion()).toHaveLength(6);
    await ejecutar(
      urlDb,
      `SELECT cat.guardar_item_global('${ITEM_TRIBUTO_PRUEBA}', NULL, 'ca700000-0000-0000-0000-000000000010', '1000', NULL,
              'IGV Impuesto General a las Ventas', NULL, 1, '{}', '2026-01-01', NULL, true, 'a4000000-0000-0000-0000-000000000901')`,
    );
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01f_cat_tablas_fe.sql'), 'utf8'));
    expect(await catalogosFacturacion()).toEqual(['TRIBUTO']);
    await ejecutar(urlDb, `DELETE FROM cat.catalogo_item WHERE id = '${ITEM_TRIBUTO_PRUEBA}'`);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01f_cat_tablas_fe.sql'), 'utf8'));
    expect(await catalogosFacturacion()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01f_cat_tablas_fe.sql'), 'utf8'));
    expect(await catalogosFacturacion()).toHaveLength(6);

    // El inverso de 01f_cat_items_busqueda deja la búsqueda en código o nombre y se puede reaplicar.
    expect(await buscaEnAtributos()).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01f_cat_items_busqueda.sql'), 'utf8'));
    expect(await buscaEnAtributos()).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01f_cat_items_busqueda.sql'), 'utf8'));
    expect(await buscaEnAtributos()).toBe(true);

    // El inverso de 01f_cat_importacion deja cat como lo dejó 01f_cat (con datos) y se puede reaplicar.
    // Va antes que el de 01f_cat: reemplaza cat.subir_version_global().
    expect(await objetosImportacion()).toHaveLength(7);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01f_cat_importacion.sql'), 'utf8'));
    expect(await objetosImportacion()).toEqual([]);
    expect(await catalogosOficialesNuevos()).toBe(0);

    // El inverso de 01f_cat_feriado deja cat como lo dejó 01f_cat (con datos). Va antes que el de 01f_cat.
    expect(await objetosFeriado()).toHaveLength(6);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01f_cat_feriado.sql'), 'utf8'));
    expect(await objetosFeriado()).toEqual([]);

    // El inverso de 01f_cat borra cat (con datos) y se puede reaplicar. Va primero: cat depende de org y seg.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01f_cat.sql'), 'utf8'));
    expect(await existeEsquema('cat')).toBe(false);
    await ejecutar(urlDb, await readFile(rutaDb('01f_cat.sql'), 'utf8'));
    expect(await existeEsquema('cat')).toBe(true);
    await ejecutar(urlDb, await readFile(rutaDb('01f_cat_feriado.sql'), 'utf8'));
    expect(await objetosFeriado()).toHaveLength(6);
    expect(await feriadosSemilla()).toBe(18);
    await ejecutar(urlDb, await readFile(rutaDb('01f_cat_importacion.sql'), 'utf8'));
    expect(await objetosImportacion()).toHaveLength(7);
    expect(await catalogosOficialesNuevos()).toBe(5);
    await ejecutar(urlDb, await readFile(rutaDb('01f_cat_tablas_fe.sql'), 'utf8'));
    expect(await catalogosFacturacion()).toHaveLength(6);

    // El inverso de 01e_sync_traza deja sync.outbox sin actor, IP ni trace (con datos) y se puede reaplicar.
    expect(await columnasTraza()).toEqual(['actor_id', 'ip', 'trace_id']);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01e_sync_traza.sql'), 'utf8'));
    expect(await columnasTraza()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01e_sync_traza.sql'), 'utf8'));
    expect(await columnasTraza()).toEqual(['actor_id', 'ip', 'trace_id']);

    // El inverso de 01e_sync_relay deja sync como lo dejó 01e_sync_outbox (con datos) y se puede reaplicar.
    // Va primero: evento_fallido referencia seg.usuario.
    // 01h depende de evento_fallido: se baja antes y se reaplica después, como en la bajada real.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01h_obs_estado_outbox.sql'), 'utf8'));
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01e_sync_relay.sql'), 'utf8'));
    expect(await objetosRelay()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01e_sync_relay.sql'), 'utf8'));
    expect(await objetosRelay()).toHaveLength(7);
    await ejecutar(urlDb, await readFile(rutaDb('01h_obs_estado_outbox.sql'), 'utf8'));

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

    // El inverso de 01b_seg_tipos_ingreso deja seg como lo dejó 01b_seg_soporte y se puede reaplicar.
    // Va antes que el de 01b_seg_soporte: reemplaza su CHECK. Con filas de los tipos nuevos se niega.
    expect(await inversoTiposIngresoConFilas()).toBe('55006');
    expect(await objetosTiposIngreso()).toHaveLength(5);
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01b_seg_tipos_ingreso.sql'), 'utf8'));
    expect(await objetosTiposIngreso()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01b_seg_tipos_ingreso.sql'), 'utf8'));
    expect(await objetosTiposIngreso()).toHaveLength(5);

    // El inverso de 01b_seg_soporte deja seg como lo dejó 01b_seg_membresias (con datos) y se puede
    // reaplicar. Va antes que el de 01b_seg_membresias: acceso_soporte referencia la membresía.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01b_seg_soporte.sql'), 'utf8'));
    expect(await objetosSoporte()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01b_seg_soporte.sql'), 'utf8'));
    expect(await objetosSoporte()).toHaveLength(7);

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

    // El inverso de 01a_org_consola deja org como lo dejó 01a_org_alta y se puede reaplicar. Va antes que el de 01a_org_alta.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01a_org_consola.sql'), 'utf8'));
    expect(await objetosConsola()).toEqual([]);
    expect(await objetosAlta()).toHaveLength(5);
    await ejecutar(urlDb, await readFile(rutaDb('01a_org_consola.sql'), 'utf8'));
    expect(await objetosConsola()).toHaveLength(5);

    // El inverso de 01a_org_alta deja org como lo dejó 01a_org (con datos) y se puede reaplicar.
    await ejecutar(urlDb, await readFile(rutaDb('rollback/01a_org_alta.sql'), 'utf8'));
    expect(await objetosAlta()).toEqual([]);
    await ejecutar(urlDb, await readFile(rutaDb('01a_org_alta.sql'), 'utf8'));
    expect(await objetosAlta()).toHaveLength(5);

    // supabase/migrations necesita auth.users, storage y los roles de Supabase.
    const dirSupabase = rutaSupabase('migrations');
    await ejecutar(urlDb, await readFile(ruta('./fixtures/simular-supabase.sql'), 'utf8'));
    expect(await subir({ url: urlDb, dir: dirSupabase })).toEqual(MIGRACIONES_SUPABASE);
    await ejecutar(urlDb, await readFile(rutaSupabase('tests/seg_supabase_auth.test.sql'), 'utf8'));
    // El bucket de TR-ARC nace privado, con 25 MB y los 8 MIME de las categorías; con objetos no se revierte.
    expect(await bucketArchivos()).toMatchObject({ public: false, file_size_limit: '26214400' });
    expect((await bucketArchivos()).allowed_mime_types).toHaveLength(8);
    expect(await inversoBucketConObjetos()).toBe('55006');
    expect(await bajar({ url: urlDb, dir: dirSupabase })).toEqual([...MIGRACIONES_SUPABASE].reverse());
    expect(await triggersAuth()).toEqual([]);
    expect(await bucketArchivos()).toBeUndefined();

    expect(await bajar({ url: urlDb, dir })).toEqual(expect.arrayContaining(migraciones));
    for (const { esquema } of CASOS) expect(await existeEsquema(esquema)).toBe(false);

    expect(await subir({ url: urlDb, dir })).toEqual(expect.arrayContaining(migraciones));
    for (const { esquema } of CASOS) expect(await existeEsquema(esquema)).toBe(true);
    expect(await subir({ url: urlDb, dir: dirSupabase })).toEqual(MIGRACIONES_SUPABASE);
    expect(await triggersAuth()).toEqual(['trg_auth_usuario_correo', 'trg_auth_usuario_creado']);
    expect(await bucketArchivos()).toBeDefined();
  }, TIMEOUT_MS);
});
