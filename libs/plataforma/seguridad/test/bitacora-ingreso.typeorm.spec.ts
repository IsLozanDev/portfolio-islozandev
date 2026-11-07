import { DataSource } from 'typeorm';
import { BitacoraIngresoTypeorm } from '../src/infrastructure/typeorm/bitacora-ingreso.typeorm.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const ROSA = '0193f3a0-0000-7000-8000-000000000901';
const FERMIN = '0193f3a0-0000-7000-8000-000000000902';

interface FilaEvento {
  tenant_id: string | null;
  usuario_id: string | null;
  tipo: string;
  detalle: Record<string, unknown>;
  ip: string | null;
}

describeConDb('BitacoraIngresoTypeorm (PostgreSQL, spec 18b)', () => {
  let tmp: TempDb;
  let ds: DataSource;
  let bitacora: BitacoraIngresoTypeorm;

  const eventosDeIngreso = async (): Promise<FilaEvento[]> =>
    ds.query(`SELECT tenant_id, usuario_id, tipo, detalle, host(ip) AS ip FROM seg.evento_seguridad
               WHERE tipo IN ('LOGIN', 'LOGIN_FALLIDO') ORDER BY id`);

  beforeAll(async () => {
    tmp = await createTempDb();
    ds = new DataSource({ type: 'postgres', url: tmp.url });
    await ds.initialize();
    bitacora = new BitacoraIngresoTypeorm(ds);
    await ds.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, 'ing-rosa', 'Bodega Rosa', 'ACTIVO', 1)`, [TENANT]);
    await ds.query(
      `INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES
         ($1, 'rosa.huaman@gmail.com', 'Rosa', 'EXTERNO', 'ACTIVO'),
         ($2, 'fermin.quispe@gmail.com', 'Fermín', 'EXTERNO', 'ACTIVO')`,
      [ROSA, FERMIN],
    );
    await ds.query(`INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado) VALUES (gen_random_uuid(), $1, $2, 'ACTIVO')`, [ROSA, TENANT]);
  });

  afterAll(async () => {
    await ds?.destroy();
    await tmp?.drop();
  });

  it('resuelve el usuario y el tenant de un correo, normalizado', async () => {
    expect(await bitacora.usuarioPorCorreo(' Rosa.Huaman@Gmail.com ')).toEqual({ usuarioId: ROSA, tenantId: TENANT });
  });

  it('un usuario sin membresía activa vuelve sin tenant; un correo inexistente, null', async () => {
    expect(await bitacora.usuarioPorCorreo('fermin.quispe@gmail.com')).toEqual({ usuarioId: FERMIN, tenantId: null });
    expect(await bitacora.usuarioPorCorreo('nadie@gmail.com')).toBeNull();
  });

  it('registra LOGIN_FALLIDO sin tenant y LOGIN en el tenant, con la IPv4 legible', async () => {
    await bitacora.registrar({
      tipo: 'LOGIN_FALLIDO',
      tenantId: null,
      usuarioId: null,
      detalle: { etapa: 'CLAVE', motivo: 'CREDENCIALES', correo: 'na****@gmail.com' },
      ip: '::ffff:190.42.10.8',
    });
    await bitacora.registrar({ tipo: 'LOGIN', tenantId: TENANT, usuarioId: ROSA, detalle: { metodo: 'password' }, ip: null });

    expect(await eventosDeIngreso()).toEqual([
      {
        tenant_id: null,
        usuario_id: null,
        tipo: 'LOGIN_FALLIDO',
        detalle: { etapa: 'CLAVE', motivo: 'CREDENCIALES', correo: 'na****@gmail.com' },
        ip: '190.42.10.8',
      },
      { tenant_id: TENANT, usuario_id: ROSA, tipo: 'LOGIN', detalle: { metodo: 'password' }, ip: null },
    ]);
  });
});
