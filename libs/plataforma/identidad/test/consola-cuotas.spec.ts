import { ForbiddenError } from '@vitrina/plataforma/kernel';
import { AjustarCuota } from '../src/application/ajustar-cuota.js';
import { ConsultarCuotaActual } from '../src/application/consultar-cuota-actual.js';
import { ControlCuota } from '../src/application/control-cuota.js';
import { DetalleDeCuota } from '../src/application/detalle-cuota.js';
import { ListarCuotas } from '../src/application/listar-cuotas.js';
import type { FiltroCuotasConsola, LecturaCuotasConsola } from '../src/application/ports/cuotas.js';
import {
  CuotaNoEncontradaError,
  IncluidasMenorQueConsumidasError,
  PeriodoCerradoError,
  VersionObsoletaError,
} from '../src/domain/errores.js';
import { ConfiguracionCuotaFija, PlanFijo, PublicadorMemoria, RepositorioCuotasMemoria } from './support/cuotas.js';
import { ContextoFijo, RelojFalso, TENANT_A, TENANT_B, USUARIO, UnidadDeTrabajoDirecta } from './support/dobles.js';

const NOVIEMBRE = '2026-11';
const MEDIADOS_DE_NOVIEMBRE = new Date('2026-11-16T12:00:00-05:00');
const OPERADOR = '0a000000-0000-4000-8000-0000000000aa';

class OperadorRequeridoPrueba extends ForbiddenError {
  override readonly code = 'OPERADOR_REQUERIDO';
}

function crearEntorno() {
  const repositorio = new RepositorioCuotasMemoria();
  const contexto = new ContextoFijo({ tenantId: OPERADOR, actorId: USUARIO });
  const reloj = new RelojFalso(MEDIADOS_DE_NOVIEMBRE);
  const unidadDeTrabajo = new UnidadDeTrabajoDirecta();
  const plan = new PlanFijo('PRO');
  const configuracion = new ConfiguracionCuotaFija();
  const publicador = new PublicadorMemoria();
  const tenantsAlPublicar: string[] = [];
  publicador.publish = async (evento) => {
    tenantsAlPublicar.push(contexto.current().tenantId);
    publicador.eventos.push(evento);
  };
  const verificador = { esOperador: true, exigir: async () => undefined };
  verificador.exigir = async () => {
    if (!verificador.esOperador) throw new OperadorRequeridoPrueba('no es operador');
  };
  const filtros: FiltroCuotasConsola[] = [];
  const lectura: LecturaCuotasConsola = {
    delPeriodo: async (filtro) => (filtros.push(filtro), { filas: [], total: 0 }),
    detalle: async () => null,
  };
  const control = new ControlCuota({ repositorio, planDelTenant: plan, configuracion, publicador, reloj });
  const dependencias = { unidadDeTrabajo, contexto, reloj, repositorio, planDelTenant: plan, configuracion, verificador, lectura, control, publicador };
  return { ...dependencias, filtros, tenantsAlPublicar };
}

describe('ConsultarCuotaActual', () => {
  it('devuelve la del tenant del contexto con porcentaje y umbral', async () => {
    const entorno = crearEntorno();
    entorno.contexto.alcance = { tenantId: TENANT_A };
    entorno.repositorio.sembrar({ tenantId: TENANT_A, periodo: NOVIEMBRE, incluidas: 500, consumidas: 120 });

    await expect(new ConsultarCuotaActual(entorno).ejecutar()).resolves.toEqual({
      periodo: NOVIEMBRE,
      plan: 'PRO',
      incluidas: 500,
      consumidas: 120,
      porcentaje: 24,
      umbralAviso: 80,
    });
  });

  it('sin fila responde la que tendría con su plan y no la crea', async () => {
    const entorno = crearEntorno();
    entorno.contexto.alcance = { tenantId: TENANT_A };

    await expect(new ConsultarCuotaActual(entorno).ejecutar()).resolves.toMatchObject({ plan: 'PRO', incluidas: 500, consumidas: 0, porcentaje: 0 });
    expect(entorno.repositorio.cuotas.size).toBe(0);
  });
});

