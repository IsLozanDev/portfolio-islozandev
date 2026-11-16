import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { ForbiddenError } from '@vitrina/plataforma/kernel';
import { PermisoGuard } from '@vitrina/plataforma/seguridad';
import { AjustarCuota } from '../src/application/ajustar-cuota.js';
import { ConsultarCuotaActual } from '../src/application/consultar-cuota-actual.js';
import { ControlCuota } from '../src/application/control-cuota.js';
import { DetalleDeCuota } from '../src/application/detalle-cuota.js';
import { ListarCuotas } from '../src/application/listar-cuotas.js';
import type { DetalleCuota, LecturaCuotasConsola } from '../src/application/ports/cuotas.js';
import { CuotasController } from '../src/interface/cuotas.controller.js';
import { ConfiguracionCuotaFija, PlanFijo, PublicadorMemoria, RepositorioCuotasMemoria } from './support/cuotas.js';
import { ContextoFijo, RelojFalso, TENANT_A, TENANT_B, USUARIO, UnidadDeTrabajoDirecta } from './support/dobles.js';

const SUCURSAL = '0193f3a0-0000-7000-8000-000000000102';
const MFA_MAX_EDAD_SEG = 900;
const CUOTA = 'plat.identidad.cuota';
const GESTIONAR = 'plat.identidad.cuota_gestionar';
const NOVIEMBRE = '2026-11';
const SENSIBLES = new Set([GESTIONAR, 'plat.identidad.proveedor']);
const ahoraSeg = () => Math.floor(Date.now() / 1000);

class OperadorRequeridoPrueba extends ForbiddenError {
  override readonly code = 'OPERADOR_REQUERIDO';
}

