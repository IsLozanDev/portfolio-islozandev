import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { PermisoGuard } from '@vitrina/plataforma/seguridad';
import request from 'supertest';
import { ConsultarPlantilla } from '../src/application/plantillas/consultar-plantilla.js';
import { ListarPlantillas } from '../src/application/plantillas/listar-plantillas.js';
import { ListarVersionesPlantilla } from '../src/application/plantillas/listar-versiones-plantilla.js';
import { PersonalizarPlantilla } from '../src/application/plantillas/personalizar-plantilla.js';
import { RestaurarPlantillaBase } from '../src/application/plantillas/restaurar-plantilla-base.js';
import { VistaPreviaPlantilla } from '../src/application/plantillas/vista-previa-plantilla.js';
import { PERMISOS_PLANTILLAS } from '../src/domain/permisos-not.js';
import { PlantillasController } from '../src/interface/plantillas.controller.js';
import { escenario, PLANTILLA_PRUEBA, TENANT_A } from './support/dobles.js';

const SUCURSAL = '0193f3a0-0000-7000-8000-000000000102';
const USUARIO = '43000000-0000-7000-8000-0000000000f1';
const MFA_MAX_EDAD_SEG = 900;
const RUTA = '/v1/notificaciones/plantillas';
const DETALLE = `${RUTA}/PRUEBA_CORREO/CORREO`;
const cuerpoPut = { asunto: 'Asunto propio de {{producto}}', cuerpo: '<p>Hola {{nombre}}</p>', version: null };

