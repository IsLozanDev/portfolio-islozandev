import { AbrirPeriodoCuotas } from '../src/application/abrir-periodo-cuotas.js';
import { ControlCuota } from '../src/application/control-cuota.js';
import { ConfiguracionCuotaFija, PublicadorMemoria, RepositorioCuotasMemoria } from './support/cuotas.js';
import { ContextoFijo, RelojFalso, TENANT_A, TENANT_B, UnidadDeTrabajoDirecta } from './support/dobles.js';

const DICIEMBRE = '2026-12';
const TENANT_QUE_FALLA = 'ffffffff-0000-4000-8000-00000000000f';

async function* enLista(...tenants: string[]): AsyncIterable<string> {
  for (const tenant of tenants) yield tenant;
}

function crearApertura(tenants: string[]) {
  const repositorio = new RepositorioCuotasMemoria();
  const contexto = new ContextoFijo({ tenantId: 'sin-tenant' });
  const tenantsVistosEnContexto: string[] = [];
  const control = new ControlCuota({
    repositorio,
    planDelTenant: {
      planVigente: async () => {
        const { tenantId } = contexto.current();
        tenantsVistosEnContexto.push(tenantId);
        if (tenantId === TENANT_QUE_FALLA) throw new Error('org no responde');
        return tenantId === TENANT_B ? 'EMPRESA' : 'BASICO';
      },
    },
    configuracion: new ConfiguracionCuotaFija(),
    publicador: new PublicadorMemoria(),
    reloj: new RelojFalso(),
  });
  const avisos: Record<string, unknown>[] = [];
  const unidadDeTrabajo = new UnidadDeTrabajoDirecta();
  const apertura = new AbrirPeriodoCuotas({
    tenants: { listar: () => enLista(...tenants) },
    contexto,
    unidadDeTrabajo,
    control,
    informar: () => undefined,
    avisar: (_mensaje, datos) => avisos.push(datos),
  });
  return { apertura, repositorio, tenantsVistosEnContexto, avisos, unidadDeTrabajo };
}

describe('AbrirPeriodoCuotas', () => {
  it('abre la cuota de cada tenant con las incluidas de su plan, en su contexto y su transacción', async () => {
    const { apertura, repositorio, tenantsVistosEnContexto, unidadDeTrabajo } = crearApertura([TENANT_A, TENANT_B]);

    await expect(apertura.ejecutar(DICIEMBRE)).resolves.toEqual({ periodo: DICIEMBRE, creadas: 2, existentes: 0, fallidas: 0 });

    expect(repositorio.obtener(TENANT_A, DICIEMBRE)).toMatchObject({ plan: 'BASICO', incluidas: 200, consumidas: 0 });
    expect(repositorio.obtener(TENANT_B, DICIEMBRE)).toMatchObject({ plan: 'EMPRESA', incluidas: 2000, consumidas: 0 });
    expect(tenantsVistosEnContexto).toEqual([TENANT_A, TENANT_B]);
    expect(unidadDeTrabajo.transacciones).toBe(2);
  });

  it('correrla dos veces no duplica ni cambia consumidas', async () => {
    const { apertura, repositorio } = crearApertura([TENANT_A]);
    await apertura.ejecutar(DICIEMBRE);
    repositorio.sembrar({ ...repositorio.obtener(TENANT_A, DICIEMBRE), tenantId: TENANT_A, periodo: DICIEMBRE, consumidas: 37 });

    await expect(apertura.ejecutar(DICIEMBRE)).resolves.toEqual({ periodo: DICIEMBRE, creadas: 0, existentes: 1, fallidas: 0 });

    expect(repositorio.cuotas.size).toBe(1);
    expect(repositorio.obtener(TENANT_A, DICIEMBRE)?.consumidas).toBe(37);
  });

  it('un tenant que falla queda en el log y se sigue con el siguiente', async () => {
    const { apertura, repositorio, avisos } = crearApertura([TENANT_QUE_FALLA, TENANT_A]);

    await expect(apertura.ejecutar(DICIEMBRE)).resolves.toEqual({ periodo: DICIEMBRE, creadas: 1, existentes: 0, fallidas: 1 });

    expect(repositorio.obtener(TENANT_A, DICIEMBRE)).toBeDefined();
    expect(avisos).toEqual([{ tenant_id: TENANT_QUE_FALLA, periodo: DICIEMBRE, error: 'Error' }]);
  });
});
