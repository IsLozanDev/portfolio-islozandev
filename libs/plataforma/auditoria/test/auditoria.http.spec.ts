import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { PERMISO, PermisoGuard } from '@vitrina/plataforma/seguridad';
import { ConsultarAuditoria, type EventoAuditoriaListado } from '../src/application/consultar-auditoria.js';
import { ObtenerEventoAuditoria, type DetalleEventoAuditoria } from '../src/application/obtener-evento-auditoria.js';
import { EventoAuditoriaNoEncontradoError, RangoInvalidoError, SucursalFueraDeAlcanceError } from '../src/domain/errores.js';
import { AuditoriaController } from '../src/interface/auditoria.controller.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const SURCO = '0193f3a0-0000-7000-8000-000000000102';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const ROSA = '0193f3a0-0000-7000-8000-000000000903';
const EVENTO = '0193f3a0-0000-7000-8000-00000000a001';
const CONSULTAR = 'plat.auditoria.consultar';
const OCTUBRE = { desde: '2026-10-01', hasta: '2026-10-31' };

const listado: EventoAuditoriaListado = {
  id: EVENTO,
  numero: '7',
  tipo: 'OPERACION',
  origen: 'DIRECTO',
  accion: 'rest.venta.anular',
  entidadTipo: 'venta',
  entidadId: 'V-000981',
  usuarioId: ROSA,
  sucursalId: SURCO,
  motivo: 'cliente desistió',
  finalidad: null,
  ticket: null,
  personaTitularId: null,
  ip: '190.42.10.8',
  ocurridoEn: new Date('2026-10-15T15:00:00Z'),
  usuario: { id: ROSA, nombre: 'Rosa Huamán', correo: 'rosa@sabores.pe' },
  sucursal: { id: SURCO, codigo: 'SURCO', nombre: 'Surco' },
};
const sistema: EventoAuditoriaListado = { ...listado, id: '0193f3a0-0000-7000-8000-00000000a002', usuarioId: null, sucursalId: null, usuario: null, sucursal: null };
const detalle: DetalleEventoAuditoria = {
  ...listado,
  antes: { total: 120 },
  despues: { total: 0 },
  cambios: [{ campo: 'total', antes: 120, despues: 0 }],
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  eventId: null,
  hashAnterior: '0'.repeat(64),
  hash: 'a'.repeat(64),
};

