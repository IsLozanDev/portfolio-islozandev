import { DataSource } from 'typeorm';
import { RegistroAccesoTypeorm } from '../src/infrastructure/typeorm/registro-acceso.typeorm.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const USUARIO = '0193f3a0-0000-7000-8000-000000000001';

describeConDb('RegistroAccesoTypeorm (PostgreSQL)', () => {
  let tmp: TempDb;
  let ds: DataSource;
  let consultas: number;
  const contado = { query: (sql: string, params?: unknown[]) => (consultas++, ds.query(sql, params)) };

  const ultimoAcceso = async (): Promise<Date | null> =>
    (await ds.query('SELECT ultimo_acceso FROM seg.usuario WHERE id = $1', [USUARIO]))[0].ultimo_acceso;
  const ms = async (): Promise<number> => (await ultimoAcceso())?.getTime() ?? Number.NaN;

  beforeAll(async () => {
    tmp = await createTempDb();
    ds = new DataSource({ type: 'postgres', url: tmp.url });
    await ds.initialize();
    await ds.query(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, 'rosa.huaman@gmail.com', 'Rosa', 'EXTERNO', 'ACTIVO')`, [USUARIO]);
  });

  afterAll(async () => {
    await ds?.destroy();
    await tmp?.drop();
  });

  beforeEach(async () => {
    consultas = 0;
    await ds.query('UPDATE seg.usuario SET ultimo_acceso = NULL WHERE id = $1', [USUARIO]);
  });

  it('la primera marca escribe ultimo_acceso con la hora actual', async () => {
    const antes = Date.now();
    await new RegistroAccesoTypeorm(contado).marcar(USUARIO);
    expect(Math.abs((await ms()) - antes)).toBeLessThan(5_000);
  });

  it('una segunda marca inmediata no consulta la base ni cambia el valor', async () => {
    const registro = new RegistroAccesoTypeorm(contado);
    await registro.marcar(USUARIO);
    const primero = await ultimoAcceso();
    await registro.marcar(USUARIO);
    expect(consultas).toBe(1);
    expect(await ultimoAcceso()).toEqual(primero);
  });

  it('pasados 15 min en memoria vuelve a consultar', async () => {
    let ahora = Date.now();
    const registro = new RegistroAccesoTypeorm(contado, () => ahora);
    await registro.marcar(USUARIO);
    ahora += 16 * 60_000;
    await registro.marcar(USUARIO);
    expect(consultas).toBe(2);
  });

  it('con ultimo_acceso de hace 20 min lo actualiza', async () => {
    await ds.query(`UPDATE seg.usuario SET ultimo_acceso = now() - interval '20 minutes' WHERE id = $1`, [USUARIO]);
    const viejo = await ms();
    await new RegistroAccesoTypeorm(contado).marcar(USUARIO);
    expect(await ms()).toBeGreaterThan(viejo + 19 * 60_000);
  });

  it('con ultimo_acceso de hace 5 min no lo cambia (otra instancia de la API ya marcó)', async () => {
    await ds.query(`UPDATE seg.usuario SET ultimo_acceso = now() - interval '5 minutes' WHERE id = $1`, [USUARIO]);
    const previo = await ultimoAcceso();
    await new RegistroAccesoTypeorm(contado).marcar(USUARIO);
    expect(await ultimoAcceso()).toEqual(previo);
  });

  it('un usuario inexistente no falla', async () => {
    await expect(new RegistroAccesoTypeorm(contado).marcar('0193f3a0-0000-7000-8000-0000000000ff')).resolves.toBeUndefined();
  });

  it('si la consulta falla, propaga el error y no recuerda la marca', async () => {
    let fallar = true;
    const db = { query: async () => (consultas++, fallar ? Promise.reject(new Error('caída')) : []) };
    const registro = new RegistroAccesoTypeorm(db);
    await expect(registro.marcar(USUARIO)).rejects.toThrow('caída');
    fallar = false;
    await registro.marcar(USUARIO);
    expect(consultas).toBe(2);
  });
});
