import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { NotFoundError } from '@vitrina/plataforma/kernel';
import { ActorSinAlcanceError, PERMISO, PermisoGuard } from '@vitrina/plataforma/seguridad';
import { CambiarEstadoSerie, type CambiarEstadoSerieComando } from '../src/application/cambiar-estado-serie.js';
import { CrearSerie, type CrearSerieComando } from '../src/application/crear-serie.js';
import { ConsultarSerie, ListarSeries } from '../src/application/lecturas-series.js';
import { AmbitoSerieInvalidoError, SerieDuplicadaError, SerieInvalidaError, SerieNoEncontradaError } from '../src/domain/errores.js';
import { SeriesController } from '../src/interface/series.controller.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const EMPRESA = '0193f3a0-0000-7000-8000-000000000011';
const CAYMA = '0193f3a0-0000-7000-8000-000000000102';
const SERIE_ID = '0193f3a0-0000-7000-8000-00000000b001';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const MODIFICADO_EN = new Date('2026-10-24T15:00:00.000Z');
const MFA_MAX_EDAD_SEG = 900;
const STEP_UP = `Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=${MFA_MAX_EDAD_SEG}`;
const MILISEGUNDOS_POR_SEGUNDO = 1000;

// El catálogo de prueba lee la sensibilidad del manifiesto PLAT real: el 401 depende de lo declarado.
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

const b002 = {
  id: SERIE_ID,
  empresaId: EMPRESA,
  sucursalId: CAYMA,
  unidadId: null,
  tipo: 'BOLETA' as const,
  serie: 'B002',
  digitos: 8,
  reinicio: 'NUNCA' as const,
  ultimoNumero: 124,
  periodo: null,
  activa: true,
  siguienteNumero: 125,
  siguienteFormateado: 'B002-00000125',
};
const b002Detalle = {
  ...b002,
  empresaNombre: 'Seq Arequipa SAC',
  sucursalNombre: 'Cayma',
  unidadNombre: null,
  creadoPor: ANA,
  creadoEn: MODIFICADO_EN,
  modificadoPor: ANA,
  modificadoEn: MODIFICADO_EN,
};
const b002Respuesta = {
  id: SERIE_ID,
  empresa_id: EMPRESA,
  sucursal_id: CAYMA,
  unidad_id: null,
  tipo: 'BOLETA',
  serie: 'B002',
  digitos: 8,
  reinicio: 'NUNCA',
  ultimo_numero: 124,
  periodo: null,
  activa: true,
  siguiente_formateado: 'B002-00000125',
};