/** Hace lo que deja AutenticacionGuard: el principal del token. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    contexto.switchToHttp().getRequest().principal = { usuarioId: ANA, tenantId: TENANT, tipo: 'INTERNO', aal: 'aal1', sesionId: 'sesion', amr: [] };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/aud/eventos (spec 20b)', () => {
  let app: INestApplication;
  let permisosDelActor: string[];
  let fallo: Error | null;
  const consultas: unknown[][] = [];
  const detalles: string[] = [];
  const http = () => request(app.getHttpServer());
  const listar = (query: Record<string, string>) => http().get('/v1/aud/eventos').query(query).set('X-Sucursal-Id', SURCO);
  const obtener = (id: string) => http().get(`/v1/aud/eventos/${id}`).set('X-Sucursal-Id', SURCO);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [AuditoriaController],
      providers: [
        {
          provide: ConsultarAuditoria,
          useValue: {
            ejecutar: async (...argumentos: unknown[]) => {
              consultas.push(argumentos);
              if (fallo) throw fallo;
              return { items: [listado, sistema], total: 2 };
            },
          },
        },
        {
          provide: ObtenerEventoAuditoria,
          useValue: {
            ejecutar: async (id: string) => {
              detalles.push(id);
              if (id !== EVENTO) throw new EventoAuditoriaNoEncontradoError();
              return detalle;
            },
          },
        },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async () => false } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(new PrincipalDePrueba(), new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, 900));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(() => app?.close());

  beforeEach(() => {
    permisosDelActor = [CONSULTAR];
    fallo = null;
    consultas.length = 0;
    detalles.length = 0;
  });

  it('sin plat.auditoria.consultar las dos rutas dan 403 SIN_PERMISO y no llegan al caso de uso', async () => {
    permisosDelActor = ['plat.seguridad.bitacora'];
    const respuestas = await Promise.all([listar(OCTUBRE), obtener(EVENTO)]);
    expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual([
      [403, 'SIN_PERMISO'],
      [403, 'SIN_PERMISO'],
    ]);
    expect([consultas, detalles]).toEqual([[], []]);
  });

  it('pasa los filtros al caso de uso y lista sin antes ni despues, con usuario y sucursal o null para el sistema', async () => {
    const respuesta = await listar({ ...OCTUBRE, usuario: 'rosa', accion: 'rest.venta.anular', tipo: 'OPERACION', pagina: '2', tamano: '50' });

    expect(respuesta.status).toBe(200);
    expect(consultas).toEqual([
      [
        { ...OCTUBRE, usuario: 'rosa', accion: 'rest.venta.anular', tipo: 'OPERACION', entidadTipo: undefined, entidadId: undefined, sucursalId: undefined, personaTitularId: undefined },
        { pagina: 2, tamano: 50 },
      ],
    ]);
    expect(respuesta.body.total).toBe(2);
    expect(respuesta.body.items[0]).toEqual({
      id: EVENTO,
      numero: '7',
      tipo: 'OPERACION',
      origen: 'DIRECTO',
      accion: 'rest.venta.anular',
      entidad_tipo: 'venta',
      entidad_id: 'V-000981',
      usuario: { id: ROSA, nombre: 'Rosa Huamán', correo: 'rosa@sabores.pe' },
      sucursal: { id: SURCO, codigo: 'SURCO', nombre: 'Surco' },
      motivo: 'cliente desistió',
      finalidad: null,
      ticket: null,
      persona_titular_id: null,
      ip: '190.42.10.8',
      ocurrido_en: '2026-10-15T15:00:00.000Z',
    });
    expect(respuesta.body.items[1]).toMatchObject({ usuario: null, sucursal: null });
  });

  it('400 SOLICITUD_INVALIDA con un uuid o un tamaño inválidos, sin nombrar el valor', async () => {
    for (const query of [{ ...OCTUBRE, sucursal_id: 'surco' }, { ...OCTUBRE, tamano: '101' }, { ...OCTUBRE, usuario: 'r' }, { ...OCTUBRE, tipo: 'OTRO' }]) {
      const respuesta = await listar(query);
      expect([respuesta.status, respuesta.body.codigo]).toEqual([400, 'SOLICITUD_INVALIDA']);
      expect(JSON.stringify(respuesta.body)).not.toContain('surco');
    }
    expect(consultas).toEqual([]);
  });

  it('los errores del dominio salen como { codigo, mensaje }: rango 400 y sucursal ajena 403', async () => {
    fallo = new RangoInvalidoError();
    const rango = await listar({ desde: '2026-08-01', hasta: '2026-11-01' });
    expect([rango.status, rango.body]).toEqual([400, { codigo: 'RANGO_INVALIDO', mensaje: fallo.message }]);

    fallo = new SucursalFueraDeAlcanceError();
    const ajena = await listar({ ...OCTUBRE, sucursal_id: '0193f3a0-0000-7000-8000-000000000101' });
    expect([ajena.status, ajena.body.codigo]).toEqual([403, 'SUCURSAL_FUERA_DE_ALCANCE']);
  });

  it('el detalle trae antes, despues, cambios, traza y hashes; uno que no existe es 404', async () => {
    const respuesta = await obtener(EVENTO);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      id: EVENTO,
      antes: { total: 120 },
      despues: { total: 0 },
      cambios: [{ campo: 'total', antes: 120, despues: 0 }],
      trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
      event_id: null,
      hash_anterior: '0'.repeat(64),
      hash: 'a'.repeat(64),
    });

    const ajeno = await obtener('0193f3a0-0000-7000-8000-00000000ffff');
    expect([ajeno.status, ajeno.body.codigo]).toEqual([404, 'EVENTO_NO_ENCONTRADO']);
  });

  it('las dos rutas exigen plat.auditoria.consultar', () => {
    const reflector = new Reflector();
    expect([reflector.get(PERMISO, AuditoriaController.prototype.listar), reflector.get(PERMISO, AuditoriaController.prototype.consultar)]).toEqual([
      CONSULTAR,
      CONSULTAR,
    ]);
  });

  it('las rutas están en OpenAPI con sus códigos de error', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const codigos = (ruta: string) => Object.keys(documento.paths[ruta]?.get?.responses ?? {}).sort();
    expect(codigos('/v1/aud/eventos')).toEqual(['200', '400', '401', '403']);
    expect(codigos('/v1/aud/eventos/{id}')).toEqual(['200', '401', '403', '404']);
  });
});
