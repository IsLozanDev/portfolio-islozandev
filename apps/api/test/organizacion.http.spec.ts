import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ConflictError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import {
  EditarEmpresa,
  EditarSucursal,
  EditarUnidad,
  InactivarSucursal,
  InactivarUnidad,
  ListarEmpresas,
  ListarSucursales,
  ListarUnidades,
  MarcarSucursalPrincipal,
  RegistrarEmpresa,
  RegistrarSucursal,
  RegistrarUnidad,
  VersionObsoletaError,
} from '@vitrina/plataforma/org';
import { PermisoGuard } from '@vitrina/plataforma/seguridad';
import { EmpresasController } from '../src/org/empresas.controller.js';
import { SucursalesController } from '../src/org/sucursales.controller.js';
import { UnidadesController } from '../src/org/unidades.controller.js';

const TENANT = '0193f3a0-0000-7000-8000-0000000000cc';
const SUCURSAL_ACTOR = '0193f3a0-0000-7000-8000-000000000101';
const PROPIETARIO = '0193f3a0-0000-7000-8000-000000000901';
const EMPRESA = '0193f3a0-0000-7000-8000-0000000000e1';
const SUCURSAL = '0193f3a0-0000-7000-8000-0000000000f1';
const UNIDAD = '0193f3a0-0000-7000-8000-0000000000a1';
const MFA_MAX_EDAD_SEG = 900;
const PERMISOS_PROPIETARIO = ['plat.organizacion.consultar', 'plat.empresa.crear', 'plat.sucursal.gestionar', 'plat.unidad.gestionar'];

