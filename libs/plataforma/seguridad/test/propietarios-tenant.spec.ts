import { ROL_PROPIETARIO } from '../src/application/invitar-propietario.js';
import { PropietariosTenantTypeOrm } from '../src/infrastructure/typeorm/propietarios-tenant.typeorm.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const VIGENCIA_VENCIDA = { desde: '2025-01-01', hasta: '2025-12-31' };
const VIGENCIA_FUTURA = { desde: '2999-01-01' };

describeConDb('PropietariosTenant (spec 44, PostgreSQL 16)', () => {
  let e: Entorno;
  let propietarios: PropietariosTenantTypeOrm;
  let rolPropietario: string;

  const listar = (tenantId: string) => e.en(tenantId, () => e.uow.run(() => propietarios.listar()));
  const cambiarCorreo = (usuarioId: string, correo: string) => e.dataSource.query('UPDATE seg.usuario SET email = $2 WHERE id = $1', [usuarioId, correo]);

  async function propietario(tenantId: string, correo: string, estado: 'ACTIVO' | 'SUSPENDIDO' | 'FINALIZADO' = 'ACTIVO', vigencia?: { desde?: string; hasta?: string | null }) {
    const miembro = await e.sembrar.membresia(tenantId, estado, true);
    await cambiarCorreo(miembro.usuarioId, correo);
    const asignacionId = await e.sembrar.asignacion(tenantId, miembro.membresiaId, { rolId: rolPropietario }, vigencia);
    return { ...miembro, asignacionId };
  }

  beforeAll(async () => {
    e = await crearEntorno();
    propietarios = new PropietariosTenantTypeOrm(e.uow, e.contexto, { now: () => new Date() });
    rolPropietario = await e.sembrar.rol(null, 'PLAT', ROL_PROPIETARIO, []);
  });

  afterAll(() => e?.cerrar());

  it('devuelve los propietarios activos con asignación vigente, ordenados por correo, solo del tenant del contexto', async () => {
    const tenantId = await e.sembrar.tenant();
    const otroTenant = await e.sembrar.tenant();
    const rosa = await propietario(tenantId, `rosa.${tenantId}@prueba.pe`);
    const ana = await propietario(tenantId, `ana.${tenantId}@prueba.pe`);
    await propietario(otroTenant, `luis.${otroTenant}@prueba.pe`);

    expect(await listar(tenantId)).toEqual([
      { usuarioId: ana.usuarioId, correo: `ana.${tenantId}@prueba.pe` },
      { usuarioId: rosa.usuarioId, correo: `rosa.${tenantId}@prueba.pe` },
    ]);
    expect((await listar(otroTenant)).map((fila) => fila.correo)).toEqual([`luis.${otroTenant}@prueba.pe`]);
  });

  it('excluye membresía suspendida o finalizada, asignación vencida, futura o revocada, y otros roles', async () => {
    const tenantId = await e.sembrar.tenant();
    const vigente = await propietario(tenantId, `vigente.${tenantId}@prueba.pe`);
    await propietario(tenantId, `suspendido.${tenantId}@prueba.pe`, 'SUSPENDIDO');
    await propietario(tenantId, `finalizado.${tenantId}@prueba.pe`, 'FINALIZADO');
    await propietario(tenantId, `vencida.${tenantId}@prueba.pe`, 'ACTIVO', VIGENCIA_VENCIDA);
    await propietario(tenantId, `futura.${tenantId}@prueba.pe`, 'ACTIVO', VIGENCIA_FUTURA);
    const revocado = await propietario(tenantId, `revocado.${tenantId}@prueba.pe`);
    await e.dataSource.query("UPDATE seg.asignacion SET revocada_en = now(), motivo_revocacion = 'prueba' WHERE id = $1", [revocado.asignacionId]);

    const cajero = await e.sembrar.membresia(tenantId, 'ACTIVO');
    await cambiarCorreo(cajero.usuarioId, `cajero.${tenantId}@prueba.pe`);
    await e.sembrar.asignacion(tenantId, cajero.membresiaId, { rolId: await e.sembrar.rol(tenantId, 'PLAT', 'CAJERO', []) });
    // Un rol del tenant con el mismo código no es el predefinido.
    const imitador = await e.sembrar.membresia(tenantId, 'ACTIVO');
    await cambiarCorreo(imitador.usuarioId, `imitador.${tenantId}@prueba.pe`);
    await e.sembrar.asignacion(tenantId, imitador.membresiaId, { rolId: await e.sembrar.rol(tenantId, 'PLAT', ROL_PROPIETARIO, []) });

    expect(await listar(tenantId)).toEqual([{ usuarioId: vigente.usuarioId, correo: `vigente.${tenantId}@prueba.pe` }]);
  });

  it('tenant sin propietarios: lista vacía', async () => {
    const tenantId = await e.sembrar.tenant();
    expect(await listar(tenantId)).toEqual([]);
  });
});
