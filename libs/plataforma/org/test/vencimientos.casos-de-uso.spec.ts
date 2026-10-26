import { CrearTenant } from '../src/application/crear-tenant.js';
import type { DiasGracia } from '../src/application/ports/vencimientos.js';
import { GestionarSuscripcion } from '../src/application/tenant.casos-de-uso.js';
import { ProcesarVencimientosTenant, RevisarVencimientos } from '../src/application/vencimientos.js';
import type { ProductoCodigo } from '../src/domain/suscripcion.js';
import { UsoUsuariosProvisional } from '../src/infrastructure/uso-usuarios.provisional.js';
import { RepositorioAvisosTypeOrm, SuscripcionesARevisarTypeOrm } from '../src/infrastructure/typeorm/vencimientos.typeorm.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const AHORA = new Date('2026-10-10T11:00:00Z');
const GRACIA_POR_DEFECTO = 5;

describeConDb('Tarea diaria de vencimientos (PostgreSQL 16)', () => {
  let e: Entorno;
  let tenantsVistos: Record<string, string>;
  let graciaPorTenant: Record<string, number | Error>;
  const avisos: string[] = [];

  /** Falso de CFG: anota el app.tenant_id de la transacción y permite fijar gracia o fallo por tenant. */
  const diasGracia: DiasGracia = {
    de: async (tenantId) => {
      const [{ actual }] = await e.uow.manager.query("SELECT current_setting('app.tenant_id') AS actual");
      tenantsVistos[tenantId] = actual;
      const valor = graciaPorTenant[tenantId] ?? GRACIA_POR_DEFECTO;
      if (valor instanceof Error) throw valor;
      return valor;
    },
  };

  const revisar = () => {
    const procesar = new ProcesarVencimientosTenant({
      unidadDeTrabajo: e.uow,
      contexto: e.contexto,
      ids: e.ids,
      reloj: { now: () => AHORA },
      eventos: e.eventos,
      tenants: e.repos.tenants,
      suscripciones: e.repos.suscripciones,
      avisos: new RepositorioAvisosTypeOrm(e.uow),
      diasGracia,
    });
    return new RevisarVencimientos(new SuscripcionesARevisarTypeOrm(e.dataSource), procesar, () => undefined, (mensaje) => avisos.push(mensaje));
  };

  beforeAll(async () => {
    e = await crearEntorno();
  });

  beforeEach(() => {
    tenantsVistos = {};
    graciaPorTenant = {};
    avisos.length = 0;
  });

  afterAll(() => e?.cerrar());

  const tenantCon = async (codigo: string, vigenteHasta: string, producto: ProductoCodigo = 'PSI', estado: 'PRUEBA' | 'ACTIVA' = 'PRUEBA') => {
    const { tenantId } = await new CrearTenant(e.uow, e.contexto, e.ids, e.eventos, e.repos.tenants).ejecutar({
      codigo,
      nombre: `Tenant ${codigo}`,
      estado: estado === 'PRUEBA' ? 'PRUEBA' : 'ACTIVO',
    });
    const { suscripcionId } = await agregarSuscripcion(tenantId, producto, vigenteHasta, estado);
    return { tenantId, suscripcionId };
  };
  const agregarSuscripcion = (tenantId: string, producto: ProductoCodigo, vigenteHasta: string, estado: 'PRUEBA' | 'ACTIVA' = 'ACTIVA') =>
    new GestionarSuscripcion(e.uow, e.contexto, e.ids, e.eventos, e.repos, new UsoUsuariosProvisional()).ejecutar({
      tenantId,
      productoCodigo: producto,
      edicion: null,
      plan: 'BASICO',
      estado,
      limiteSucursales: null,
      limiteUsuarios: null,
      vigenteHasta,
    });
  const filaTenant = (id: string) => e.dataSource.query('SELECT estado, estado_motivo FROM org.tenant WHERE id = $1', [id]).then((f) => f[0]);
  const filaSuscripcion = (id: string) => e.dataSource.query('SELECT estado, version FROM org.suscripcion WHERE id = $1', [id]).then((f) => f[0]);
  const historial = (id: string) => e.dataSource.query('SELECT estado_nuevo, motivo, actor_id FROM org.tenant_estado_historial WHERE tenant_id = $1', [id]);
  const contarAvisos = (suscripcionId: string) =>
    e.dataSource.query('SELECT count(*)::int AS n FROM org.aviso_vencimiento WHERE suscripcion_id = $1', [suscripcionId]).then((f) => f[0].n);
  const eventosOutbox = (aggregateId: string) =>
    e.dataSource.query('SELECT event_type, payload, version::int AS version FROM sync.outbox WHERE aggregate_id = $1 ORDER BY seq', [aggregateId]);

  it('TR-CA-019: con PSI hasta el 13/10/2026, la tarea del 10/10 publica suscripcion.por_vencer con dias_antes = 3', async () => {
    const { suscripcionId } = await tenantCon('psico-andina', '2026-10-13');

    await revisar().ejecutar('2026-10-10');

    const eventos = await eventosOutbox(suscripcionId);
    expect(eventos.map((evento: { event_type: string }) => evento.event_type)).toEqual(['suscripcion.cambiada', 'suscripcion.por_vencer']);
    expect(eventos[1].payload).toEqual({ producto_codigo: 'PSI', vigente_hasta: '2026-10-13', dias_antes: 3 });
    expect(eventos[1].version).toBe(Number((await filaSuscripcion(suscripcionId)).version));
    expect(await contarAvisos(suscripcionId)).toBe(1);
  });

  it('TR-CA-021: reejecutar el mismo día no publica avisos ni escribe filas nuevas', async () => {
    const { suscripcionId } = await tenantCon('psico-repetida', '2026-10-17');

    await revisar().ejecutar('2026-10-10');
    const tras = { eventos: (await eventosOutbox(suscripcionId)).length, avisos: await contarAvisos(suscripcionId) };
    await revisar().ejecutar('2026-10-10');

    expect(tras).toEqual({ eventos: 2, avisos: 1 });
    expect((await eventosOutbox(suscripcionId)).length).toBe(2);
    expect(await contarAvisos(suscripcionId)).toBe(1);
  });

  it('TR-CA-020: vencida hace 5 días con gracia de 5 y sin otra vigente suspende el tenant', async () => {
    const { tenantId, suscripcionId } = await tenantCon('gracia-agotada', '2026-10-05');

    await revisar().ejecutar('2026-10-10');

    expect(await filaSuscripcion(suscripcionId)).toMatchObject({ estado: 'VENCIDA' });
    expect(await filaTenant(tenantId)).toEqual({ estado: 'SUSPENDIDO', estado_motivo: 'Fin del periodo de gracia de la suscripción' });
    expect(await historial(tenantId)).toEqual([{ estado_nuevo: 'SUSPENDIDO', motivo: 'Fin del periodo de gracia de la suscripción', actor_id: null }]);
    expect(await e.eventosDe(tenantId)).toEqual(['tenant.creado', 'tenant.suspendido']);
  });

  it('suscripcion.vencida se publica una sola vez aunque la tarea corra dos días', async () => {
    const { tenantId, suscripcionId } = await tenantCon('vencida-una-vez', '2026-10-08', 'GYM', 'ACTIVA');

    await revisar().ejecutar('2026-10-10');
    await revisar().ejecutar('2026-10-11');

    expect(await e.eventosDe(suscripcionId)).toEqual(['suscripcion.cambiada', 'suscripcion.vencida']);
    expect(await filaTenant(tenantId)).toMatchObject({ estado: 'ACTIVO' });
  });

  it('con otra suscripción ACTIVA el tenant no se suspende', async () => {
    const { tenantId } = await tenantCon('dos-productos', '2026-09-01');
    await agregarSuscripcion(tenantId, 'GYM', '2026-12-31');

    await revisar().ejecutar('2026-10-10');

    expect(await filaTenant(tenantId)).toMatchObject({ estado: 'PRUEBA' });
  });

  it('dias_gracia de 3 en un tenant suspende a los 3 días', async () => {
    const { tenantId } = await tenantCon('gracia-corta', '2026-10-07');
    graciaPorTenant[tenantId] = 3;

    await revisar().ejecutar('2026-10-10');

    expect(await filaTenant(tenantId)).toMatchObject({ estado: 'SUSPENDIDO' });
  });

  it('un tenant que falla no impide procesar a otro y el efecto corre con el tenant de la suscripción', async () => {
    const roto = await tenantCon('tenant-roto', '2026-10-01');
    const sano = await tenantCon('tenant-sano', '2026-10-01');
    graciaPorTenant[roto.tenantId] = new Error('cfg caído');

    const resultado = await revisar().ejecutar('2026-10-10');

    expect(resultado.fallidos).toBe(1);
    expect(avisos).toContain('Vencimientos de un tenant fallaron');
    expect(await filaSuscripcion(roto.suscripcionId)).toMatchObject({ estado: 'PRUEBA' });
    expect(await filaTenant(sano.tenantId)).toMatchObject({ estado: 'SUSPENDIDO' });
    expect(tenantsVistos[sano.tenantId]).toBe(sano.tenantId);
    expect(tenantsVistos[roto.tenantId]).toBe(roto.tenantId);
  });
});
