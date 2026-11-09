import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { ForbiddenError } from '@vitrina/plataforma/kernel';
import { PERMISO, PermisoGuard } from '@vitrina/plataforma/seguridad';
import { ActualizarCatalogo } from '../src/application/actualizar-catalogo.js';
import { AjustarItem } from '../src/application/ajustar-item.js';
import { ConsultarItems } from '../src/application/consultar-items.js';
import { CrearCatalogo } from '../src/application/crear-catalogo.js';
import { EliminarItemGlobal } from '../src/application/eliminar-item-global.js';
import { EliminarItemPropio } from '../src/application/eliminar-item-propio.js';
import { GuardarItemGlobal } from '../src/application/guardar-item-global.js';
import { GuardarItemPropio } from '../src/application/guardar-item-propio.js';
import { ListarCatalogos } from '../src/application/listar-catalogos.js';
import { ListarItemsAdministracion } from '../src/application/listar-items-administracion.js';
import { ObtenerItemGlobal } from '../src/application/obtener-item-global.js';
import {
  AlcanceNoPermiteError,
  CatalogoInvalidoError,
  CatalogoNoExisteError,
  CodigoItemDuplicadoError,
  ItemNoEncontradoError,
  ItemReferenciadoError,
  TablaSoloImportacionError,
  VersionObsoletaError,
} from '../src/domain/errores.js';
import { CatalogosController } from '../src/interface/catalogos.controller.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const SUCURSAL = '0193f3a0-0000-7000-8000-000000000101';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const CATALOGO_ID = '0193f3a0-0000-7000-8000-00000000c001';
const YAPE = '0193f3a0-0000-7000-8000-00000000d002';
const ETAG = '"3.1.2026-10-10"';
const MFA_MAX_EDAD_SEG = 900;
const STEP_UP = `Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=${MFA_MAX_EDAD_SEG}`;
const MILISEGUNDOS_POR_SEGUNDO = 1000;
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);
const PLIN = '0193f3a0-0000-7000-8000-00000000d003';

class OperadorRequeridoDoble extends ForbiddenError {
  override readonly code = 'OPERADOR_REQUERIDO';
}