describe('ListarCuotas y DetalleDeCuota', () => {
  it('sin periodo usa el mes actual de Lima y pagina desde 1', async () => {
    const entorno = crearEntorno();

    await expect(new ListarCuotas(entorno).ejecutar({ pagina: 3, tamano: 25, q: 'rosa' })).resolves.toEqual({ filas: [], total: 0, periodo: NOVIEMBRE });
    expect(entorno.filtros).toEqual([{ periodo: NOVIEMBRE, q: 'rosa', limite: 25, desplazamiento: 50 }]);
  });

  it('desde un tenant cliente es OPERADOR_REQUERIDO y no lee', async () => {
    const entorno = crearEntorno();
    entorno.verificador.esOperador = false;

    await expect(new ListarCuotas(entorno).ejecutar({ pagina: 1, tamano: 25 })).rejects.toThrow(OperadorRequeridoPrueba);
    await expect(new DetalleDeCuota(entorno).ejecutar(TENANT_A, NOVIEMBRE)).rejects.toThrow(OperadorRequeridoPrueba);
    expect(entorno.filtros).toEqual([]);
  });

  it('un periodo sin cuota es CUOTA_NO_ENCONTRADA', async () => {
    await expect(new DetalleDeCuota(crearEntorno()).ejecutar(TENANT_A, '2026-09')).rejects.toThrow(CuotaNoEncontradaError);
  });
});

describe('AjustarCuota', () => {
  const ajuste = { tenantId: TENANT_B, periodo: NOVIEMBRE, incluidas: 800, version: 1, actorId: USUARIO };

  it('cambia las incluidas, sube la versión y publica cuota.ajustada en el contexto del tenant de la cuota', async () => {
    const entorno = crearEntorno();
    entorno.repositorio.sembrar({ tenantId: TENANT_B, periodo: NOVIEMBRE, incluidas: 500, consumidas: 450 });

    await expect(new AjustarCuota(entorno).ejecutar(ajuste)).resolves.toMatchObject({ incluidas: 800, consumidas: 450, version: 2 });

    expect(entorno.repositorio.obtener(TENANT_B, NOVIEMBRE)).toMatchObject({ incluidas: 800, version: 2 });
    expect(entorno.publicador.eventos).toEqual([
      expect.objectContaining({
        eventType: 'cuota.ajustada',
        aggregateId: TENANT_B,
        aggregateVersion: 2,
        payload: { tenant_id: TENANT_B, periodo: NOVIEMBRE, incluidas_anteriores: 500, incluidas: 800, actor_id: USUARIO },
      }),
    ]);
    expect(entorno.tenantsAlPublicar).toEqual([TENANT_B]);
    expect(entorno.contexto.current().tenantId).toBe(OPERADOR);
  });

  it('por debajo de las consumidas es INCLUIDAS_MENOR_QUE_CONSUMIDAS y no publica', async () => {
    const entorno = crearEntorno();
    entorno.repositorio.sembrar({ tenantId: TENANT_B, periodo: NOVIEMBRE, consumidas: 450 });

    await expect(new AjustarCuota(entorno).ejecutar({ ...ajuste, incluidas: 449 })).rejects.toThrow(IncluidasMenorQueConsumidasError);
    expect(entorno.publicador.eventos).toEqual([]);
  });

  it('un periodo pasado es PERIODO_CERRADO, exista o no la cuota', async () => {
    const entorno = crearEntorno();
    entorno.repositorio.sembrar({ tenantId: TENANT_B, periodo: '2026-10' });

    await expect(new AjustarCuota(entorno).ejecutar({ ...ajuste, periodo: '2026-10' })).rejects.toThrow(PeriodoCerradoError);
    await expect(new AjustarCuota(entorno).ejecutar({ ...ajuste, periodo: '2026-09' })).rejects.toThrow(PeriodoCerradoError);
    expect(entorno.repositorio.obtener(TENANT_B, '2026-09')).toBeUndefined();
  });

  it('con versión vieja es VERSION_OBSOLETA', async () => {
    const entorno = crearEntorno();
    entorno.repositorio.sembrar({ tenantId: TENANT_B, periodo: NOVIEMBRE, version: 3 });

    await expect(new AjustarCuota(entorno).ejecutar({ ...ajuste, version: 2 })).rejects.toThrow(VersionObsoletaError);
  });

  it('un mes futuro sin cuota se abre con su plan y queda con las incluidas pedidas', async () => {
    const entorno = crearEntorno();

    await expect(new AjustarCuota(entorno).ejecutar({ ...ajuste, periodo: '2026-12', incluidas: 900, version: 99 })).resolves.toMatchObject({
      plan: 'PRO',
      incluidas: 900,
      consumidas: 0,
    });
    expect(entorno.publicador.eventos.at(-1)).toMatchObject({ payload: { incluidas_anteriores: 500, incluidas: 900 } });
  });

  it('desde un tenant cliente es OPERADOR_REQUERIDO y no toca la cuota', async () => {
    const entorno = crearEntorno();
    entorno.verificador.esOperador = false;
    entorno.repositorio.sembrar({ tenantId: TENANT_B, periodo: NOVIEMBRE });

    await expect(new AjustarCuota(entorno).ejecutar(ajuste)).rejects.toThrow(OperadorRequeridoPrueba);
    expect(entorno.repositorio.obtener(TENANT_B, NOVIEMBRE)?.incluidas).toBe(500);
  });
});