const DETALLE: DetalleCuota = {
  tenantId: TENANT_B,
  tenantNombre: 'Gym Beta',
  periodo: NOVIEMBRE,
  plan: 'PRO',
  incluidas: 500,
  consumidas: 400,
  avisadoUmbralEn: new Date('2026-11-10T15:00:00Z'),
  avisadoAgotadaEn: null,
  version: 4,
  creadaEn: new Date('2026-11-01T05:05:00Z'),
  consultasPorResultado: { CACHE: 30, PROVEEDOR: 400, NO_ENCONTRADO: 2, INVALIDO: 1, CUOTA_AGOTADA: 0, PROVEEDOR_NO_DISPONIBLE: 0 },
};

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/identidad: cuota propia y consola de cuotas (spec 29)', () => {
  let app: INestApplication;
  let permisosDelActor: string[];
  let conMfa: boolean;
  let esOperador: boolean;
  let repositorio: RepositorioCuotasMemoria;
  const http = () => request(app.getHttpServer());
  const get = (ruta: string) => http().get(ruta).set('X-Sucursal-Id', SUCURSAL);
  const patch = (ruta: string, cuerpo: object) => http().patch(ruta).set('X-Sucursal-Id', SUCURSAL).send(cuerpo);

  /** Hace lo que deja AutenticacionGuard: el principal del token, con o sin MFA reciente. */
  class PrincipalDePrueba implements CanActivate {
    canActivate(contexto: ExecutionContext): boolean {
      const solicitud = contexto.switchToHttp().getRequest();
      const amr = conMfa ? [{ method: 'totp', timestamp: ahoraSeg() - 60 }] : [];
      solicitud.principal = { usuarioId: USUARIO, tenantId: TENANT_A, tipo: 'INTERNO', aal: conMfa ? 'aal2' : 'aal1', sesionId: 'sesion', amr };
      return true;
    }
  }

  beforeAll(async () => {
    repositorio = new RepositorioCuotasMemoria();
    const contexto = new ContextoFijo({ tenantId: TENANT_A, actorId: USUARIO });
    const unidadDeTrabajo = new UnidadDeTrabajoDirecta();
    const reloj = new RelojFalso(new Date('2026-11-16T12:00:00-05:00'));
    const planDelTenant = new PlanFijo('PRO');
    const configuracion = new ConfiguracionCuotaFija();
    const publicador = new PublicadorMemoria();
    const verificador = {
      exigir: async () => {
        if (!esOperador) throw new OperadorRequeridoPrueba('Solo el tenant operador');
      },
    };
    const lectura: LecturaCuotasConsola = {
      delPeriodo: async () => ({ filas: [DETALLE], total: 1 }),
      detalle: async (tenantId, periodo) => (tenantId === TENANT_B && periodo === NOVIEMBRE ? DETALLE : null),
    };
    const control = new ControlCuota({ repositorio, planDelTenant, configuracion, publicador, reloj });

    const modulo = await Test.createTestingModule({
      controllers: [CuotasController],
      providers: [
        { provide: ConsultarCuotaActual, useValue: new ConsultarCuotaActual({ unidadDeTrabajo, contexto, reloj, repositorio, planDelTenant, configuracion }) },
        { provide: ListarCuotas, useValue: new ListarCuotas({ unidadDeTrabajo, reloj, verificador, lectura }) },
        { provide: DetalleDeCuota, useValue: new DetalleDeCuota({ unidadDeTrabajo, verificador, lectura }) },
        { provide: AjustarCuota, useValue: new AjustarCuota({ unidadDeTrabajo, contexto, reloj, verificador, repositorio, control, publicador }) },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async (permiso: string) => SENSIBLES.has(permiso) } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadGuard: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contextoGuard: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT_A }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(new PrincipalDePrueba(), new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadGuard, contextoGuard, MFA_MAX_EDAD_SEG));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  beforeEach(() => {
    permisosDelActor = [CUOTA, GESTIONAR];
    conMfa = true;
    esOperador = true;
    repositorio.cuotas.clear();
  });

  afterAll(() => app?.close());

  describe('GET /cuota-actual', () => {
    it('devuelve la cuota del tenant del token y no crea fila si no existe', async () => {
      const respuesta = await get('/v1/identidad/cuota-actual');
      expect([respuesta.status, respuesta.body]).toEqual([
        200,
        { periodo: NOVIEMBRE, plan: 'PRO', incluidas: 500, consumidas: 0, porcentaje: 0, umbral_aviso: 80 },
      ]);
      expect(repositorio.cuotas.size).toBe(0);
    });

    it('sin plat.identidad.cuota da 403 SIN_PERMISO', async () => {
      permisosDelActor = [GESTIONAR];
      const respuesta = await get('/v1/identidad/cuota-actual');
      expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'SIN_PERMISO']);
    });
  });

  describe('GET /cuotas', () => {
    it('lista las cuotas del periodo actual con su porcentaje', async () => {
      const respuesta = await get('/v1/identidad/cuotas');
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        periodo: NOVIEMBRE,
        items: [
          {
            tenant_id: TENANT_B,
            tenant_nombre: 'Gym Beta',
            plan: 'PRO',
            incluidas: 500,
            consumidas: 400,
            porcentaje: 80,
            avisado_umbral_en: '2026-11-10T15:00:00.000Z',
            avisado_agotada_en: null,
            version: 4,
          },
        ],
        total: 1,
        pagina: 1,
        tamano: 25,
      });
    });

    it('desde un tenant cliente da 403 OPERADOR_REQUERIDO aunque tenga el permiso', async () => {
      esOperador = false;
      const respuesta = await get('/v1/identidad/cuotas');
      expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'OPERADOR_REQUERIDO']);
    });

    it('sin plat.identidad.cuota_gestionar da 403 SIN_PERMISO', async () => {
      permisosDelActor = [CUOTA];
      const respuesta = await get('/v1/identidad/cuotas');
      expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'SIN_PERMISO']);
    });

    it('un periodo mal formado da 422 PERIODO_INVALIDO', async () => {
      const respuesta = await get('/v1/identidad/cuotas?periodo=2026-13');
      expect([respuesta.status, respuesta.body.codigo]).toEqual([422, 'PERIODO_INVALIDO']);
    });
  });

  describe('GET /cuotas/{tenantId}/{periodo}', () => {
    it('devuelve la fila y las consultas por resultado', async () => {
      const respuesta = await get(`/v1/identidad/cuotas/${TENANT_B}/${NOVIEMBRE}`);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({ periodo: NOVIEMBRE, creada_en: '2026-11-01T05:05:00.000Z', consultas_por_resultado: DETALLE.consultasPorResultado });
    });

    it('sin cuota en el periodo da 404 CUOTA_NO_ENCONTRADA', async () => {
      const respuesta = await get(`/v1/identidad/cuotas/${TENANT_B}/2026-09`);
      expect([respuesta.status, respuesta.body.codigo]).toEqual([404, 'CUOTA_NO_ENCONTRADA']);
    });

    it('un tenant que no es uuid da 400 SOLICITUD_INVALIDA', async () => {
      const respuesta = await get(`/v1/identidad/cuotas/no-es-uuid/${NOVIEMBRE}`);
      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['tenantId'] }]);
    });
  });

  describe('PATCH /cuotas/{tenantId}/{periodo}', () => {
    const ruta = `/v1/identidad/cuotas/${TENANT_B}/${NOVIEMBRE}`;

    it('válido: 200 con la cuota ajustada', async () => {
      repositorio.sembrar({ tenantId: TENANT_B, periodo: NOVIEMBRE, incluidas: 500, consumidas: 450, version: 4 });
      const respuesta = await patch(ruta, { incluidas: 800, version: 4 });
      expect([respuesta.status, respuesta.body]).toEqual([
        200,
        {
          tenant_id: TENANT_B,
          periodo: NOVIEMBRE,
          plan: 'PRO',
          incluidas: 800,
          consumidas: 450,
          porcentaje: 56,
          avisado_umbral_en: null,
          avisado_agotada_en: null,
          version: 5,
        },
      ]);
    });

    it('por debajo de las consumidas da 422 INCLUIDAS_MENOR_QUE_CONSUMIDAS', async () => {
      repositorio.sembrar({ tenantId: TENANT_B, periodo: NOVIEMBRE, consumidas: 450 });
      const respuesta = await patch(ruta, { incluidas: 100, version: 1 });
      expect([respuesta.status, respuesta.body.codigo]).toEqual([422, 'INCLUIDAS_MENOR_QUE_CONSUMIDAS']);
    });

    it('a un periodo pasado da 422 PERIODO_CERRADO', async () => {
      const respuesta = await patch(`/v1/identidad/cuotas/${TENANT_B}/2026-10`, { incluidas: 800, version: 1 });
      expect([respuesta.status, respuesta.body.codigo]).toEqual([422, 'PERIODO_CERRADO']);
    });

    it('con version vieja da 409 VERSION_OBSOLETA', async () => {
      repositorio.sembrar({ tenantId: TENANT_B, periodo: NOVIEMBRE, version: 4 });
      const respuesta = await patch(ruta, { incluidas: 800, version: 3 });
      expect([respuesta.status, respuesta.body.codigo]).toEqual([409, 'VERSION_OBSOLETA']);
    });

    it('desde un tenant cliente da 403 OPERADOR_REQUERIDO', async () => {
      esOperador = false;
      const respuesta = await patch(ruta, { incluidas: 800, version: 1 });
      expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'OPERADOR_REQUERIDO']);
    });

    it('sin aal2 el permiso sensible da 401 MFA_REQUERIDA y no llega al caso de uso', async () => {
      conMfa = false;
      repositorio.sembrar({ tenantId: TENANT_B, periodo: NOVIEMBRE, version: 4 });
      const respuesta = await patch(ruta, { incluidas: 800, version: 4 });
      expect([respuesta.status, respuesta.body.codigo]).toEqual([401, 'MFA_REQUERIDA']);
      expect(repositorio.obtener(TENANT_B, NOVIEMBRE)?.incluidas).toBe(500);
    });

    it.each([
      ['incluidas negativas', { incluidas: -1, version: 1 }, ['incluidas']],
      ['sin versión', { incluidas: 800 }, ['version']],
      ['incluidas con decimales', { incluidas: 1.5, version: 1 }, ['incluidas']],
    ])('%s da 400', async (_caso, cuerpo, errores) => {
      const respuesta = await patch(ruta, cuerpo);
      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores }]);
    });
  });

  it('las cuatro operaciones están en OpenAPI bajo /v1', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    expect(Object.keys(documento.paths).sort()).toEqual([
      '/v1/identidad/cuota-actual',
      '/v1/identidad/cuotas',
      '/v1/identidad/cuotas/{tenantId}/{periodo}',
    ]);
    const operaciones = documento.paths['/v1/identidad/cuotas/{tenantId}/{periodo}'];
    expect(Object.keys(operaciones.patch?.responses ?? {}).sort()).toEqual(['200', '400', '401', '403', '409', '422']);
    expect(Object.keys(operaciones.get?.responses ?? {}).sort()).toEqual(['200', '400', '401', '403', '404', '422']);
  });
});