const medioPago = { id: CATALOGO_ID, codigo: 'MEDIO_PAGO', nombre: 'Medios de pago', alcance: 'MIXTO' as const, fuente: null, editablePorTenant: true, version: 1 };
const medioPagoRespuesta = {
  id: CATALOGO_ID,
  codigo: 'MEDIO_PAGO',
  nombre: 'Medios de pago',
  alcance: 'MIXTO',
  fuente: null,
  editable_por_tenant: true,
  version: 1,
  importable: false,
};
const UBIGEO_ID = '0193f3a0-0000-7000-8000-00000000c002';
const ubigeo = { id: UBIGEO_ID, codigo: 'UBIGEO', nombre: 'Ubigeo', alcance: 'GLOBAL' as const, fuente: 'INEI', editablePorTenant: false, version: 3 };
const yape = {
  id: YAPE,
  codigo: 'YAPE',
  codigoExterno: null,
  nombre: 'Yape',
  abreviatura: null,
  orden: 2,
  atributos: {},
  vigenteDesde: '2026-01-01',
  vigenteHasta: null,
  activo: true,
  version: 0,
};
const plinAdministrado = {
  itemId: PLIN,
  codigo: 'PLIN',
  codigoExterno: null,
  nombre: 'Plin',
  abreviatura: null,
  orden: 3,
  atributos: {},
  vigenteDesde: '2026-01-01',
  vigenteHasta: null,
  activo: true,
  propio: false,
  estado: 'OCULTO',
  ajuste: { visible: false, orden: 9, alias: 'Plin QR', version: 0 },
  version: 0,
};
const yapeRespuesta = {
  id: YAPE,
  codigo: 'YAPE',
  codigo_externo: null,
  nombre: 'Yape',
  abreviatura: null,
  orden: 2,
  atributos: {},
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
  activo: true,
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

describe('HTTP /v1/catalogos (TR-RF-022 a 027)', () => {
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
  const cuerpoItem = { codigo: 'YAPE', nombre: 'Yape', orden: 2, vigente_desde: '2026-01-01' };

  beforeAll(async () => {
    const manifiesto: { permisos: { codigo: string; sensible: boolean }[] } = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
    const sensibles = new Set(manifiesto.permisos.filter((permiso) => permiso.sensible).map((permiso) => permiso.codigo));
    const doble = (nombre: string, respuesta: unknown) => async (comando: unknown) => {
      registrar(nombre, comando);
      return respuesta;
    };
    const modulo = await Test.createTestingModule({
      controllers: [CatalogosController],
      providers: [
        { provide: ListarCatalogos, useValue: { ejecutar: doble('listar', [medioPago, ubigeo]) } },
        { provide: CrearCatalogo, useValue: { ejecutar: doble('crearCatalogo', medioPago) } },
        { provide: ActualizarCatalogo, useValue: { ejecutar: doble('actualizarCatalogo', { ...medioPago, version: 2, cambiado: true }) } },
        {
          provide: ConsultarItems,
          useValue: {
            ejecutar: async (comando: { catalogo: string; siNoCoincide?: string }) => {
              registrar('items', comando);
              if (comando.catalogo !== 'MEDIO_PAGO') throw new CatalogoNoExisteError();
              if (comando.siNoCoincide === ETAG) return { noModificado: true, etag: ETAG };
              return { noModificado: false, etag: ETAG, items: [{ itemId: YAPE, codigo: 'YAPE', codigoExterno: null, nombre: 'Yape QR', atributos: {}, orden: 0 }] };
            },
          },
        },
        { provide: GuardarItemGlobal, useValue: { crear: doble('crearGlobal', yape), actualizar: doble('actualizarGlobal', { ...yape, version: 1, cambiado: true }) } },
        { provide: EliminarItemGlobal, useValue: { ejecutar: doble('eliminarGlobal', undefined) } },
        {
          provide: ObtenerItemGlobal,
          useValue: {
            ejecutar: async (consulta: { catalogo: string; itemId: string }) => {
              registrar('obtenerGlobal', consulta);
              if (consulta.itemId !== YAPE) throw new ItemNoEncontradoError();
              return { ...yape, atributos: { mascara: '999' } };
            },
          },
        },
        { provide: GuardarItemPropio, useValue: { crear: doble('crearPropio', yape), actualizar: doble('actualizarPropio', { ...yape, version: 1, cambiado: false }) } },
        { provide: EliminarItemPropio, useValue: { ejecutar: doble('eliminarPropio', undefined) } },
        {
          provide: ListarItemsAdministracion,
          useValue: {
            ejecutar: async (consulta: { catalogo: string; pagina: number; tamano: number }) => {
              registrar('administracion', consulta);
              if (consulta.catalogo !== 'MEDIO_PAGO') throw new CatalogoNoExisteError();
              return { items: [plinAdministrado], total: 7, pagina: consulta.pagina, tamano: consulta.tamano };
            },
          },
        },
        {
          provide: AjustarItem,
          useValue: { ejecutar: doble('ajustar', { itemId: YAPE, visible: false, orden: null, alias: null, version: 0, cambiado: true }) },
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
    permisosDelActor = [
      'plat.catalogo.gestionar',
      'plat.catalogo.item_gestionar',
      'plat.catalogo.leer',
      'plat.catalogo.personalizar',
      'plat.catalogo.item_propio',
    ];
    for (const nombre of Object.keys(comandos)) delete comandos[nombre];
  });

  afterAll(() => app?.close());

  const rutas = () => ({
    listar: conSucursal(http().get('/v1/catalogos')),
    crearCatalogo: conSucursal(http().post('/v1/catalogos')).send({ codigo: 'MEDIO_PAGO', nombre: 'Medios de pago', alcance: 'MIXTO', editable_por_tenant: true }),
    actualizarCatalogo: conSucursal(http().put('/v1/catalogos/MEDIO_PAGO')).send({ nombre: 'Formas de pago', editable_por_tenant: true, version: 1 }),
    items: conSucursal(http().get('/v1/catalogos/MEDIO_PAGO/items')),
    administracion: conSucursal(http().get('/v1/catalogos/MEDIO_PAGO/items/administracion')),
    crearGlobal: conSucursal(http().post('/v1/catalogos/MEDIO_PAGO/items-globales')).send(cuerpoItem),
    actualizarGlobal: conSucursal(http().put(`/v1/catalogos/MEDIO_PAGO/items-globales/${YAPE}`)).send({ ...cuerpoItem, codigo: undefined, version: 0 }),
    eliminarGlobal: conSucursal(http().delete(`/v1/catalogos/MEDIO_PAGO/items-globales/${YAPE}?version=0`)),
    obtenerGlobal: conSucursal(http().get(`/v1/catalogos/MEDIO_PAGO/items-globales/${YAPE}`)),
    crearPropio: conSucursal(http().post('/v1/catalogos/MEDIO_PAGO/items')).send(cuerpoItem),
    actualizarPropio: conSucursal(http().put(`/v1/catalogos/MEDIO_PAGO/items/${YAPE}`)).send({ ...cuerpoItem, codigo: undefined, version: 0 }),
    eliminarPropio: conSucursal(http().delete(`/v1/catalogos/MEDIO_PAGO/items/${YAPE}?version=0`)),
    ajustar: conSucursal(http().put(`/v1/catalogos/MEDIO_PAGO/items/${YAPE}/ajuste`)).send({ visible: false }),
  });

  it('GET /v1/catalogos lista las definiciones en snake_case, con importable true solo en las tablas oficiales', async () => {
    const respuesta = await rutas().listar;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual([
      medioPagoRespuesta,
      { id: UBIGEO_ID, codigo: 'UBIGEO', nombre: 'Ubigeo', alcance: 'GLOBAL', fuente: 'INEI', editable_por_tenant: false, version: 3, importable: true },
    ]);
  });

  it('GET items-globales/{id} devuelve el ítem con version y atributos', async () => {
    const respuesta = await rutas().obtenerGlobal;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ ...yapeRespuesta, atributos: { mascara: '999' } });
    expect(comandos.obtenerGlobal).toEqual([{ catalogo: 'MEDIO_PAGO', itemId: YAPE }]);
  });

  it('GET items-globales/{id} de un id inexistente o que no es UUID responde 404 ITEM_NO_ENCONTRADO', async () => {
    const [inexistente, noUuid] = await Promise.all([
      conSucursal(http().get(`/v1/catalogos/MEDIO_PAGO/items-globales/${PLIN}`)),
      conSucursal(http().get('/v1/catalogos/MEDIO_PAGO/items-globales/no-es-uuid')),
    ]);
    expect([inexistente.status, inexistente.body]).toEqual([404, { codigo: 'ITEM_NO_ENCONTRADO', mensaje: 'El ítem no existe' }]);
    expect([noUuid.status, noUuid.body.codigo]).toEqual([404, 'ITEM_NO_ENCONTRADO']);
    expect(comandos.obtenerGlobal).toEqual([{ catalogo: 'MEDIO_PAGO', itemId: PLIN }]);
  });

  it('GET items-globales/{id} fuera del operador responde 403 OPERADOR_REQUERIDO', async () => {
    fallo = new OperadorRequeridoDoble('Solo el tenant operador puede administrar catálogos globales');
    const respuesta = await rutas().obtenerGlobal;
    expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'OPERADOR_REQUERIDO']);
  });

  it('POST /v1/catalogos responde 201 con la versión 1 y el actor del token', async () => {
    const respuesta = await rutas().crearCatalogo;
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual(medioPagoRespuesta);
    expect(comandos.crearCatalogo).toEqual([{ codigo: 'MEDIO_PAGO', nombre: 'Medios de pago', alcance: 'MIXTO', fuente: null, editablePorTenant: true, actorId: ANA }]);
  });

  it('TR-CA-059: un GLOBAL editable responde 400 con el mensaje del dominio', async () => {
    fallo = new CatalogoInvalidoError('Un catálogo normativo global no puede ser editable por el tenant');
    const respuesta = await rutas().crearCatalogo;
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'CATALOGO_INVALIDO', mensaje: 'Un catálogo normativo global no puede ser editable por el tenant' });
  });

  it('PUT /v1/catalogos/{codigo} devuelve la versión nueva y cambiado', async () => {
    const respuesta = await rutas().actualizarCatalogo;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ ...medioPagoRespuesta, version: 2, cambiado: true });
    expect(comandos.actualizarCatalogo).toEqual([
      { codigo: 'MEDIO_PAGO', nombre: 'Formas de pago', fuente: null, editablePorTenant: true, version: 1, actorId: ANA },
    ]);
  });

  it('GET items responde 200 con ETag y Cache-Control', async () => {
    const respuesta = await rutas().items;
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.etag).toBe(ETAG);
    expect(respuesta.headers['cache-control']).toBe('private, no-cache');
    expect(respuesta.body).toEqual([{ item_id: YAPE, codigo: 'YAPE', codigo_externo: null, nombre: 'Yape QR', atributos: {}, orden: 0 }]);
  });

  it('TR-CA-064: GET items con If-None-Match igual responde 304 sin cuerpo', async () => {
    const respuesta = await rutas().items.set('If-None-Match', ETAG);
    expect(respuesta.status).toBe(304);
    expect(respuesta.text).toBeFalsy();
    expect(respuesta.headers.etag).toBe(ETAG);
    expect(comandos.items).toEqual([{ catalogo: 'MEDIO_PAGO', siNoCoincide: ETAG }]);
  });

  it('TR-CA-065: GET items de un catálogo inexistente responde 404 CATALOGO_NO_EXISTE', async () => {
    const respuesta = await conSucursal(http().get('/v1/catalogos/NO_EXISTE/items'));
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({ codigo: 'CATALOGO_NO_EXISTE', mensaje: 'El catálogo no existe' });
  });

  it('POST items-globales e items crean con valores por defecto y el actor del token', async () => {
    const [global, propio] = await Promise.all([rutas().crearGlobal, rutas().crearPropio]);
    expect([global.status, propio.status]).toEqual([201, 201]);
    expect(global.body).toEqual(yapeRespuesta);
    const esperado = {
      catalogo: 'MEDIO_PAGO',
      codigo: 'YAPE',
      codigoExterno: null,
      nombre: 'Yape',
      abreviatura: null,
      orden: 2,
      atributos: {},
      vigenteDesde: '2026-01-01',
      vigenteHasta: null,
      activo: true,
      actorId: ANA,
    };
    expect(comandos.crearGlobal).toEqual([esperado]);
    expect(comandos.crearPropio).toEqual([esperado]);
  });

  it('PUT de ítems devuelve version y cambiado; el id va del path', async () => {
    const [global, propio] = await Promise.all([rutas().actualizarGlobal, rutas().actualizarPropio]);
    expect(global.body).toEqual({ ...yapeRespuesta, version: 1, cambiado: true });
    expect(propio.body).toEqual({ ...yapeRespuesta, version: 1, cambiado: false });
    expect(comandos.actualizarGlobal).toEqual([expect.objectContaining({ itemId: YAPE, version: 0, catalogo: 'MEDIO_PAGO' })]);
  });

  it('DELETE responde 204 con la versión de la query', async () => {
    const [global, propio] = await Promise.all([rutas().eliminarGlobal, rutas().eliminarPropio]);
    expect([global.status, propio.status]).toEqual([204, 204]);
    expect(comandos.eliminarGlobal).toEqual([{ catalogo: 'MEDIO_PAGO', itemId: YAPE, version: 0, actorId: ANA }]);
    expect(comandos.eliminarPropio).toEqual([{ catalogo: 'MEDIO_PAGO', itemId: YAPE, version: 0, actorId: ANA }]);
  });

  it('PUT ajuste responde con el ajuste aplicado', async () => {
    const respuesta = await rutas().ajustar;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ item_id: YAPE, visible: false, orden: null, alias: null, version: 0, cambiado: true });
    expect(comandos.ajustar).toEqual([{ catalogo: 'MEDIO_PAGO', itemId: YAPE, visible: false, orden: null, alias: null, version: null, actorId: ANA }]);
  });

  it('GET items/administracion responde la página en snake_case con el ajuste como objeto y los valores por defecto', async () => {
    const respuesta = await rutas().administracion;
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      items: [
        {
          item_id: PLIN,
          codigo: 'PLIN',
          codigo_externo: null,
          nombre: 'Plin',
          abreviatura: null,
          orden: 3,
          atributos: {},
          vigente_desde: '2026-01-01',
          vigente_hasta: null,
          activo: true,
          propio: false,
          estado: 'OCULTO',
          ajuste: { visible: false, orden: 9, alias: 'Plin QR', version: 0 },
          version: 0,
        },
      ],
      total: 7,
      pagina: 1,
      tamano: 25,
    });
    expect(comandos.administracion).toEqual([{ catalogo: 'MEDIO_PAGO', texto: null, estado: null, origen: null, pagina: 1, tamano: 25 }]);
  });

  it('GET items/administracion pasa texto, estado, origen y la página', async () => {
    const respuesta = await conSucursal(http().get('/v1/catalogos/MEDIO_PAGO/items/administracion?texto=pl&estado=OCULTO&origen=GLOBAL&pagina=2&tamano=10'));
    expect(respuesta.status).toBe(200);
    expect(comandos.administracion).toEqual([{ catalogo: 'MEDIO_PAGO', texto: 'pl', estado: 'OCULTO', origen: 'GLOBAL', pagina: 2, tamano: 10 }]);
  });

  it('GET items/administracion de un catálogo inexistente responde 404 CATALOGO_NO_EXISTE', async () => {
    const respuesta = await conSucursal(http().get('/v1/catalogos/NO_EXISTE/items/administracion'));
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({ codigo: 'CATALOGO_NO_EXISTE', mensaje: 'El catálogo no existe' });
  });

  it.each([
    ['tamano=101', ['tamano']],
    ['tamano=0', ['tamano']],
    ['pagina=0', ['pagina']],
    ['estado=BORRADO', ['estado']],
    ['origen=OTRO', ['origen']],
    [`texto=${'x'.repeat(61)}`, ['texto']],
  ])('GET items/administracion?%s da 400 SOLICITUD_INVALIDA', async (query, errores) => {
    const respuesta = await conSucursal(http().get(`/v1/catalogos/MEDIO_PAGO/items/administracion?${query}`));
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores });
    expect(Object.keys(comandos)).toEqual([]);
  });

  it('un id que no es UUID da 404 ITEM_NO_ENCONTRADO sin llegar al caso de uso', async () => {
    const respuestas = await Promise.all([
      conSucursal(http().put('/v1/catalogos/MEDIO_PAGO/items-globales/no-es-uuid')).send({ ...cuerpoItem, version: 0 }),
      conSucursal(http().delete('/v1/catalogos/MEDIO_PAGO/items/no-es-uuid?version=0')),
      conSucursal(http().put('/v1/catalogos/MEDIO_PAGO/items/no-es-uuid/ajuste')).send({ visible: false }),
    ]);
    expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual(Array(3).fill([404, 'ITEM_NO_ENCONTRADO']));
    expect(Object.keys(comandos)).toEqual([]);
  });

  it.each([
    ['POST /v1/catalogos sin alcance', () => conSucursal(http().post('/v1/catalogos')).send({ codigo: 'X_Y', nombre: 'Xyz', editable_por_tenant: true }), ['alcance']],
    ['PUT ítem sin version', () => conSucursal(http().put(`/v1/catalogos/MEDIO_PAGO/items/${YAPE}`)).send({ nombre: 'Yape', vigente_desde: '2026-01-01' }), ['version']],
    ['POST ítem con fecha inválida', () => conSucursal(http().post('/v1/catalogos/MEDIO_PAGO/items')).send({ ...cuerpoItem, vigente_desde: '01/01/2026' }), ['vigente_desde']],
    ['POST ítem con atributos en arreglo', () => conSucursal(http().post('/v1/catalogos/MEDIO_PAGO/items')).send({ ...cuerpoItem, atributos: [8] }), ['atributos']],
    ['DELETE sin version', () => conSucursal(http().delete(`/v1/catalogos/MEDIO_PAGO/items/${YAPE}`)), ['version']],
    ['PUT ajuste sin visible', () => conSucursal(http().put(`/v1/catalogos/MEDIO_PAGO/items/${YAPE}/ajuste`)).send({ alias: 'X' }), ['visible']],
  ])('%s da 400 SOLICITUD_INVALIDA', async (_caso, solicitud, errores) => {
    const respuesta = await solicitud();
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores });
    expect(Object.keys(comandos)).toEqual([]);
  });

  it.each([
    [new OperadorRequeridoDoble('Solo el tenant operador puede administrar catálogos globales'), 403, 'OPERADOR_REQUERIDO'],
    [new VersionObsoletaError(), 409, 'VERSION_OBSOLETA'],
    [new ItemReferenciadoError(), 409, 'ITEM_REFERENCIADO'],
    [new CodigoItemDuplicadoError(), 409, 'CODIGO_DUPLICADO'],
    [new AlcanceNoPermiteError(), 409, 'ALCANCE_NO_PERMITE'],
    [new TablaSoloImportacionError(), 409, 'TABLA_SOLO_IMPORTACION'],
  ])('traduce %s a %i %s', async (error, estado, codigo) => {
    fallo = error;
    const respuesta = await rutas().eliminarGlobal;
    expect(respuesta.status).toBe(estado);
    expect(respuesta.body).toEqual({ codigo, mensaje: error.message });
  });

  describe('con el PermisoGuard real', () => {
    it('sin ningún permiso de catálogos las 13 rutas dan 403 SIN_PERMISO y no llegan al caso de uso', async () => {
      permisosDelActor = ['plat.parametro.leer'];
      const respuestas = await Promise.all(Object.values(rutas()));
      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual(Array(13).fill([403, 'SIN_PERMISO']));
      expect(Object.keys(comandos)).toEqual([]);
    });

    it('sin item_gestionar, GET items-globales/{id} da 403 SIN_PERMISO', async () => {
      permisosDelActor = ['plat.catalogo.leer', 'plat.catalogo.gestionar'];
      const respuesta = await rutas().obtenerGlobal;
      expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'SIN_PERMISO']);
      expect(comandos.obtenerGlobal).toBeUndefined();
    });

    it('con aal1 las 6 rutas de gestionar e item_gestionar dan 401 step-up; las demás responden (TR-RN-009)', async () => {
      const conAal1 = Object.entries(rutas()).map(async ([nombre, solicitud]) => [nombre, (await solicitud.set('x-prueba-aal', 'aal1')).status] as const);
      const estados = Object.fromEntries(await Promise.all(conAal1));
      expect(estados).toEqual({
        listar: 200,
        crearCatalogo: 401,
        actualizarCatalogo: 401,
        items: 200,
        administracion: 200,
        crearGlobal: 401,
        actualizarGlobal: 401,
        eliminarGlobal: 401,
        obtenerGlobal: 401,
        crearPropio: 201,
        actualizarPropio: 200,
        eliminarPropio: 204,
        ajustar: 200,
      });
      const respuesta = await rutas().crearGlobal.set('x-prueba-aal', 'aal1');
      expect([respuesta.body.codigo, respuesta.headers['www-authenticate']]).toEqual(['MFA_REQUERIDA', STEP_UP]);
      expect(comandos.crearGlobal).toBeUndefined();
    });
  });

  it('cada ruta exige su permiso', () => {
    const reflector = new Reflector();
    const permisoDe = (metodo: keyof CatalogosController) => reflector.get(PERMISO, CatalogosController.prototype[metodo]);
    expect({
      listar: permisoDe('listar'),
      crear: permisoDe('crear'),
      actualizar: permisoDe('actualizar'),
      items: permisoDe('items'),
      administracion: permisoDe('administracion'),
      crearItemGlobal: permisoDe('crearItemGlobal'),
      actualizarItemGlobal: permisoDe('actualizarItemGlobal'),
      eliminarGlobal: permisoDe('eliminarGlobal'),
      obtenerGlobal: permisoDe('obtenerGlobal'),
      crearItemPropio: permisoDe('crearItemPropio'),
      actualizarItemPropio: permisoDe('actualizarItemPropio'),
      eliminarPropio: permisoDe('eliminarPropio'),
      ajustar: permisoDe('ajustar'),
    }).toEqual({
      listar: 'plat.catalogo.leer',
      crear: 'plat.catalogo.gestionar',
      actualizar: 'plat.catalogo.gestionar',
      items: 'plat.catalogo.leer',
      administracion: 'plat.catalogo.leer',
      crearItemGlobal: 'plat.catalogo.item_gestionar',
      actualizarItemGlobal: 'plat.catalogo.item_gestionar',
      eliminarGlobal: 'plat.catalogo.item_gestionar',
      obtenerGlobal: 'plat.catalogo.item_gestionar',
      crearItemPropio: 'plat.catalogo.item_propio',
      actualizarItemPropio: 'plat.catalogo.item_propio',
      eliminarPropio: 'plat.catalogo.item_propio',
      ajustar: 'plat.catalogo.personalizar',
    });
  });

  it('las 13 rutas están en OpenAPI con sus códigos de error', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const rutasDoc = documento.paths;
    const codigos = (ruta: string, metodo: 'get' | 'post' | 'put' | 'delete') => Object.keys(rutasDoc[ruta]?.[metodo]?.responses ?? {}).sort();
    expect(Object.keys(rutasDoc).sort()).toEqual([
      '/v1/catalogos',
      '/v1/catalogos/{codigo}',
      '/v1/catalogos/{codigo}/items',
      '/v1/catalogos/{codigo}/items-globales',
      '/v1/catalogos/{codigo}/items-globales/{id}',
      '/v1/catalogos/{codigo}/items/administracion',
      '/v1/catalogos/{codigo}/items/{id}',
      '/v1/catalogos/{codigo}/items/{id}/ajuste',
    ]);
    expect(codigos('/v1/catalogos', 'get')).toEqual(['200', '401', '403']);
    expect(codigos('/v1/catalogos', 'post')).toEqual(['201', '400', '401', '403', '409']);
    expect(codigos('/v1/catalogos/{codigo}', 'put')).toEqual(['200', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/catalogos/{codigo}/items', 'get')).toEqual(['200', '304', '401', '403', '404']);
    expect(codigos('/v1/catalogos/{codigo}/items', 'post')).toEqual(['201', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/catalogos/{codigo}/items/administracion', 'get')).toEqual(['200', '400', '401', '403', '404']);
    expect(codigos('/v1/catalogos/{codigo}/items-globales', 'post')).toEqual(['201', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/catalogos/{codigo}/items-globales/{id}', 'get')).toEqual(['200', '401', '403', '404']);
    expect(codigos('/v1/catalogos/{codigo}/items-globales/{id}', 'put')).toEqual(['200', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/catalogos/{codigo}/items-globales/{id}', 'delete')).toEqual(['204', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/catalogos/{codigo}/items/{id}', 'put')).toEqual(['200', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/catalogos/{codigo}/items/{id}', 'delete')).toEqual(['204', '400', '401', '403', '404', '409']);
    expect(codigos('/v1/catalogos/{codigo}/items/{id}/ajuste', 'put')).toEqual(['200', '400', '401', '403', '404', '409']);
  });
});
