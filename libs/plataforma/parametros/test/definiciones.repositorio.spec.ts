import { DataSource } from 'typeorm';
import { RegistrarDefiniciones } from '../src/application/registrar-definiciones.js';
import { ValidadorEsquemaAjv } from '../src/infrastructure/ajv/validador-esquema.ajv.js';
import { DefinicionesRepositorioTypeOrm } from '../src/infrastructure/typeorm/definiciones.repositorio.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const PROPINA = {
  codigo: 'rest.propina.porcentaje',
  descripcion: 'Porcentaje de propina sugerida',
  tipo: 'NUMERO',
  valor_defecto: 10,
  alcance_maximo: 'SUCURSAL',
  esquema: { minimum: 0, maximum: 20 },
};
const MONEDA = { codigo: 'rest.factura.moneda', descripcion: 'Moneda de la cuenta', tipo: 'TEXTO', valor_defecto: 'PEN', alcance_maximo: 'EMPRESA' };
const rest = (...parametros: unknown[]) => ({ productoCodigo: 'REST', parametros });

describeConDb('DefinicionesRepositorioTypeOrm (TR-RF-030, PostgreSQL 16)', () => {
  let db: TempDb;
  let ds: DataSource;
  let registrar: RegistrarDefiniciones;
  const filas = (sql: string, params: unknown[] = []) => ds.query(sql, params);
  const vd = async () => Number((await filas('SELECT COALESCE(max(id), 0) AS vd FROM cfg.definiciones_aplicadas'))[0].vd);

  beforeAll(async () => {
    db = await createTempDb();
    ds = new DataSource({ type: 'postgres', url: db.url });
    await ds.initialize();
    await ds.query("INSERT INTO seg.producto (codigo, nombre) VALUES ('REST', 'Restaurantes') ON CONFLICT (codigo) DO NOTHING");
    registrar = new RegistrarDefiniciones(new DefinicionesRepositorioTypeOrm(ds), new ValidadorEsquemaAjv());
  });

  afterAll(async () => {
    await ds?.destroy();
    await db?.drop();
  });

  it('TR-CA-078: inserta con jsonb real (texto, número y esquema) y registra el cambio', async () => {
    expect(await registrar.ejecutar(rest(PROPINA, MONEDA))).toMatchObject({ insertadas: 2 });
    expect(await filas("SELECT codigo, valor_defecto, alcance_maximo, esquema, obsoleto FROM cfg.parametro_def WHERE producto_codigo = 'REST' ORDER BY codigo")).toEqual([
      { codigo: 'rest.factura.moneda', valor_defecto: 'PEN', alcance_maximo: 'EMPRESA', esquema: null, obsoleto: false },
      { codigo: 'rest.propina.porcentaje', valor_defecto: 10, alcance_maximo: 'SUCURSAL', esquema: { minimum: 0, maximum: 20 }, obsoleto: false },
    ]);
    expect(await filas("SELECT jsonb_typeof(valor_defecto) AS t FROM cfg.parametro_def WHERE codigo = 'rest.factura.moneda'")).toEqual([{ t: 'string' }]);
  });

  it('repetir da 0 cambios y vd no sube (TR-RNF-120)', async () => {
    const antes = await vd();
    expect(await registrar.ejecutar(rest(PROPINA, MONEDA))).toEqual({ insertadas: 0, actualizadas: 0, obsoletas: 0, reactivadas: 0 });
    expect(await vd()).toBe(antes);
  });

  it('retirar marca obsoleta y conserva los valores; volver la reactiva', async () => {
    await ds.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ('0193f3a0-0000-7000-8000-0000000000c1', 'cfg-repo', 'Cfg repo', 'ACTIVO', 1)`);
    await ds.query(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ('0193f3a0-0000-7000-8000-0000000009c1', 'repo.cfg@gmail.com', 'Repo', 'INTERNO', 'ACTIVO')`);
    await ds.query(
      `INSERT INTO cfg.parametro_valor (id, tenant_id, codigo, alcance, valor, modificado_por)
       VALUES ('0193f3a0-0000-7000-8000-00000000a0c1', '0193f3a0-0000-7000-8000-0000000000c1', 'rest.factura.moneda', 'TENANT', '"USD"', '0193f3a0-0000-7000-8000-0000000009c1')`,
    );
    const antes = await vd();

    expect(await registrar.ejecutar(rest(PROPINA))).toMatchObject({ obsoletas: 1 });
    expect(await filas("SELECT obsoleto FROM cfg.parametro_def WHERE codigo = 'rest.factura.moneda'")).toEqual([{ obsoleto: true }]);
    expect(await filas("SELECT valor FROM cfg.parametro_valor WHERE codigo = 'rest.factura.moneda'")).toEqual([{ valor: 'USD' }]);
    expect(await vd()).toBeGreaterThan(antes);

    expect(await registrar.ejecutar(rest(PROPINA, { ...MONEDA, valor_defecto: 'USD' }))).toMatchObject({ reactivadas: 1 });
    expect(await filas("SELECT obsoleto, valor_defecto FROM cfg.parametro_def WHERE codigo = 'rest.factura.moneda'")).toEqual([{ obsoleto: false, valor_defecto: 'USD' }]);
  });

  it('un fallo dentro de la transacción no deja nada escrito', async () => {
    const antes = await vd();
    await expect(registrar.ejecutar(rest(PROPINA, { ...MONEDA, tipo: 'JSON', valor_defecto: { m: 'PEN' } }))).rejects.toThrow('no puede cambiar a JSON');
    expect(await vd()).toBe(antes);
  });
});
