import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { PERMISO, PermisoGuard } from '@vitrina/plataforma/seguridad';
import { ConsultarDocumento } from '../src/application/consultar-documento.js';
import { IdentidadController } from '../src/interface/identidad.controller.js';
import { DECOLECTA, TENANT_A, USUARIO, crearDobles, type Dobles } from './support/dobles.js';

const SUCURSAL = '0193f3a0-0000-7000-8000-000000000102';
const MFA_MAX_EDAD_SEG = 900;
const VALIDAR = 'plat.identidad.validar';
const CONSULTAR = 'plat.identidad.consultar';

/** Hace lo que deja AutenticacionGuard: el principal del token. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    solicitud.principal = { usuarioId: USUARIO, tenantId: TENANT_A, tipo: 'INTERNO', aal: 'aal1', sesionId: 'sesion', amr: [] };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/identidad con el proveedor falso (TR-RF-044 a 046)', () => {
  let app: INestApplication;
  let dobles: Dobles;
  let permisosDelActor: string[];
  const http = () => request(app.getHttpServer());
  const get = (ruta: string) => http().get(ruta).set('X-Sucursal-Id', SUCURSAL);

  beforeAll(async () => {
    dobles = crearDobles();
    const modulo = await Test.createTestingModule({
      controllers: [IdentidadController],
      providers: [{ provide: ConsultarDocumento, useValue: new ConsultarDocumento(dobles.dependencias) }],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async () => false } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT_A }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(new PrincipalDePrueba(), new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  beforeEach(() => {
    permisosDelActor = [VALIDAR, CONSULTAR];
    dobles.bitacora.registros.length = 0;
    dobles.cache.entradas.clear();
    dobles.configuracion.configurados = [DECOLECTA];
  });

  afterAll(() => app?.close());

  describe('GET /validez', () => {
    it('TR-CA-112: RUC válido', async () => {
      const respuesta = await get('/v1/identidad/RUC/20100070970/validez');
      expect([respuesta.status, respuesta.body]).toEqual([200, { valido: true }]);
    });

    it('TR-CA-113 y 114: inválido sigue siendo 200 con el motivo y no deja bitácora', async () => {
      const ruc = await get('/v1/identidad/RUC/30601234567/validez');
      const dni = await get('/v1/identidad/DNI/4578123A/validez');
      expect([ruc.status, ruc.body, dni.status, dni.body]).toEqual([
        200,
        { valido: false, motivo: 'PREFIJO' },
        200,
        { valido: false, motivo: 'CARACTERES' },
      ]);
      expect(dobles.bitacora.registros).toEqual([]);
    });

    it.each(['CE', 'PAS'])('%s se valida', async (tipo) => {
      const respuesta = await get(`/v1/identidad/${tipo}/AB123456/validez`);
      expect([respuesta.status, respuesta.body]).toEqual([200, { valido: true }]);
    });

    it('un tipo desconocido da 400 SOLICITUD_INVALIDA', async () => {
      const respuesta = await get('/v1/identidad/LIBRETA/12345678/validez');
      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['tipo'] }]);
    });
  });

  describe('GET consulta', () => {
    it('DNI: nombres, apellidos, fuente y fecha; sin el código del proveedor', async () => {
      const respuesta = await get('/v1/identidad/DNI/45781236?motivo=REGISTRO_CLIENTE&producto=POS');
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        nombres: 'Juana',
        apellidos: 'Quispe Mamani',
        fuente: 'PROVEEDOR',
        consultado_en: dobles.reloj.now().toISOString(),
      });
      expect(dobles.bitacora.registros[0]).toMatchObject({ productoCodigo: 'POS', motivo: 'REGISTRO_CLIENTE', usuarioId: USUARIO });
    });

    it('la segunda consulta sale de la caché', async () => {
      await get('/v1/identidad/DNI/45781236?motivo=REGISTRO_CLIENTE');
      const respuesta = await get('/v1/identidad/DNI/45781236?motivo=REGISTRO_CLIENTE');
      expect(respuesta.body.fuente).toBe('CACHE');
    });

    it('TR-CA-118: RUC ACTIVO y HABIDO', async () => {
      const respuesta = await get('/v1/identidad/RUC/20512345671?motivo=EMISION_COMPROBANTE');
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        razon_social: 'Comercial Andina S.A.C.',
        estado: 'ACTIVO',
        condicion: 'HABIDO',
        direccion_fiscal: 'Av. Larco 123, Miraflores',
        ubigeo: '150122',
        apto_factura: true,
        fuente: 'PROVEEDOR',
        consultado_en: dobles.reloj.now().toISOString(),
      });
    });

    it('TR-CA-119: RUC en BAJA DE OFICIO', async () => {
      const respuesta = await get('/v1/identidad/RUC/20498765433?motivo=EMISION_COMPROBANTE');
      expect(respuesta.body).toMatchObject({ apto_factura: false, motivo_no_apto: 'Estado BAJA DE OFICIO' });
    });

    it('422 DOCUMENTO_INVALIDO con el motivo', async () => {
      const respuesta = await get('/v1/identidad/RUC/30601234567?motivo=OTRO');
      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toMatchObject({ codigo: 'DOCUMENTO_INVALIDO', motivo: 'PREFIJO' });
    });

    it.each(['CE', 'PAS'])('%s da 422 TIPO_NO_CONSULTABLE', async (tipo) => {
      const respuesta = await get(`/v1/identidad/${tipo}/001234567?motivo=OTRO`);
      expect([respuesta.status, respuesta.body.codigo]).toEqual([422, 'TIPO_NO_CONSULTABLE']);
    });

    it('404 NO_ENCONTRADO', async () => {
      const respuesta = await get('/v1/identidad/DNI/99999999?motivo=OTRO');
      expect([respuesta.status, respuesta.body.codigo]).toEqual([404, 'NO_ENCONTRADO']);
    });

    it('503 PROVEEDOR_NO_DISPONIBLE si ningún proveedor responde', async () => {
      dobles.configuracion.configurados = [];
      const respuesta = await get('/v1/identidad/DNI/45781236?motivo=OTRO');
      expect([respuesta.status, respuesta.body.codigo]).toEqual([503, 'PROVEEDOR_NO_DISPONIBLE']);
      expect(dobles.bitacora.registros[0]).toMatchObject({ resultado: 'PROVEEDOR_NO_DISPONIBLE' });
    });

    it('TR-CA-121: 429 CUOTA_AGOTADA sin Retry-After si el tenant agotó su cuota', async () => {
      dobles.cuota.disponible = false;
      const respuesta = await get('/v1/identidad/DNI/45781236?motivo=OTRO');
      dobles.cuota.disponible = true;
      expect([respuesta.status, respuesta.body.codigo]).toEqual([429, 'CUOTA_AGOTADA']);
      expect(respuesta.headers['retry-after']).toBeUndefined();
      expect(dobles.bitacora.registros[0]).toMatchObject({ resultado: 'CUOTA_AGOTADA' });
    });

    it.each([
      ['sin motivo', '/v1/identidad/DNI/45781236', ['motivo']],
      ['motivo fuera de la lista', '/v1/identidad/DNI/45781236?motivo=MARKETING', ['motivo']],
      ['producto en minúsculas', '/v1/identidad/DNI/45781236?motivo=OTRO&producto=pos', ['producto']],
      ['número demasiado largo', `/v1/identidad/DNI/${'1'.repeat(21)}?motivo=OTRO`, ['numero']],
    ])('%s da 400 sin llegar al caso de uso', async (_caso, ruta, errores) => {
      const respuesta = await get(ruta);
      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores }]);
      expect(dobles.bitacora.registros).toEqual([]);
    });
  });

  it('sin plat.identidad.consultar la consulta da 403 y no llega al caso de uso; validar sigue', async () => {
    permisosDelActor = [VALIDAR];
    const consulta = await get('/v1/identidad/DNI/45781236?motivo=OTRO');
    const validez = await get('/v1/identidad/DNI/45781236/validez');
    expect([consulta.status, consulta.body.codigo, validez.status]).toEqual([403, 'SIN_PERMISO', 200]);
    expect(dobles.bitacora.registros).toEqual([]);
  });

  it('sin plat.identidad.validar /validez da 403', async () => {
    permisosDelActor = [CONSULTAR];
    const respuesta = await get('/v1/identidad/DNI/45781236/validez');
    expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'SIN_PERMISO']);
  });

  it('cada ruta exige su permiso', () => {
    const reflector = new Reflector();
    const permisoDe = (metodo: 'validez' | 'consultar') => reflector.get(PERMISO, IdentidadController.prototype[metodo]);
    expect([permisoDe('validez'), permisoDe('consultar')]).toEqual([VALIDAR, CONSULTAR]);
  });

  it('las dos rutas están en OpenAPI bajo /v1 con sus códigos de error', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const rutas = documento.paths;
    expect(Object.keys(rutas).sort()).toEqual(['/v1/identidad/{tipo}/{numero}', '/v1/identidad/{tipo}/{numero}/validez']);
    const codigos = (ruta: string) => Object.keys(rutas[ruta].get?.responses ?? {}).sort();
    expect(codigos('/v1/identidad/{tipo}/{numero}/validez')).toEqual(['200', '400', '401', '403']);
    expect(codigos('/v1/identidad/{tipo}/{numero}')).toEqual(['200', '400', '401', '403', '404', '422', '429', '503']);
  });
});
