import type { Suscripcion } from '@vitrina/plataforma/org';
import type { ParametroPort, RepositorioDefiniciones } from '@vitrina/plataforma/parametros';
import { ConfiguracionCuotaParametros } from '../src/identidad/configuracion-cuota.parametros.js';
import { PlanDelTenantOrg } from '../src/identidad/plan-del-tenant.org.js';

const INCLUIDAS_DEL_MANIFIESTO = { BASICO: 200, PRO: 500, EMPRESA: 2000 };

function suscripcion(plan: string, estado: string): Suscripcion {
  return { vigente: estado === 'PRUEBA' || estado === 'ACTIVA', datos: { plan, estado } } as unknown as Suscripcion;
}

function planCon(...suscripciones: Suscripcion[]): PlanDelTenantOrg {
  return new PlanDelTenantOrg({ listar: async () => suscripciones });
}

describe('PlanDelTenantOrg (spec 29)', () => {
  it('BASICO ACTIVA y EMPRESA en PRUEBA dan EMPRESA', async () => {
    await expect(planCon(suscripcion('BASICO', 'ACTIVA'), suscripcion('EMPRESA', 'PRUEBA')).planVigente()).resolves.toBe('EMPRESA');
  });

  it('una suscripción VENCIDA o CANCELADA no cuenta', async () => {
    await expect(planCon(suscripcion('EMPRESA', 'VENCIDA'), suscripcion('PRO', 'CANCELADA'), suscripcion('BASICO', 'ACTIVA')).planVigente()).resolves.toBe(
      'BASICO',
    );
  });

  it('sin suscripción vigente es BASICO', async () => {
    await expect(planCon().planVigente()).resolves.toBe('BASICO');
    await expect(planCon(suscripcion('PRO', 'VENCIDA')).planVigente()).resolves.toBe('BASICO');
  });
});

describe('ConfiguracionCuotaParametros (spec 29)', () => {
  type Valores = Record<string, { valor: unknown; origen: string }>;

  function configuracionCon(valores: Valores) {
    const avisos: { mensaje: string; datos: Record<string, unknown> }[] = [];
    const parametros = { valor: async (codigo: string) => valores[codigo] } as Pick<ParametroPort, 'valor'>;
    const definiciones = {
      transaccion: async (trabajo: (sesion: unknown) => Promise<unknown>) =>
        trabajo({ todasDe: async () => [{ codigo: 'plat.identidad.cuota_incluidas', valorDefecto: INCLUIDAS_DEL_MANIFIESTO }] }),
    } as unknown as RepositorioDefiniciones;
    const configuracion = new ConfiguracionCuotaParametros({
      parametros,
      definiciones,
      avisar: (mensaje, datos) => avisos.push({ mensaje, datos }),
    });
    return { configuracion, avisos };
  }

  it('sin valor propio usa el del manifiesto y no avisa', async () => {
    const { configuracion, avisos } = configuracionCon({
      'plat.identidad.cuota_incluidas': { valor: INCLUIDAS_DEL_MANIFIESTO, origen: 'DEFECTO' },
    });
    await expect(configuracion.incluidasPorPlan()).resolves.toEqual(INCLUIDAS_DEL_MANIFIESTO);
    expect(avisos).toEqual([]);
  });

  it('un valor de incluidas fijado por el tenant se ignora: vale el del manifiesto y se avisa en el log', async () => {
    const { configuracion, avisos } = configuracionCon({
      'plat.identidad.cuota_incluidas': { valor: { BASICO: 99999, PRO: 99999, EMPRESA: 99999 }, origen: 'TENANT' },
    });
    await expect(configuracion.incluidasPorPlan()).resolves.toEqual(INCLUIDAS_DEL_MANIFIESTO);
    expect(avisos).toEqual([expect.objectContaining({ datos: { codigo: 'plat.identidad.cuota_incluidas', origen: 'TENANT' } })]);
  });

  it('el umbral fijado en 90 por el tenant se respeta', async () => {
    const { configuracion } = configuracionCon({ 'plat.identidad.cuota_umbral_aviso': { valor: 90, origen: 'TENANT' } });
    await expect(configuracion.umbralAvisoPorcentaje()).resolves.toBe(90);
  });

  it.each([0, 101, -5])('un umbral de %s cae a 80 y se avisa', async (valor) => {
    const { configuracion, avisos } = configuracionCon({ 'plat.identidad.cuota_umbral_aviso': { valor, origen: 'TENANT' } });
    await expect(configuracion.umbralAvisoPorcentaje()).resolves.toBe(80);
    expect(avisos).toHaveLength(1);
  });
});
