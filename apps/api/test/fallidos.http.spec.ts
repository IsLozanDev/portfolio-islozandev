import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { ConflictError } from '@vitrina/plataforma/kernel';
import { ListarFallidos, ReprocesarFallidos, type ConsultaFallidos, type EventoFallido, type ReprocesarFallidosComando } from '@vitrina/plataforma/eventos';
import { PERMISO, PermisoGuard } from '@vitrina/plataforma/seguridad';
import { FallidosController } from '../src/eventos/fallidos.controller.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const CAYMA = '0193f3a0-0000-7000-8000-000000000102';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const FALLIDO_ID = '0193f3a0-0000-7000-8000-00000000e001';
const OTRO_ID = '0193f3a0-0000-7000-8000-00000000e002';
const EVENT_ID = '0193f3a0-0000-7000-8000-00000000a001';
const CITA_ID = '0193f3a0-0000-7000-8000-00000000c001';
const FALLIDO_EN = new Date('2026-10-25T15:00:00.000Z');
const MFA_MAX_EDAD_SEG = 900;
const STEP_UP = `Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=${MFA_MAX_EDAD_SEG}`;
const MILISEGUNDOS_POR_SEGUNDO = 1000;
const MAXIMO_IDS = 100;

// El catálogo de prueba lee la sensibilidad del manifiesto PLAT real: el 401 depende de lo declarado.
const RUTA_MANIFIESTO = new URL('../../../libs/plataforma/seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

const fallido = {
  id: FALLIDO_ID,
  consumidor: 'prueba-a',
  eventId: EVENT_ID,
  eventType: 'cita.creada',
  aggregateType: 'cita',
  aggregateId: CITA_ID,
  error: 'el consumidor sigue caído',
  intentos: 8,
  estado: 'FALLIDO',
  fallidoEn: FALLIDO_EN,
  reprocesadoPor: null,
  reprocesadoEn: null,
} as unknown as EventoFallido;

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

describe('HTTP /v1/evt/fallidos (TR-RF-095)', () => {
  let app: INestApplication;
  let fallo: Error | null;
  let permisosDelActor: string[];
  const consultas: ConsultaFallidos[] = [];
  const reprocesos: ReprocesarFallidosComando[] = [];
  const http = () => request(app.getHttpServer());
  const conSucursal = <T extends { set(campo: string, valor: string): T }>(solicitud: T) => solicitud.set('X-Sucursal-Id', CAYMA);
  const reprocesar = (cuerpo: unknown) => conSucursal(http().post('/v1/evt/fallidos/reprocesar')).send(cuerpo as object);

  beforeAll(async () => {
    const manifiesto: { permisos: { codigo: string; sensible: boolean }[] } = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
    const sensibles = new Set(manifiesto.permisos.filter((permiso) => permiso.sensible).map((permiso) => permiso.codigo));
    const modulo = await Test.createTestingModule({
      controllers: [FallidosController],
      providers: [
        {
          provide: ListarFallidos,
          useValue: {
            ejecutar: async (consulta: ConsultaFallidos) => {
              consultas.push(consulta);
              return [fallido];
            },
          },
        },
        {
          provide: ReprocesarFallidos,
          useValue: {
            ejecutar: async (comando: ReprocesarFallidosComando) => {
              reprocesos.push(comando);
              if (fallo) throw fallo;
              return { reprocesados: [FALLIDO_ID], omitidos: [{ id: OTRO_ID, motivo: 'NO_FALLIDO' }] };
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
    permisosDelActor = ['plat.evento.consultar', 'plat.evento.reprocesar'];
    consultas.length = 0;
    reprocesos.length = 0;
  });

  afterAll(() => app?.close());

  it('GET lista en snake_case, sin payload, con los filtros de la consulta', async () => {
    const respuesta = await conSucursal(http().get('/v1/evt/fallidos?consumidor=prueba-a&event_type=cita.creada&estado=FALLIDO&limite=10'));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual([
      {
        id: FALLIDO_ID,
        consumidor: 'prueba-a',
        event_id: EVENT_ID,
        event_type: 'cita.creada',
        aggregate_type: 'cita',
        aggregate_id: CITA_ID,
        error: 'el consumidor sigue caído',
        intentos: 8,
        estado: 'FALLIDO',
        fallido_en: FALLIDO_EN.toISOString(),
        reprocesado_por: null,
        reprocesado_en: null,
      },
    ]);
    expect(consultas).toEqual([{ consumidor: 'prueba-a', eventType: 'cita.creada', estado: 'FALLIDO', limite: 10 }]);
  });

  it('GET sin filtros deja los valores por defecto al caso de uso', async () => {
    await conSucursal(http().get('/v1/evt/fallidos'));
    expect(consultas).toEqual([{ consumidor: undefined, eventType: undefined, estado: undefined, limite: undefined }]);
  });

  it('GET con un filtro inválido da 400 SOLICITUD_INVALIDA', async () => {
    const respuesta = await conSucursal(http().get('/v1/evt/fallidos?estado=REINTENTANDO&limite=101'));
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores: ['estado', 'limite'] });
    expect(consultas).toEqual([]);
  });

  it('POST reprocesar pasa los ids y el actor del token y responde 200 con reprocesados y omitidos', async () => {
    const respuesta = await reprocesar({ ids: [FALLIDO_ID, OTRO_ID] });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ reprocesados: [FALLIDO_ID], omitidos: [{ id: OTRO_ID, motivo: 'NO_FALLIDO' }] });
    expect(reprocesos).toEqual([{ ids: [FALLIDO_ID, OTRO_ID], actorId: ANA }]);
  });

  it.each([
    [{ ids: [] }, ['ids']],
    [{ ids: Array(MAXIMO_IDS + 1).fill(FALLIDO_ID) }, ['ids']],
    [{ ids: ['no-es-uuid'] }, ['ids.0']],
    [{}, ['ids']],
  ])('POST reprocesar con %#: 400 SOLICITUD_INVALIDA', async (cuerpo, errores) => {
    const respuesta = await reprocesar(cuerpo);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores });
    expect(reprocesos).toEqual([]);
  });

  it('un cambio concurrente da 409 CONFLICTO', async () => {
    fallo = new ConflictError('El evento fallido fue modificado por otra operación; vuelva a cargarlo');
    const respuesta = await reprocesar({ ids: [FALLIDO_ID] });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe('CONFLICTO');
  });

  describe('con el PermisoGuard real', () => {
    it('sin plat.evento.consultar ni plat.evento.reprocesar las 2 rutas dan 403 SIN_PERMISO y no llegan al caso de uso', async () => {
      permisosDelActor = ['plat.parametro.leer'];
      const respuestas = await Promise.all([conSucursal(http().get('/v1/evt/fallidos')), reprocesar({ ids: [FALLIDO_ID] })]);
      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual(Array(2).fill([403, 'SIN_PERMISO']));
      expect([...consultas, ...reprocesos]).toEqual([]);
    });

    it('consultar no alcanza para reprocesar', async () => {
      permisosDelActor = ['plat.evento.consultar'];
      const respuesta = await reprocesar({ ids: [FALLIDO_ID] });
      expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'SIN_PERMISO']);
    });

    it('reprocesar con aal1 da 401 MFA_REQUERIDA con el desafío step-up; consultar acepta aal1', async () => {
      const reproceso = await reprocesar({ ids: [FALLIDO_ID] }).set('x-prueba-aal', 'aal1');
      const consulta = await conSucursal(http().get('/v1/evt/fallidos')).set('x-prueba-aal', 'aal1');
      expect([reproceso.status, reproceso.body.codigo, reproceso.headers['www-authenticate']]).toEqual([401, 'MFA_REQUERIDA', STEP_UP]);
      expect(consulta.status).toBe(200);
      expect(reprocesos).toEqual([]);
    });
  });

  it('cada ruta exige su permiso', () => {
    const reflector = new Reflector();
    const permisoDe = (metodo: keyof FallidosController) => reflector.get(PERMISO, FallidosController.prototype[metodo]);
    expect([permisoDe('listar'), permisoDe('reprocesar')]).toEqual(['plat.evento.consultar', 'plat.evento.reprocesar']);
  });

  it('las 2 rutas están en OpenAPI con sus códigos de error', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const rutas = documento.paths;
    expect(Object.keys(rutas).sort()).toEqual(['/v1/evt/fallidos', '/v1/evt/fallidos/reprocesar']);
    const codigos = (ruta: string, metodo: 'get' | 'post') => Object.keys(rutas[ruta][metodo]?.responses ?? {}).sort();
    expect(codigos('/v1/evt/fallidos', 'get')).toEqual(['200', '400', '401', '403']);
    expect(codigos('/v1/evt/fallidos/reprocesar', 'post')).toEqual(['200', '400', '401', '403', '409']);
  });
});