/** Lo que deja AutenticacionGuard: un token aal1 basta, ningún permiso de plantillas es sensible. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    contexto.switchToHttp().getRequest().principal = { usuarioId: USUARIO, tenantId: TENANT_A, tipo: 'INTERNO', aal: 'aal1', sesionId: 'sesion', amr: [] };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/notificaciones/plantillas (spec 43)', () => {
  let app: INestApplication;
  let mundo: ReturnType<typeof escenario>;
  let permisosDelActor: string[];
  let documento: OpenAPIObject;
  const http = () => request(app.getHttpServer());
  const conSucursal = <Solicitud extends { set(nombre: string, valor: string): Solicitud }>(solicitud: Solicitud) =>
    solicitud.set('X-Sucursal-Id', SUCURSAL);
  const put = (cuerpo: object, ruta = DETALLE) => conSucursal(http().put(ruta)).send(cuerpo);
  const get = (ruta: string) => conSucursal(http().get(ruta));

  beforeAll(async () => {
    mundo = escenario();
    const casoDeUso = <CasoDeUso>(clase: new (dependencias: typeof mundo.gestionPlantillas) => CasoDeUso) => ({
      provide: clase,
      useFactory: () => new clase(mundo.gestionPlantillas),
    });
    const modulo = await Test.createTestingModule({
      controllers: [PlantillasController],
      providers: [
        casoDeUso(ListarPlantillas),
        casoDeUso(ConsultarPlantilla),
        casoDeUso(ListarVersionesPlantilla),
        casoDeUso(VistaPreviaPlantilla),
        casoDeUso(PersonalizarPlantilla),
        casoDeUso(RestaurarPlantillaBase),
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async () => false } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contextoGuard: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT_A }), run: (_alcance, trabajo) => trabajo() };
    // El ContextoTenantInterceptor global de la API: el caso de uso corre con el tenant y el actor del token.
    app.use((_solicitud: unknown, _respuesta: unknown, siguiente: () => void) => mundo.contexto.run({ tenantId: TENANT_A, actorId: USUARIO }, async () => siguiente()));
    app.useGlobalGuards(
      new PrincipalDePrueba(),
      new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contextoGuard, MFA_MAX_EDAD_SEG),
    );
    app.setGlobalPrefix('v1');
    await app.init();
    documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  });

  beforeEach(() => {
    permisosDelActor = Object.values(PERMISOS_PLANTILLAS);
    mundo.plantillas.plantillas = [PLANTILLA_PRUEBA];
    mundo.auditoria.entradas.length = 0;
  });

  afterAll(() => app?.close());

  it('GET lista y detalle; PUT guarda la versión 1 con el cuerpo saneado; GET muestra origen PERSONALIZADA', async () => {
    const lista = await get(RUTA);
    expect([lista.status, lista.body.total, lista.body.items[0]]).toEqual([
      200,
      1,
      expect.objectContaining({ codigo: 'PRUEBA_CORREO', canal: 'CORREO', idioma: 'es', origen: 'BASE', version: 1 }),
    ]);
    const base = await get(DETALLE);
    expect(base.body).toMatchObject({ origen: 'BASE', version: null, variables: [{ nombre: 'nombre', tipo: 'texto', ejemplo: 'María Quispe' }, expect.anything()] });

    const guardada = await put({ ...cuerpoPut, cuerpo: '<p onclick="x()">Hola {{nombre}}</p><script>alert(1)</script><a href="javascript:alert(1)">y</a>' });
    expect([guardada.status, guardada.body.version, guardada.body.cuerpo]).toEqual([200, 1, '<p>Hola {{nombre}}</p><a>y</a>']);
    expect((await get(DETALLE)).body).toMatchObject({ origen: 'PERSONALIZADA', version: 1, base: { cuerpo: PLANTILLA_PRUEBA.cuerpo } });
    expect((await get(`${DETALLE}/versiones`)).body).toEqual([{ version: 1, activa: true, creado_por: USUARIO, creado_en: expect.any(String) }]);
  });

  it('TR-CA-185: PUT y vista previa con {{diagnostico}} → 400 VARIABLE_NO_PERMITIDA con variables; no se guarda', async () => {
    const esperado = { codigo: 'VARIABLE_NO_PERMITIDA', mensaje: 'Variable no permitida: diagnostico', variables: ['diagnostico'] };

    const enPut = await put({ ...cuerpoPut, cuerpo: '<p>{{diagnostico}}</p>' });
    const enPrevia = await conSucursal(http().post(`${DETALLE}/vista-previa`)).send({ cuerpo: '<p>{{diagnostico}}</p>' });

    expect([enPut.status, enPut.body]).toEqual([400, esperado]);
    expect([enPrevia.status, enPrevia.body]).toEqual([400, esperado]);
    expect(mundo.plantillas.plantillas).toHaveLength(1);
  });

  it('PUT con versión vieja → 409 VERSION_OBSOLETA; DELETE restaura (204) y sin personalización → 404 SIN_PERSONALIZACION', async () => {
    await put(cuerpoPut);
    expect((await put({ ...cuerpoPut, version: 1 })).body.version).toBe(2);

    const vieja = await put({ ...cuerpoPut, version: 1 });
    expect([vieja.status, vieja.body.codigo]).toEqual([409, 'VERSION_OBSOLETA']);

    expect((await conSucursal(http().delete(`${DETALLE}/personalizacion`))).status).toBe(204);
    expect((await get(DETALLE)).body).toMatchObject({ origen: 'BASE', version: null });
    const otraVez = await conSucursal(http().delete(`${DETALLE}/personalizacion`));
    expect([otraVez.status, otraVez.body.codigo]).toEqual([404, 'SIN_PERSONALIZACION']);
    expect(mundo.auditoria.entradas.map((entrada) => entrada.accion)).toEqual([
      'plat.plantilla_notificacion.personalizar',
      'plat.plantilla_notificacion.personalizar',
      'plat.plantilla_notificacion.restaurar',
    ]);
  });

  it('vista previa: 200 con los ejemplos, sin guardar ni registrar mensaje', async () => {
    const previa = await conSucursal(http().post(`${DETALLE}/vista-previa`)).send({});

    expect([previa.status, previa.body]).toEqual([200, { asunto: 'Prueba de correo de SazónPOS', cuerpo_html: '<p>Hola María Quispe:</p><p>Prueba de SazónPOS.</p>' }]);
    expect(mundo.mensajes.filas.size).toBe(0);
    expect(mundo.plantillas.plantillas).toHaveLength(1);
  });

  it.each([
    ['asunto vacío', { asunto: '' }],
    ['asunto de 151 caracteres', { asunto: 'a'.repeat(151) }],
    ['asunto con salto de línea', { asunto: 'a\nb' }],
    ['cuerpo vacío', { cuerpo: '' }],
  ])('%s → 400 CONTENIDO_PLANTILLA_INVALIDO', async (_caso, cambios) => {
    const respuesta = await put({ ...cuerpoPut, ...cambios });
    expect([respuesta.status, respuesta.body.codigo]).toEqual([400, 'CONTENIDO_PLANTILLA_INVALIDO']);
  });

  it('código sin base → 404; canal SMS → 400 CANAL_NO_HABILITADO; cuerpo mal formado → 400 SOLICITUD_INVALIDA', async () => {
    const sinBase = await get(`${RUTA}/NO_EXISTE/CORREO`);
    expect([sinBase.status, sinBase.body.codigo]).toEqual([404, 'PLANTILLA_NO_ENCONTRADA']);
    const sms = await put(cuerpoPut, `${RUTA}/PRUEBA_CORREO/SMS`);
    expect([sms.status, sms.body.codigo]).toEqual([400, 'CANAL_NO_HABILITADO']);
    expect((await get(`${RUTA}?canal=SMS`)).body.codigo).toBe('CANAL_NO_HABILITADO');
    const malFormado = await put({ asunto: 1, cuerpo: 'x' });
    expect([malFormado.status, malFormado.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['asunto', 'version'] }]);
  });

  it('sin consultar → 403 en las lecturas y la vista previa; sin gestionar → 403 en PUT y DELETE', async () => {
    permisosDelActor = [PERMISOS_PLANTILLAS.gestionar];
    expect((await get(RUTA)).status).toBe(403);
    expect((await get(DETALLE)).status).toBe(403);
    expect((await get(`${DETALLE}/versiones`)).status).toBe(403);
    expect((await conSucursal(http().post(`${DETALLE}/vista-previa`)).send({})).status).toBe(403);

    permisosDelActor = [PERMISOS_PLANTILLAS.consultar];
    expect((await put(cuerpoPut)).status).toBe(403);
    expect((await conSucursal(http().delete(`${DETALLE}/personalizacion`))).status).toBe(403);
    expect(mundo.plantillas.plantillas).toHaveLength(1);
  });

  it('OpenAPI documenta las seis rutas con sus códigos de error', () => {
    const codigos = (ruta: string, metodo: 'get' | 'put' | 'post' | 'delete') => Object.keys(documento.paths[ruta]?.[metodo]?.responses ?? {}).sort();

    expect(codigos(RUTA, 'get')).toEqual(['200', '400', '401', '403']);
    expect(codigos(`${RUTA}/{codigo}/{canal}`, 'get')).toEqual(['200', '400', '401', '403', '404']);
    expect(codigos(`${RUTA}/{codigo}/{canal}/versiones`, 'get')).toEqual(['200', '400', '401', '403']);
    expect(codigos(`${RUTA}/{codigo}/{canal}/vista-previa`, 'post')).toEqual(['200', '400', '401', '403', '404']);
    expect(codigos(`${RUTA}/{codigo}/{canal}`, 'put')).toEqual(['200', '400', '401', '403', '404', '409']);
    expect(codigos(`${RUTA}/{codigo}/{canal}/personalizacion`, 'delete')).toEqual(['204', '400', '401', '403', '404']);
  });
});
