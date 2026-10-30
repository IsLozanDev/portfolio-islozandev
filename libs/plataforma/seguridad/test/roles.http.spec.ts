import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { ConflictError, NotFoundError } from '@vitrina/plataforma/kernel';
import { ConsultarCatalogo, ConsultarRol, ListarProductosDisponibles, ListarRoles } from '../src/application/lecturas-roles.js';
import { CambiarPermisosRol, CopiarRol, CrearRol, InactivarRol } from '../src/application/rol.casos-de-uso.js';
import { PermisoAjenoAlProductoError, ProductoNoContratadoError, RolPredefinidoNoEditableError } from '../src/domain/errores.js';
import { CatalogoController } from '../src/interface/catalogo.controller.js';
import { PERMISO } from '../src/interface/decoradores.js';
import { RolesController } from '../src/interface/roles.controller.js';
import { Doble, PrincipalDePrueba } from './support/dobles-http.js';

const ROL = '0193f3a0-0000-7000-8000-000000000501';
const COPIA = '0193f3a0-0000-7000-8000-000000000502';

/** Rutas, validación y mapeo sin base: los casos de uso son dobles. */
describe('Rutas de roles y catálogo (HTTP, sin base)', () => {
  let app: INestApplication;
  const casos = {
    listar: new Doble(),
    consultar: new Doble(),
    crear: new Doble(),
    copiar: new Doble(),
    cambiarPermisos: new Doble(),
    inactivar: new Doble(),
    productos: new Doble(),
    catalogo: new Doble(),
  };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [RolesController, CatalogoController],
      providers: [
        { provide: APP_GUARD, useClass: PrincipalDePrueba },
        { provide: ListarRoles, useValue: casos.listar },
        { provide: ConsultarRol, useValue: casos.consultar },
        { provide: CrearRol, useValue: casos.crear },
        { provide: CopiarRol, useValue: casos.copiar },
        { provide: CambiarPermisosRol, useValue: casos.cambiarPermisos },
        { provide: InactivarRol, useValue: casos.inactivar },
        { provide: ListarProductosDisponibles, useValue: casos.productos },
        { provide: ConsultarCatalogo, useValue: casos.catalogo },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    for (const caso of Object.values(casos)) caso.reiniciar();
  });

  it('las ocho rutas llevan plat.rol.gestionar', () => {
    const metodosDeRoles = ['listar', 'consultar', 'crear', 'copiar', 'cambiarPermisos', 'inactivar'] as const;
    const metodosDeCatalogo = ['productos', 'catalogo'] as const;
    const permisos = [
      ...metodosDeRoles.map((metodo) => Reflect.getMetadata(PERMISO, RolesController.prototype[metodo])),
      ...metodosDeCatalogo.map((metodo) => Reflect.getMetadata(PERMISO, CatalogoController.prototype[metodo])),
    ];
    expect(permisos).toEqual(Array(8).fill('plat.rol.gestionar'));
  });

  it('las ocho rutas figuran en OpenAPI con sus códigos de error', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const rutas = Object.entries(documento.paths).flatMap(([ruta, operaciones]) => Object.keys(operaciones).map((metodo) => `${metodo} ${ruta}`));

    expect(rutas).toEqual(
      expect.arrayContaining([
        'get /seg/roles',
        'post /seg/roles',
        'get /seg/roles/{rolId}',
        'post /seg/roles/{rolId}/copia',
        'put /seg/roles/{rolId}/permisos',
        'post /seg/roles/{rolId}/inactivar',
        'get /seg/productos-disponibles',
        'get /seg/catalogo/{productoCodigo}',
      ]),
    );
    expect(Object.keys(documento.paths['/seg/roles/{rolId}/permisos'].put?.responses ?? {})).toEqual(expect.arrayContaining(['204', '400', '401', '403', '404', '409']));
  });

  it('GET /seg/roles responde { items } en snake_case', async () => {
    casos.listar.responde([
      { id: ROL, codigo: 'REST_MOZO', nombre: 'Mozo', productoCodigo: 'REST', productoNombre: 'Restaurante', predefinido: true, activo: true, totalPermisos: 3 },
    ]);

    const respuesta = await http().get('/seg/roles');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      items: [{ id: ROL, codigo: 'REST_MOZO', nombre: 'Mozo', producto_codigo: 'REST', producto_nombre: 'Restaurante', predefinido: true, activo: true, total_permisos: 3 }],
    });
  });

  describe('GET /seg/roles/:rolId', () => {
    it('responde el detalle con sus permisos', async () => {
      casos.consultar.responde({ id: ROL, codigo: 'MOZO', nombre: 'Mozo', productoCodigo: 'REST', productoNombre: 'Restaurante', predefinido: false, activo: true, permisos: ['rest.mesa.ver'] });

      const respuesta = await http().get(`/seg/roles/${ROL}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ id: ROL, codigo: 'MOZO', nombre: 'Mozo', producto_codigo: 'REST', producto_nombre: 'Restaurante', predefinido: false, activo: true, permisos: ['rest.mesa.ver'] });
      expect(casos.consultar.llamadas).toEqual([ROL]);
    });

    it('404 NO_ENCONTRADO si no existe, y un id que no es UUID da el mismo 404 sin llamar al caso de uso', async () => {
      casos.consultar.falla(new NotFoundError('El rol no existe'));

      const inexistente = await http().get(`/seg/roles/${ROL}`);
      const mal = await http().get('/seg/roles/no-es-uuid');

      expect([inexistente.status, inexistente.body]).toEqual([404, { codigo: 'NO_ENCONTRADO', mensaje: 'El rol no existe' }]);
      expect([mal.status, mal.body]).toEqual([404, { codigo: 'NO_ENCONTRADO', mensaje: 'El rol no existe' }]);
      expect(casos.consultar.llamadas).toEqual([ROL]);
    });
  });

  describe('POST /seg/roles', () => {
    const cuerpo = { producto_codigo: 'REST', codigo: 'MOZO_BARRA', nombre: 'Mozo de barra', permisos: ['rest.mesa.ver'] };

    it('201 { rol_id } y comando en camelCase', async () => {
      casos.crear.responde({ rolId: ROL });

      const respuesta = await http().post('/seg/roles').send(cuerpo);

      expect([respuesta.status, respuesta.body]).toEqual([201, { rol_id: ROL }]);
      expect(casos.crear.llamadas).toEqual([{ productoCodigo: 'REST', codigo: 'MOZO_BARRA', nombre: 'Mozo de barra', permisos: ['rest.mesa.ver'] }]);
    });

    it.each([
      [{ ...cuerpo, producto_codigo: 'rest' }, 'producto_codigo'],
      [{ ...cuerpo, permisos: 'rest.mesa.ver' }, 'permisos'],
      [{ ...cuerpo, nombre: 'x'.repeat(101) }, 'nombre'],
    ])('400 SOLICITUD_INVALIDA con %o', async (invalido, campo) => {
      const respuesta = await http().post('/seg/roles').send(invalido);

      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: [campo] }]);
      expect(casos.crear.llamadas).toEqual([]);
    });

    it.each([
      [new PermisoAjenoAlProductoError(['plat.tenant.crear']), 400, 'PERMISO_AJENO_AL_PRODUCTO'],
      [new ProductoNoContratadoError('GYM'), 400, 'PRODUCTO_NO_CONTRATADO'],
      [new ConflictError('Ya existe un rol con ese código en el tenant'), 409, 'CONFLICTO'],
    ])('%s responde %i %s con su mensaje', async (error, estado, codigo) => {
      casos.crear.falla(error);

      const respuesta = await http().post('/seg/roles').send(cuerpo);

      expect([respuesta.status, respuesta.body]).toEqual([estado, { codigo, mensaje: error.message }]);
    });
  });

  it('POST /seg/roles/:rolId/copia pasa permisos solo si vienen', async () => {
    casos.copiar.responde({ rolId: COPIA });

    const conPermisos = await http().post(`/seg/roles/${ROL}/copia`).send({ codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza', permisos: ['rest.mesa.ver'] });
    await http().post(`/seg/roles/${ROL}/copia`).send({ codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza' });

    expect([conPermisos.status, conPermisos.body]).toEqual([201, { rol_id: COPIA }]);
    expect(casos.copiar.llamadas).toEqual([
      { origenId: ROL, codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza', permisos: ['rest.mesa.ver'] },
      { origenId: ROL, codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza', permisos: undefined },
    ]);
  });

  describe('PUT /seg/roles/:rolId/permisos', () => {
    it('204 sin cuerpo', async () => {
      const respuesta = await http().put(`/seg/roles/${ROL}/permisos`).send({ permisos: ['rest.mesa.ver'] });

      expect(respuesta.status).toBe(204);
      expect(casos.cambiarPermisos.llamadas).toEqual([{ rolId: ROL, permisos: ['rest.mesa.ver'] }]);
    });

    it('TR-CA-032: un predefinido responde 409 ROL_PREDEFINIDO_NO_EDITABLE con el mensaje del SRS', async () => {
      casos.cambiarPermisos.falla(new RolPredefinidoNoEditableError());

      const respuesta = await http().put(`/seg/roles/${ROL}/permisos`).send({ permisos: [] });

      expect([respuesta.status, respuesta.body]).toEqual([409, { codigo: 'ROL_PREDEFINIDO_NO_EDITABLE', mensaje: 'Los roles predefinidos no se editan; cree una copia' }]);
    });
  });

  describe('POST /seg/roles/:rolId/inactivar', () => {
    it('200 { requiere_confirmacion, afectados }', async () => {
      casos.inactivar.responde({ requiereConfirmacion: true, afectados: 4 });

      const respuesta = await http().post(`/seg/roles/${ROL}/inactivar`).send({ confirmado: false });

      expect([respuesta.status, respuesta.body]).toEqual([200, { requiere_confirmacion: true, afectados: 4 }]);
      expect(casos.inactivar.llamadas).toEqual([{ rolId: ROL, confirmado: false }]);
    });

    it('sin confirmado responde 400', async () => {
      const respuesta = await http().post(`/seg/roles/${ROL}/inactivar`).send({});

      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['confirmado'] }]);
    });
  });

  it('GET /seg/productos-disponibles responde { items }', async () => {
    casos.productos.responde([{ codigo: 'PLAT', nombre: 'Plataforma' }]);

    const respuesta = await http().get('/seg/productos-disponibles');

    expect([respuesta.status, respuesta.body]).toEqual([200, { items: [{ codigo: 'PLAT', nombre: 'Plataforma' }] }]);
  });

  describe('GET /seg/catalogo/:productoCodigo', () => {
    it('responde el árbol en snake_case', async () => {
      const permiso = { codigo: 'rest.mesa.ver', descripcion: 'Ver mesas', sensible: false, alcanceMinimo: 'UNIDAD' };
      casos.catalogo.responde({
        productoCodigo: 'REST',
        modulos: [{ codigo: 'salon', nombre: 'Salón', opciones: [{ codigo: 'rest.salon.mesas', nombre: 'Mesas', permisos: [permiso] }] }],
        otros: [{ ...permiso, codigo: 'rest.reporte.ver', sensible: true }],
      });

      const respuesta = await http().get('/seg/catalogo/REST');

      const permisoDto = { codigo: 'rest.mesa.ver', descripcion: 'Ver mesas', sensible: false, alcance_minimo: 'UNIDAD' };
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        producto_codigo: 'REST',
        modulos: [{ codigo: 'salon', nombre: 'Salón', opciones: [{ codigo: 'rest.salon.mesas', nombre: 'Mesas', permisos: [permisoDto] }] }],
        otros: [{ ...permisoDto, codigo: 'rest.reporte.ver', sensible: true }],
      });
      expect(casos.catalogo.llamadas).toEqual(['REST']);
    });

    it('un código de producto mal formado responde 400 sin llamar al caso de uso', async () => {
      const respuesta = await http().get('/seg/catalogo/rest');

      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['productoCodigo'] }]);
      expect(casos.catalogo.llamadas).toEqual([]);
    });
  });
});
