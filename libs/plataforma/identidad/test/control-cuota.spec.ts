import { ControlCuota } from '../src/application/control-cuota.js';
import { RelojFalso, TENANT_A } from './support/dobles.js';
import {
  ConfiguracionCuotaFija,
  PlanFijo,
  PublicadorMemoria,
  RepositorioCuotasMemoria,
} from './support/cuotas.js';

const OCTUBRE = '2026-10';
const MEDIADOS_DE_OCTUBRE = new Date('2026-10-16T12:00:00-05:00');

function crearControl() {
  const repositorio = new RepositorioCuotasMemoria();
  const plan = new PlanFijo();
  const configuracion = new ConfiguracionCuotaFija();
  const publicador = new PublicadorMemoria();
  const reloj = new RelojFalso(MEDIADOS_DE_OCTUBRE);
  const control = new ControlCuota({ repositorio, planDelTenant: plan, configuracion, publicador, reloj });
  return { control, repositorio, plan, configuracion, publicador, reloj };
}

describe('ControlCuota.reservar', () => {
  it('TR-CA-120: la consulta 400 de 500 deja 400 consumidas y publica el umbral con 80 %', async () => {
    const { control, repositorio, publicador } = crearControl();
    repositorio.sembrar({ tenantId: TENANT_A, periodo: OCTUBRE, consumidas: 399 });

    expect(await control.reservar(TENANT_A)).toBe(true);

    expect(repositorio.obtener(TENANT_A, OCTUBRE)?.consumidas).toBe(400);
    expect(publicador.eventos).toEqual([
      expect.objectContaining({
        eventType: 'cuota.umbral_alcanzado',
        aggregateType: 'cuota_identidad',
        aggregateId: TENANT_A,
        payload: { tenant_id: TENANT_A, periodo: OCTUBRE, incluidas: 500, consumidas: 400, porcentaje: 80, umbral: 80 },
      }),
    ]);
    expect(repositorio.obtener(TENANT_A, OCTUBRE)?.avisadoUmbralEn).toEqual(MEDIADOS_DE_OCTUBRE);
  });

  it('el aviso de umbral no se repite en las consultas siguientes', async () => {
    const { control, repositorio, publicador } = crearControl();
    repositorio.sembrar({ tenantId: TENANT_A, periodo: OCTUBRE, consumidas: 399 });

    await control.reservar(TENANT_A);
    await control.reservar(TENANT_A);
    await control.reservar(TENANT_A);

    expect(publicador.tipos()).toEqual(['cuota.umbral_alcanzado']);
  });

  it('si otra reserva ya marcó el aviso, no se publica de nuevo', async () => {
    const { control, repositorio, publicador } = crearControl();
    repositorio.sembrar({ tenantId: TENANT_A, periodo: OCTUBRE, consumidas: 399 });
    repositorio.marcarAviso = async () => false;

    expect(await control.reservar(TENANT_A)).toBe(true);
    expect(publicador.eventos).toEqual([]);
  });

  it('la última consulta publica la agotada; la siguiente devuelve false sin publicar', async () => {
    const { control, repositorio, publicador } = crearControl();
    repositorio.sembrar({ tenantId: TENANT_A, periodo: OCTUBRE, consumidas: 499, avisadoUmbralEn: new Date() });

    expect(await control.reservar(TENANT_A)).toBe(true);
    expect(await control.reservar(TENANT_A)).toBe(false);

    expect(publicador.eventos).toEqual([
      expect.objectContaining({
        eventType: 'cuota.agotada',
        payload: { tenant_id: TENANT_A, periodo: OCTUBRE, incluidas: 500, consumidas: 500 },
      }),
    ]);
    expect(repositorio.obtener(TENANT_A, OCTUBRE)?.consumidas).toBe(500);
  });

  it('umbral 90 mueve el aviso a 450 de 500', async () => {
    const { control, repositorio, configuracion, publicador } = crearControl();
    configuracion.umbral = 90;
    repositorio.sembrar({ tenantId: TENANT_A, periodo: OCTUBRE, consumidas: 448 });

    await control.reservar(TENANT_A);
    expect(publicador.eventos).toEqual([]);
    await control.reservar(TENANT_A);
    expect(publicador.eventos).toEqual([expect.objectContaining({ payload: expect.objectContaining({ consumidas: 450, umbral: 90 }) })]);
  });

  it('sin fila del periodo la crea con las incluidas de su plan y reserva una', async () => {
    const { control, repositorio, plan } = crearControl();
    plan.plan = 'EMPRESA';

    expect(await control.reservar(TENANT_A)).toBe(true);

    expect(repositorio.obtener(TENANT_A, OCTUBRE)).toMatchObject({ plan: 'EMPRESA', incluidas: 2000, consumidas: 1 });
  });

  it('un plan con 0 incluidas crea la fila agotada y no reserva', async () => {
    const { control, repositorio, configuracion, publicador } = crearControl();
    configuracion.incluidas = { BASICO: 0, PRO: 0, EMPRESA: 0 };

    expect(await control.reservar(TENANT_A)).toBe(false);

    expect(repositorio.obtener(TENANT_A, OCTUBRE)).toMatchObject({ incluidas: 0, consumidas: 0 });
    expect(publicador.eventos).toEqual([]);
  });

  it('cambio de mes: a las 00:00 del 1 de noviembre en Lima reserva en 2026-11 y octubre no cambia', async () => {
    const { control, repositorio, reloj } = crearControl();
    repositorio.sembrar({ tenantId: TENANT_A, periodo: OCTUBRE, consumidas: 500 });
    reloj.actual = new Date('2026-11-01T00:00:00-05:00');

    expect(await control.reservar(TENANT_A)).toBe(true);

    expect(repositorio.obtener(TENANT_A, '2026-11')).toMatchObject({ consumidas: 1 });
    expect(repositorio.obtener(TENANT_A, OCTUBRE)).toMatchObject({ consumidas: 500 });
  });
});

describe('ControlCuota.liberar y abrirPeriodo', () => {
  it('liberar devuelve la consulta reservada y no baja de 0', async () => {
    const { control, repositorio } = crearControl();
    repositorio.sembrar({ tenantId: TENANT_A, periodo: OCTUBRE, consumidas: 10 });

    await control.reservar(TENANT_A);
    await control.liberar(TENANT_A);
    expect(repositorio.obtener(TENANT_A, OCTUBRE)?.consumidas).toBe(10);

    repositorio.sembrar({ tenantId: TENANT_A, periodo: OCTUBRE, consumidas: 0 });
    await control.liberar(TENANT_A);
    expect(repositorio.obtener(TENANT_A, OCTUBRE)?.consumidas).toBe(0);
  });

  it('abrirPeriodo es idempotente: la segunda vez no cambia nada', async () => {
    const { control, repositorio, plan } = crearControl();

    expect(await control.abrirPeriodo(TENANT_A, '2026-12')).toBe(true);
    repositorio.sembrar({ ...(await repositorio.buscar(TENANT_A, '2026-12')), tenantId: TENANT_A, periodo: '2026-12', consumidas: 7 });
    plan.plan = 'BASICO';
    expect(await control.abrirPeriodo(TENANT_A, '2026-12')).toBe(false);

    expect(repositorio.obtener(TENANT_A, '2026-12')).toMatchObject({ plan: 'PRO', incluidas: 500, consumidas: 7 });
  });
});