/** Hace lo que deja AutenticacionGuard: el principal del token. `x-prueba-aal` simula un token sin MFA. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    const aal = solicitud.headers['x-prueba-aal'] ?? 'aal2';
    const ahoraSeg = Math.floor(Date.now() / MILISEGUNDOS_POR_SEGUNDO);
    solicitud.principal = { usuarioId: ANA, tenantId: TENANT, tipo: 'INTERNO', aal, sesionId: 'sesion', amr: aal === 'aal2' ? [{ method: 'totp', timestamp: ahoraSeg }] : [] };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/seq/series (TR-RF-035)', () => {
  let app: INestApplication;
  let fallo: Error | null;
  let permisosDelActor: string[];
  const comandos: { crear: CrearSerieComando[]; estado: CambiarEstadoSerieComando[]; consultados: string[] } = { crear: [], estado: [], consultados: [] };
  const http = () => request(app.getHttpServer());
  const conSucursal = <T extends { set(campo: string, valor: string): T }>(solicitud: T) => solicitud.set('X-Sucursal-Id', CAYMA);
  const lanzarSiFalla = () => {
    if (fallo) throw fallo;
  };

  beforeAll(async () => {
    const manifiesto: { permisos: { codigo: string; sensible: boolean }[] } = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
    const sensibles = new Set(manifiesto.permisos.filter((permiso) => permiso.sensible).map((permiso) => permiso.codigo));
    const modulo = await Test.createTestingModule({
      controllers: [SeriesController],
      providers: [
        { provide: ListarSeries, useValue: { ejecutar: async () => [b002] } },
        {
          provide: ConsultarSerie,
          useValue: {
            ejecutar: async (id: string) => {
              comandos.consultados.push(id);
              if (id !== SERIE_ID) throw new SerieNoEncontradaError();
              return b002Detalle;
            },
          },
        },
        {
          provide: CrearSerie,
          useValue: {
            ejecutar: async (comando: CrearSerieComando) => {
              comandos.crear.push(comando);
              lanzarSiFalla();
              return { id: SERIE_ID };
            },
          },
        },
        {
          provide: CambiarEstadoSerie,
          useValue: {
            ejecutar: async (comando: CambiarEstadoSerieComando) => {
              comandos.estado.push(comando);
              lanzarSiFalla();
              return { id: comando.serieId, activa: comando.activa, modificadoEn: MODIFICADO_EN, cambiado: true };
            },
          },
        },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async (codigo: string) => sensibles.has(codigo) } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(new PrincipalDePrueba(), new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  beforeEach(() => {
    fallo = null;
    permisosDelActor = ['plat.serie.gestionar'];
    comandos.crear.length = 0;
    comandos.estado.length = 0;
    comandos.consultados.length = 0;
  });

  afterAll(() => app?.close());

  const crearB002 = (cuerpo: Record<string, unknown> = {}) =>
    conSucursal(http().post('/v1/seq/series')).send({ empresa_id: EMPRESA, sucursal_id: CAYMA, tipo: 'BOLETA', serie: 'B002', reinicio: 'NUNCA', ultimo_numero: 0, ...cuerpo });

  it('GET lista en snake_case con la vista previa del siguiente número', async () => {
    const respuesta = await conSucursal(http().get(`/v1/seq/series?empresa_id=${EMPRESA}&tipo=BOLETA&activa=true`));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual([b002Respuesta]);
  });

  it('GET con un filtro inválido da 400 SOLICITUD_INVALIDA', async () => {
    const respuesta = await conSucursal(http().get('/v1/seq/series?tipo=RECIBO&activa=si'));
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores: ['tipo', 'activa'] });
  });

  it('GET por id devuelve el detalle con nombres, actor y fechas', async () => {
    const respuesta = await conSucursal(http().get(`/v1/seq/series/${SERIE_ID}`));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      ...b002Respuesta,
      empresa_nombre: 'Seq Arequipa SAC',
      sucursal_nombre: 'Cayma',
      unidad_nombre: null,
      creado_por: ANA,
      creado_en: MODIFICADO_EN.toISOString(),
      modificado_por: ANA,
      modificado_en: MODIFICADO_EN.toISOString(),
    });
  });

  it('GET de una serie que no se ve da 404 SERIE_NO_ENCONTRADA', async () => {
    const respuesta = await conSucursal(http().get('/v1/seq/series/0193f3a0-0000-7000-8000-00000000f001'));
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({ codigo: 'SERIE_NO_ENCONTRADA', mensaje: 'La serie no existe' });
  });

  it('un id que no es UUID da 404 NO_ENCONTRADO sin llegar al caso de uso', async () => {
    const consulta = await conSucursal(http().get('/v1/seq/series/no-es-uuid'));
    const estado = await conSucursal(http().put('/v1/seq/series/no-es-uuid/estado')).send({ activa: false });
    expect([consulta.status, consulta.body.codigo, estado.status, estado.body.codigo]).toEqual([404, 'NO_ENCONTRADO', 404, 'NO_ENCONTRADO']);
    expect(comandos.consultados).toEqual([]);
    expect(comandos.estado).toEqual([]);
  });

  it('POST crea con el actor del token y responde 201 con la serie releída', async () => {
    const respuesta = await crearB002();
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject(b002Respuesta);
    expect(comandos.crear).toEqual([
      { empresaId: EMPRESA, sucursalId: CAYMA, unidadId: undefined, tipo: 'BOLETA', codigo: 'B002', digitos: undefined, reinicio: 'NUNCA', ultimoNumero: 0, actorId: ANA },
    ]);
    expect(comandos.consultados).toEqual([SERIE_ID]);
  });

  it.each([
    [{ empresa_id: 'no-es-uuid' }, ['empresa_id']],
    [{ tipo: 'RECIBO' }, ['tipo']],
    [{ reinicio: 'SEMANAL' }, ['reinicio']],
    [{ ultimo_numero: '0' }, ['ultimo_numero']],
    [{ digitos: 2.5 }, ['digitos']],
  ])('POST con %j da 400 SOLICITUD_INVALIDA en %j', async (cambio, errores) => {
    const respuesta = await crearB002(cambio);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores });
    expect(comandos.crear).toEqual([]);
  });

  it.each([
    [new SerieInvalidaError('Las series de factura deben iniciar con F y tener 4 caracteres'), 400, 'SERIE_INVALIDA', 'Las series de factura deben iniciar con F y tener 4 caracteres'],
    [new AmbitoSerieInvalidoError('La unidad no pertenece a la sucursal'), 400, 'AMBITO_INVALIDO', 'La unidad no pertenece a la sucursal'],
    [new ActorSinAlcanceError(), 403, 'ACTOR_SIN_ALCANCE', undefined],
    [new NotFoundError('La sucursal no existe'), 404, 'NO_ENCONTRADO', 'La sucursal no existe'],
    [new SerieDuplicadaError('BOLETA', 'B002'), 409, 'SERIE_DUPLICADA', 'Ya existe la serie B002 de BOLETA en la empresa'],
  ])('POST traduce %s a %i %s', async (error, estado, codigo, mensaje) => {
    fallo = error;
    const respuesta = await crearB002();
    expect(respuesta.status).toBe(estado);
    expect(respuesta.body.codigo).toBe(codigo);
    if (mensaje) expect(respuesta.body.mensaje).toBe(mensaje);
  });

  it('PUT estado desactiva con el actor del token', async () => {
    const respuesta = await conSucursal(http().put(`/v1/seq/series/${SERIE_ID}/estado`)).send({ activa: false });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ id: SERIE_ID, activa: false, modificado_en: MODIFICADO_EN.toISOString(), cambiado: true });
    expect(comandos.estado).toEqual([{ serieId: SERIE_ID, activa: false, actorId: ANA }]);
  });

  it('PUT estado sin booleano da 400 SOLICITUD_INVALIDA', async () => {
    const respuesta = await conSucursal(http().put(`/v1/seq/series/${SERIE_ID}/estado`)).send({ activa: 'no' });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores: ['activa'] });
  });

  describe('con el PermisoGuard real', () => {
    const rutas = () => [
      conSucursal(http().get('/v1/seq/series')),
      conSucursal(http().get(`/v1/seq/series/${SERIE_ID}`)),
      crearB002(),
      conSucursal(http().put(`/v1/seq/series/${SERIE_ID}/estado`)).send({ activa: false }),
    ];

    it('sin plat.serie.gestionar las 4 rutas dan 403 SIN_PERMISO y no llegan al caso de uso', async () => {
      permisosDelActor = ['plat.parametro.leer'];
      const respuestas = await Promise.all(rutas());
      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual(Array(4).fill([403, 'SIN_PERMISO']));
      expect([...comandos.crear, ...comandos.estado, ...comandos.consultados]).toEqual([]);
    });

    it('con aal1 las 4 rutas dan 401 MFA_REQUERIDA con el desafío step-up (TR-RN-009)', async () => {
      const respuestas = await Promise.all(rutas().map((solicitud) => solicitud.set('x-prueba-aal', 'aal1')));
      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo, respuesta.headers['www-authenticate']])).toEqual(
        Array(4).fill([401, 'MFA_REQUERIDA', STEP_UP]),
      );
      expect([...comandos.crear, ...comandos.estado, ...comandos.consultados]).toEqual([]);
    });
  });

  it('las 4 rutas exigen plat.serie.gestionar', () => {
    const reflector = new Reflector();
    const permisoDe = (metodo: keyof SeriesController) => reflector.get(PERMISO, SeriesController.prototype[metodo]);
    expect([permisoDe('listar'), permisoDe('consultar'), permisoDe('crear'), permisoDe('cambiarEstado')]).toEqual(Array(4).fill('plat.serie.gestionar'));
  });

  it('las 4 rutas están en OpenAPI con sus códigos de error', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const rutas = documento.paths;
    expect(Object.keys(rutas).sort()).toEqual(['/v1/seq/series', '/v1/seq/series/{id}', '/v1/seq/series/{id}/estado']);
    const codigos = (ruta: string, metodo: 'get' | 'post' | 'put') => Object.keys(rutas[ruta][metodo]?.responses ?? {}).sort();
    expect(codigos('/v1/seq/series', 'get')).toEqual(['200', '400', '401', '403']);
    expect(codigos('/v1/seq/series', 'post')).toEqual(['201', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/seq/series/{id}', 'get')).toEqual(['200', '401', '403', '404']);
    expect(codigos('/v1/seq/series/{id}/estado', 'put')).toEqual(['200', '400', '401', '403', '404', '409']);
  });
});
