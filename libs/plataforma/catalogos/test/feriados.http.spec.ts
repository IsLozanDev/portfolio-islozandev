import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { ForbiddenError } from '@vitrina/plataforma/kernel';
import { PERMISO, PermisoGuard } from '@vitrina/plataforma/seguridad';
import { ActualizarFeriado } from '../src/application/feriados/actualizar-feriado.js';
import { CrearFeriado } from '../src/application/feriados/crear-feriado.js';
import { EliminarFeriado } from '../src/application/feriados/eliminar-feriado.js';
import { ListarFeriados } from '../src/application/feriados/listar-feriados.js';
import { VersionObsoletaError } from '../src/domain/errores.js';
import {
  FeriadoDuplicadoError,
  FeriadoInvalidoError,
  FeriadoNoEncontradoError,
  SucursalNoEncontradaError,
} from '../src/domain/feriados/errores.js';
import { FeriadosController } from '../src/interface/feriados.controller.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const SUCURSAL = '0193f3a0-0000-7000-8000-000000000101';
const CUSCO = '0193f3a0-0000-7000-8000-0000000a0001';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const FERIADO = '0193f3a0-0000-7000-8000-00000000f001';
const MILISEGUNDOS_POR_SEGUNDO = 1000;
const MFA_MAX_EDAD_SEG = 900;
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

class OperadorRequeridoDoble extends ForbiddenError {
  override readonly code = 'OPERADOR_REQUERIDO';
}