/** Hace lo que deja AutenticacionGuard. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    contexto.switchToHttp().getRequest().principal = { usuarioId: PROPIETARIO, tenantId: TENANT, tipo: 'INTERNO', aal: 'aal1', sesionId: 'sesion', amr: [] };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/org empresas, sucursales y unidades (TR-RF-002 a 004)', () => {
  let app: INestApplication;
  let permisosDelActor: string[];
  let fallo: Error | null;
  const llamadas: { caso: string; argumentos: unknown[] }[] = [];

  /** Doble de un caso de uso: registra la llamada y devuelve `resultado`, o lanza `fallo`. */
  const caso = (nombre: string, resultado: unknown = undefined) => ({
    ejecutar: async (...argumentos: unknown[]) => {
      llamadas.push({ caso: nombre, argumentos });
      if (fallo) throw fallo;
      return resultado;
    },
  });

  const servidor = () => request(app.getHttpServer());
  const conCabeceras = <T extends request.Test>(solicitud: T) => solicitud.set('X-Sucursal-Id', SUCURSAL_ACTOR);

  beforeAll(async () => {
    const empresa = { id: EMPRESA, ruc: '20512345671', razonSocial: 'Sabores del Sur SAC', nombreComercial: null, direccionFiscal: null, ubigeo: '040101', activo: true, version: 3 };
    const modulo = await Test.createTestingModule({
      controllers: [EmpresasController, SucursalesController, UnidadesController],
      providers: [
        { provide: ListarEmpresas, useValue: caso('ListarEmpresas', { items: [empresa], total: 21 }) },
        { provide: RegistrarEmpresa, useValue: caso('RegistrarEmpresa', { empresaId: EMPRESA, sucursalPrincipalId: SUCURSAL }) },
        { provide: EditarEmpresa, useValue: caso('EditarEmpresa') },
        { provide: ListarSucursales, useValue: caso('ListarSucursales', { items: [], total: 0 }) },
        { provide: RegistrarSucursal, useValue: caso('RegistrarSucursal', { sucursalId: SUCURSAL }) },
        { provide: EditarSucursal, useValue: caso('EditarSucursal') },
        { provide: InactivarSucursal, useValue: caso('InactivarSucursal') },
        { provide: MarcarSucursalPrincipal, useValue: caso('MarcarSucursalPrincipal') },
        { provide: ListarUnidades, useValue: caso('ListarUnidades', { items: [], total: 0 }) },
        { provide: RegistrarUnidad, useValue: caso('RegistrarUnidad', { unidadId: UNIDAD }) },
        { provide: EditarUnidad, useValue: caso('EditarUnidad') },
        { provide: InactivarUnidad, useValue: caso('InactivarUnidad') },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async () => false } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(new PrincipalDePrueba(), new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  beforeEach(() => {
    permisosDelActor = PERMISOS_PROPIETARIO;
    fallo = null;
    llamadas.length = 0;
  });

  afterAll(() => app?.close());

  it('GET /empresas responde { items, total } en snake_case con la versión, y pagina 20 por defecto', async () => {
    const respuesta = await conCabeceras(servidor().get('/v1/org/empresas?activo=true'));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      items: [{ id: EMPRESA, ruc: '20512345671', razon_social: 'Sabores del Sur SAC', nombre_comercial: null, direccion_fiscal: null, ubigeo: '040101', activo: true, version: 3 }],
      total: 21,
    });
    expect(llamadas).toEqual([{ caso: 'ListarEmpresas', argumentos: [{ pagina: 1, tamano: 20, activo: true }] }]);
  });

  it.each([
    ['tamano 101', '/v1/org/empresas?tamano=101'],
    ['pagina 0', '/v1/org/empresas?pagina=0'],
    ['activo que no es booleano', '/v1/org/empresas?activo=si'],
    ['tipo desconocido', '/v1/org/unidades?tipo=COCINA'],
    ['sucursal_id que no es UUID', '/v1/org/unidades?sucursal_id=cayma'],
  ])('GET con %s responde 400 SOLICITUD_INVALIDA sin llamar al caso de uso', async (_caso, ruta) => {
    const respuesta = await conCabeceras(servidor().get(ruta));
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('SOLICITUD_INVALIDA');
    expect(llamadas).toEqual([]);
  });

  it('POST /empresas responde 201 con los ids y pasa los opcionales como null', async () => {
    const respuesta = await conCabeceras(servidor().post('/v1/org/empresas')).send({ ruc: '20512345671', razon_social: 'Sabores del Sur SAC' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({ empresa_id: EMPRESA, sucursal_principal_id: SUCURSAL });
    expect(llamadas[0].argumentos).toEqual([{ ruc: '20512345671', razonSocial: 'Sabores del Sur SAC', nombreComercial: null, direccionFiscal: null, ubigeo: null }]);
  });

  it('POST /empresas/:id/sucursales usa America/Lima si no llega zona horaria', async () => {
    const respuesta = await conCabeceras(servidor().post(`/v1/org/empresas/${EMPRESA}/sucursales`)).send({
      codigo: 'CAYMA',
      nombre: 'Cayma',
      codigo_establecimiento_sunat: '0002',
      ubigeo: '040103',
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({ sucursal_id: SUCURSAL });
    expect(llamadas[0].argumentos).toEqual([
      { empresaId: EMPRESA, codigo: 'CAYMA', nombre: 'Cayma', codigoEstablecimientoSunat: '0002', direccion: null, ubigeo: '040103', telefono: null, zonaHoraria: 'America/Lima' },
    ]);
  });

  it('POST /unidades pasa sucursal y padre nulos y atributos vacíos por defecto', async () => {
    const respuesta = await conCabeceras(servidor().post('/v1/org/unidades')).send({ empresa_id: EMPRESA, tipo: 'ALMACEN', codigo: 'ALM', nombre: 'Almacén central' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({ unidad_id: UNIDAD });
    expect(llamadas[0].argumentos).toEqual([{ empresaId: EMPRESA, sucursalId: null, tipo: 'ALMACEN', codigo: 'ALM', nombre: 'Almacén central', padreId: null, atributos: {} }]);
  });

  it.each([
    ['PUT /empresas/:id', 'put', `/v1/org/empresas/${EMPRESA}`, { razon_social: 'Sabores del Sur SAC' }],
    ['PUT /sucursales/:id', 'put', `/v1/org/sucursales/${SUCURSAL}`, { codigo: 'CAYMA', nombre: 'Cayma' }],
    ['PUT /unidades/:id', 'put', `/v1/org/unidades/${UNIDAD}`, { codigo: 'CAJA-01', nombre: 'Caja 1' }],
  ] as const)('%s sin version responde 400', async (_caso, metodo, ruta, cuerpo) => {
    const respuesta = await conCabeceras(servidor()[metodo](ruta)).send(cuerpo);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toContain('version');
  });

  it('PUT /sucursales/:id responde 204 y pasa la versión y activo', async () => {
    const respuesta = await conCabeceras(servidor().put(`/v1/org/sucursales/${SUCURSAL}`)).send({ version: 4, activo: false, codigo: 'CAYMA', nombre: 'Cayma' });

    expect(respuesta.status).toBe(204);
    expect(llamadas[0].argumentos).toEqual([expect.objectContaining({ sucursalId: SUCURSAL, version: 4, activo: false, codigo: 'CAYMA' })]);
  });

  it.each([
    ['inactivar sucursal', `/v1/org/sucursales/${SUCURSAL}/inactivar`, 'InactivarSucursal', { sucursalId: SUCURSAL }],
    ['marcar principal', `/v1/org/sucursales/${SUCURSAL}/principal`, 'MarcarSucursalPrincipal', { sucursalId: SUCURSAL }],
    ['inactivar unidad', `/v1/org/unidades/${UNIDAD}/inactivar`, 'InactivarUnidad', { unidadId: UNIDAD }],
  ])('%s responde 204', async (_caso, ruta, nombre, comando) => {
    const respuesta = await conCabeceras(servidor().post(ruta));
    expect(respuesta.status).toBe(204);
    expect(llamadas).toEqual([{ caso: nombre, argumentos: [comando] }]);
  });

  it('un id que no es UUID responde 404 NO_ENCONTRADO sin llamar al caso de uso', async () => {
    const respuesta = await conCabeceras(servidor().post('/v1/org/sucursales/cayma/inactivar'));
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'La sucursal no existe' });
    expect(llamadas).toEqual([]);
  });

  it.each([
    ['versión vieja', new VersionObsoletaError(), 409, 'VERSION_OBSOLETA', 'El registro cambió desde que lo abrió; recargue y vuelva a intentar'],
    ['tope del plan (TR-CA-008)', new ConflictError('Su plan permite 2 sucursales; amplíe su plan'), 409, 'CONFLICTO', 'Su plan permite 2 sucursales; amplíe su plan'],
    ['regla de dominio', new ValidationError('Solo los almacenes pueden registrarse sin sucursal'), 400, 'SOLICITUD_INVALIDA', 'Solo los almacenes pueden registrarse sin sucursal'],
    ['empresa de otro tenant', new NotFoundError('La empresa no existe'), 404, 'NO_ENCONTRADO', 'La empresa no existe'],
  ])('%s responde %i %s', async (_caso, error, estado, codigo, mensaje) => {
    fallo = error;
    const respuesta = await conCabeceras(servidor().put(`/v1/org/sucursales/${SUCURSAL}`)).send({ version: 1, codigo: 'CAYMA', nombre: 'Cayma' });
    expect(respuesta.status).toBe(estado);
    expect(respuesta.body).toEqual({ codigo, mensaje });
  });

  it.each([
    ['alta', 'post', `/v1/org/empresas/${EMPRESA}/sucursales`, { codigo: 'CAYMA', nombre: 'Cayma' }],
    ['edición', 'put', `/v1/org/sucursales/${SUCURSAL}`, { version: 1, codigo: 'CAYMA', nombre: 'Cayma' }],
    ['inactivación', 'post', `/v1/org/sucursales/${SUCURSAL}/inactivar`, {}],
  ] as const)('sin plat.sucursal.gestionar, la %s de sucursal responde 403 SIN_PERMISO', async (_caso, metodo, ruta, cuerpo) => {
    permisosDelActor = PERMISOS_PROPIETARIO.filter((permiso) => permiso !== 'plat.sucursal.gestionar');
    const respuesta = await conCabeceras(servidor()[metodo](ruta)).send(cuerpo);
    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toEqual({ codigo: 'SIN_PERMISO', permiso: 'plat.sucursal.gestionar' });
    expect(llamadas).toEqual([]);
  });

  it('sin plat.organizacion.consultar, las listas responden 403', async () => {
    permisosDelActor = ['plat.sesion.contexto'];
    for (const ruta of ['/v1/org/empresas', `/v1/org/empresas/${EMPRESA}/sucursales`, '/v1/org/unidades']) {
      const respuesta = await conCabeceras(servidor().get(ruta));
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.permiso).toBe('plat.organizacion.consultar');
    }
  });
});