const fiestasPatrias = {
  id: FERIADO,
  alcance: 'GLOBAL' as const,
  sucursalId: null,
  fecha: '2026-07-28',
  nombre: 'Fiestas Patrias',
  recurrenteAnual: true,
  version: 0,
};
const fiestasPatriasRespuesta = {
  id: FERIADO,
  alcance: 'GLOBAL',
  sucursal_id: null,
  fecha: '2026-07-28',
  nombre: 'Fiestas Patrias',
  recurrente_anual: true,
  version: 0,
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

describe('HTTP /v1/feriados (TR-RF-029)', () => {
  let app: INestApplication;
  let fallo: Error | null;
  let permisosDelActor: string[];
  const comandos: Record<string, unknown[]> = {};
  const registrar = (nombre: string, comando: unknown) => {
    (comandos[nombre] ??= []).push(comando);
    if (fallo) throw fallo;
  };
  const http = () => request(app.getHttpServer());
  const conSucursal = <T extends { set(campo: string, valor: string): T }>(solicitud: T) => solicitud.set('X-Sucursal-Id', SUCURSAL);
  const cuerpoCrear = { alcance: 'SUCURSAL', sucursal_id: CUSCO, fecha: '2026-06-24', nombre: 'Inti Raymi', recurrente_anual: true };
  const cuerpoActualizar = { fecha: '2026-07-28', nombre: 'Fiestas Patrias', recurrente_anual: true, version: 0 };

  beforeAll(async () => {
    const manifiesto: { permisos: { codigo: string; sensible: boolean }[] } = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
    const sensibles = new Set(manifiesto.permisos.filter((permiso) => permiso.sensible).map((permiso) => permiso.codigo));
    const doble = (nombre: string, respuesta: unknown) => async (comando: unknown) => {
      registrar(nombre, comando);
      return respuesta;
    };
    const modulo = await Test.createTestingModule({
      controllers: [FeriadosController],
      providers: [
        { provide: ListarFeriados, useValue: { ejecutar: doble('listar', [{ ...fiestasPatrias, fechaEnAnio: '2027-07-28', editable: false }]) } },
        { provide: CrearFeriado, useValue: { ejecutar: doble('crear', fiestasPatrias) } },
        { provide: ActualizarFeriado, useValue: { ejecutar: doble('actualizar', { ...fiestasPatrias, version: 1, cambiado: true }) } },
        { provide: EliminarFeriado, useValue: { ejecutar: doble('eliminar', undefined) } },
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
    permisosDelActor = ['plat.feriado.gestionar'];
    for (const nombre of Object.keys(comandos)) delete comandos[nombre];
  });

  afterAll(() => app?.close());

  const rutas = () => ({
    listar: conSucursal(http().get('/v1/feriados?anio=2027')),
    crear: conSucursal(http().post('/v1/feriados')).send(cuerpoCrear),
    actualizar: conSucursal(http().put(`/v1/feriados/${FERIADO}`)).send(cuerpoActualizar),
    eliminar: conSucursal(http().delete(`/v1/feriados/${FERIADO}?version=0`)),
  });

  it('GET /v1/feriados?anio=2027 trae la fecha en el año y editable, en snake_case', async () => {
    const respuesta = await rutas().listar;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual([{ ...fiestasPatriasRespuesta, fecha_en_anio: '2027-07-28', editable: false }]);
    expect(comandos.listar).toEqual([{ anio: 2027, sucursalId: null }]);
  });

  it('GET /v1/feriados con sucursal_id la pasa al caso de uso', async () => {
    await conSucursal(http().get(`/v1/feriados?anio=2026&sucursal_id=${CUSCO}`));
    expect(comandos.listar).toEqual([{ anio: 2026, sucursalId: CUSCO }]);
  });

  it('POST /v1/feriados responde 201 con el feriado y el actor del token', async () => {
    const respuesta = await rutas().crear;
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual(fiestasPatriasRespuesta);
    expect(comandos.crear).toEqual([
      { alcance: 'SUCURSAL', sucursalId: CUSCO, fecha: '2026-06-24', nombre: 'Inti Raymi', recurrenteAnual: true, actorId: ANA },
    ]);
  });

  it('POST /v1/feriados sin sucursal_id la manda como null', async () => {
    await conSucursal(http().post('/v1/feriados')).send({ ...cuerpoCrear, alcance: 'TENANT', sucursal_id: undefined });
    expect(comandos.crear).toEqual([expect.objectContaining({ alcance: 'TENANT', sucursalId: null })]);
  });

  it('PUT /v1/feriados/{id} devuelve version y cambiado; alcance y sucursal_id llegan solo si se mandan', async () => {
    const respuesta = await rutas().actualizar;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ ...fiestasPatriasRespuesta, version: 1, cambiado: true });
    expect(comandos.actualizar).toEqual([
      { feriadoId: FERIADO, fecha: '2026-07-28', nombre: 'Fiestas Patrias', recurrenteAnual: true, version: 0, alcance: undefined, sucursalId: undefined, actorId: ANA },
    ]);
  });

  it('DELETE /v1/feriados/{id} responde 204 con la versión de la query', async () => {
    const respuesta = await rutas().eliminar;
    expect(respuesta.status).toBe(204);
    expect(comandos.eliminar).toEqual([{ feriadoId: FERIADO, version: 0, actorId: ANA }]);
  });

  it('un id que no es UUID da 404 FERIADO_NO_ENCONTRADO sin llegar al caso de uso', async () => {
    const respuestas = await Promise.all([
      conSucursal(http().put('/v1/feriados/no-es-uuid')).send(cuerpoActualizar),
      conSucursal(http().delete('/v1/feriados/no-es-uuid?version=0')),
    ]);
    expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual(Array(2).fill([404, 'FERIADO_NO_ENCONTRADO']));
    expect(Object.keys(comandos)).toEqual([]);
  });

  it.each([
    ['GET sin anio', () => conSucursal(http().get('/v1/feriados')), ['anio']],
    ['GET con anio 1999', () => conSucursal(http().get('/v1/feriados?anio=1999')), ['anio']],
    ['GET con anio 2101', () => conSucursal(http().get('/v1/feriados?anio=2101')), ['anio']],
    ['GET con sucursal_id que no es UUID', () => conSucursal(http().get('/v1/feriados?anio=2026&sucursal_id=cusco')), ['sucursal_id']],
    ['POST con alcance desconocido', () => conSucursal(http().post('/v1/feriados')).send({ ...cuerpoCrear, alcance: 'REGION' }), ['alcance']],
    ['POST con fecha en otro formato', () => conSucursal(http().post('/v1/feriados')).send({ ...cuerpoCrear, fecha: '24/06/2026' }), ['fecha']],
    ['POST sin recurrente_anual', () => conSucursal(http().post('/v1/feriados')).send({ ...cuerpoCrear, recurrente_anual: undefined }), ['recurrente_anual']],
    ['POST con nombre de 101 caracteres', () => conSucursal(http().post('/v1/feriados')).send({ ...cuerpoCrear, nombre: 'x'.repeat(101) }), ['nombre']],
    ['PUT sin version', () => conSucursal(http().put(`/v1/feriados/${FERIADO}`)).send({ ...cuerpoActualizar, version: undefined }), ['version']],
    ['DELETE sin version', () => conSucursal(http().delete(`/v1/feriados/${FERIADO}`)), ['version']],
  ])('%s da 400 SOLICITUD_INVALIDA', async (_caso, solicitud, errores) => {
    const respuesta = await solicitud();
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores });
    expect(Object.keys(comandos)).toEqual([]);
  });

  it.each([
    ['crear', new OperadorRequeridoDoble('Solo el tenant operador puede administrar catálogos globales'), 403, 'OPERADOR_REQUERIDO'],
    ['crear', new FeriadoDuplicadoError(), 409, 'FERIADO_DUPLICADO'],
    ['crear', new SucursalNoEncontradaError(), 404, 'SUCURSAL_NO_ENCONTRADA'],
    ['crear', new FeriadoInvalidoError('El nombre debe tener de 3 a 100 caracteres'), 400, 'FERIADO_INVALIDO'],
    ['actualizar', new VersionObsoletaError(), 409, 'VERSION_OBSOLETA'],
    ['actualizar', new FeriadoNoEncontradoError(), 404, 'FERIADO_NO_ENCONTRADO'],
    ['actualizar', new FeriadoInvalidoError('El alcance de un feriado no se cambia'), 400, 'FERIADO_INVALIDO'],
    ['eliminar', new FeriadoNoEncontradoError(), 404, 'FERIADO_NO_ENCONTRADO'],
  ] as const)('%s traduce %s a %i %s', async (ruta, error, estado, codigo) => {
    fallo = error;
    const respuesta = await rutas()[ruta];
    expect(respuesta.status).toBe(estado);
    expect(respuesta.body).toEqual({ codigo, mensaje: error.message });
  });

  it('TR-CA-077: el duplicado responde «La fecha ya está registrada como feriado»', async () => {
    fallo = new FeriadoDuplicadoError();
    const respuesta = await rutas().crear;
    expect(respuesta.body.mensaje).toBe('La fecha ya está registrada como feriado');
  });

  describe('con el PermisoGuard real', () => {
    it('sin plat.feriado.gestionar las 4 rutas dan 403 SIN_PERMISO y no llegan al caso de uso', async () => {
      permisosDelActor = ['plat.catalogo.leer'];
      const respuestas = await Promise.all(Object.values(rutas()));
      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual(Array(4).fill([403, 'SIN_PERMISO']));
      expect(Object.keys(comandos)).toEqual([]);
    });

    it('el permiso no es sensible: con aal1 las 4 rutas responden', async () => {
      const conAal1 = Object.entries(rutas()).map(async ([nombre, solicitud]) => [nombre, (await solicitud.set('x-prueba-aal', 'aal1')).status] as const);
      expect(Object.fromEntries(await Promise.all(conAal1))).toEqual({ listar: 200, crear: 201, actualizar: 200, eliminar: 204 });
    });
  });

  it('las 4 rutas exigen plat.feriado.gestionar', () => {
    const reflector = new Reflector();
    const permisoDe = (metodo: keyof FeriadosController) => reflector.get(PERMISO, FeriadosController.prototype[metodo]);
    expect([permisoDe('listar'), permisoDe('crear'), permisoDe('actualizar'), permisoDe('eliminar')]).toEqual(Array(4).fill('plat.feriado.gestionar'));
  });

  it('las 4 rutas están en OpenAPI con sus códigos de error', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const rutasDoc = documento.paths;
    const codigos = (ruta: string, metodo: 'get' | 'post' | 'put' | 'delete') => Object.keys(rutasDoc[ruta]?.[metodo]?.responses ?? {}).sort();
    expect(Object.keys(rutasDoc).sort()).toEqual(['/v1/feriados', '/v1/feriados/{id}']);
    expect(codigos('/v1/feriados', 'get')).toEqual(['200', '400', '401', '403']);
    expect(codigos('/v1/feriados', 'post')).toEqual(['201', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/feriados/{id}', 'put')).toEqual(['200', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/feriados/{id}', 'delete')).toEqual(['204', '400', '401', '403', '404', '409']);
    expect(rutasDoc['/v1/feriados']?.get?.security).toEqual([{ bearer: [] }]);
  });
});
