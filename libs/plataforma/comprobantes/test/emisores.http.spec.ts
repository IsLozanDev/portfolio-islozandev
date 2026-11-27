import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { PermisoGuard } from '@vitrina/plataforma/seguridad';
import request from 'supertest';
import { BYTES_MAXIMOS_CERTIFICADO, CargarCertificado } from '../src/application/cargar-certificado.js';
import { ConfigurarEmisor } from '../src/application/configurar-emisor.js';
import { ConsultarEmisor } from '../src/application/consultar-emisor.js';
import { HabilitarProduccion } from '../src/application/habilitar-produccion.js';
import { ListarEmisores } from '../src/application/listar-emisores.js';
import { SolicitarPruebaEmisor } from '../src/application/solicitar-prueba-emisor.js';
import { Emisor } from '../src/domain/emisor.js';
import { PERMISOS_FE } from '../src/domain/permisos-fe.js';
import { EmisoresController } from '../src/interface/emisores.controller.js';
import { bytesAleatorios, CLAVE_PFX, crearPfx, enDias, OTRO_RUC, sujetoConRuc, textoPlano } from './support/certificados.js';
import {
  AHORA,
  crearDobles,
  EMPRESA,
  EMPRESA_DE_B,
  EMPRESA_INACTIVA,
  NUBEFACT,
  TENANT_A,
  URL_NUBEFACT,
  URL_SIMULADOR,
  USUARIO,
  type Dobles,
} from './support/dobles.js';

const SUCURSAL = '0193f3a0-0000-7000-8000-000000000102';
const MFA_MAX_EDAD_SEG = 900;
const CLAVE_PROVEEDOR = 'clave-del-proveedor-sol';
const RUTA = `/v1/fe/emisores/${EMPRESA}`;
const ahora = new Date(AHORA);
const cuerpoConfigurar = {
  proveedor: 'SIMULADO',
  usuario_proveedor: 'MODDATOS',
  clave: CLAVE_PROVEEDOR,
  regimen_igv: 'GENERAL',
  url_proveedor: URL_SIMULADOR,
};

/** Hace lo que deja AutenticacionGuard. `x-prueba-aal: aal1` simula un token sin MFA. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    const aal = solicitud.headers['x-prueba-aal'] ?? 'aal2';
    const amr = aal === 'aal2' ? [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }] : [];
    solicitud.principal = { usuarioId: USUARIO, tenantId: TENANT_A, tipo: 'INTERNO', aal, sesionId: 'sesion', amr };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/fe/emisores (TR-RF-052)', () => {
  let app: INestApplication;
  let dobles: Dobles;
  let permisosDelActor: string[];
  let documento: OpenAPIObject;
  const http = () => request(app.getHttpServer());
  const put = (cuerpo: object, ruta = RUTA) => http().put(ruta).set('X-Sucursal-Id', SUCURSAL).send(cuerpo);
  const subir = (pfx: Uint8Array, clave = CLAVE_PFX) =>
    http().post(`${RUTA}/certificado`).set('X-Sucursal-Id', SUCURSAL).field('clave', clave).attach('archivo', Buffer.from(pfx), 'certificado.pfx');

  beforeAll(async () => {
    dobles = crearDobles();
    const modulo = await Test.createTestingModule({
      controllers: [EmisoresController],
      providers: [
        { provide: ConsultarEmisor, useValue: new ConsultarEmisor(dobles) },
        { provide: ConfigurarEmisor, useValue: new ConfigurarEmisor(dobles) },
        { provide: CargarCertificado, useValue: new CargarCertificado(dobles) },
        { provide: SolicitarPruebaEmisor, useValue: new SolicitarPruebaEmisor(dobles) },
        { provide: HabilitarProduccion, useValue: new HabilitarProduccion(dobles) },
        { provide: ListarEmisores, useValue: new ListarEmisores(dobles) },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async (permiso: string) => permiso === PERMISOS_FE.configurar } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT_A }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(
      new PrincipalDePrueba(),
      new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG),
    );
    app.setGlobalPrefix('v1');
    await app.init();
    documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  });

  beforeEach(() => {
    permisosDelActor = [PERMISOS_FE.configurar, PERMISOS_FE.consultar];
    dobles.reloj.instante = new Date(AHORA);
    dobles.emisores.filas = [];
    dobles.boveda.secretos.clear();
    dobles.publicador.eventos.length = 0;
    dobles.auditoria.entradas.length = 0;
  });

  afterAll(() => app?.close());

  it('TR-CA-133: PUT con SIMULADO crea (201) en BORRADOR y el .pfx vigente lo deja CONFIGURADO (200) con un solo evento', async () => {
    const creado = await put(cuerpoConfigurar);
    expect(creado.status).toBe(201);
    expect(creado.body).toMatchObject({ estado: 'BORRADOR', tiene_credencial: true, certificado: null, version: 1 });

    const cargado = await subir(crearPfx(ahora));
    expect(cargado.status).toBe(200);
    expect(cargado.body).toMatchObject({ estado: 'CONFIGURADO', certificado: { ruc: '20601234561', huella_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(dobles.publicador.tipos()).toEqual(['fe.emisor.configurado']);

    const consultado = await http().get(RUTA).set('X-Sucursal-Id', SUCURSAL);
    expect(consultado.status).toBe(200);
    expect(consultado.body).toEqual(cargado.body);
    // Ninguna respuesta lleva las claves.
    expect(JSON.stringify([creado.body, cargado.body, consultado.body])).not.toMatch(new RegExp(`${CLAVE_PROVEEDOR}|${CLAVE_PFX}|secreto`));
  });

  it('PUT con el emisor existente: 200 con la versión; versión vieja → 409 VERSION_OBSOLETA', async () => {
    await put(cuerpoConfigurar);
    const actualizado = await put({ ...cuerpoConfigurar, clave: undefined, leyenda_pie: 'Gracias', version: 1 });
    expect([actualizado.status, actualizado.body.version, actualizado.body.leyenda_pie]).toEqual([200, 2, 'Gracias']);

    const viejo = await put({ ...cuerpoConfigurar, version: 1 });
    expect([viejo.status, viejo.body.codigo]).toEqual([409, 'VERSION_OBSOLETA']);
  });

  it('empresa de otro tenant → 404; inactiva → 409; proveedor fuera de PROVEEDOR_FE → 400; cuerpo inválido → 400 sin valores', async () => {
    expect((await put(cuerpoConfigurar, `/v1/fe/emisores/${EMPRESA_DE_B}`)).body).toMatchObject({ codigo: 'EMPRESA_NO_ENCONTRADA' });
    expect((await put(cuerpoConfigurar, `/v1/fe/emisores/${EMPRESA_DE_B}`)).status).toBe(404);
    const inactiva = await put(cuerpoConfigurar, `/v1/fe/emisores/${EMPRESA_INACTIVA}`);
    expect([inactiva.status, inactiva.body.codigo]).toEqual([409, 'EMPRESA_INACTIVA']);
    const proveedor = await put({ ...cuerpoConfigurar, proveedor: 'OTRO_PSE' });
    expect([proveedor.status, proveedor.body.codigo]).toEqual([400, 'PROVEEDOR_FE_INVALIDO']);

    const invalido = await put({ ...cuerpoConfigurar, clave: 'x'.repeat(201), regimen_igv: 'MYPE' });
    expect([invalido.status, invalido.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['clave', 'regimen_igv'] }]);
    expect(JSON.stringify(invalido.body)).not.toContain('xxxx');
    expect((await http().get('/v1/fe/emisores/no-es-uuid').set('X-Sucursal-Id', SUCURSAL)).status).toBe(400);
  });

  it('GET sin emisor → 404 EMISOR_NO_ENCONTRADO', async () => {
    const respuesta = await http().get(RUTA).set('X-Sucursal-Id', SUCURSAL);
    expect([respuesta.status, respuesta.body.codigo]).toEqual([404, 'EMISOR_NO_ENCONTRADO']);
  });

  it('certificado: otro RUC → 422 con el mensaje de TR-CA-134; vencido → 422; clave incorrecta → 400; no PKCS#12 → 400', async () => {
    await put(cuerpoConfigurar);

    const otroRuc = await subir(crearPfx(ahora, { sujeto: sujetoConRuc(OTRO_RUC) }));
    expect([otroRuc.status, otroRuc.body]).toEqual([422, { codigo: 'CERTIFICADO_OTRO_RUC', mensaje: 'El certificado no corresponde al RUC de la empresa' }]);
    const vencido = await subir(crearPfx(ahora, { emitidoEn: enDias(ahora, -400), venceEn: enDias(ahora, -1) }));
    expect([vencido.status, vencido.body.codigo]).toEqual([422, 'CERTIFICADO_VENCIDO']);
    const clave = await subir(crearPfx(ahora), 'clave-equivocada');
    expect([clave.status, clave.body.codigo]).toEqual([400, 'CLAVE_CERTIFICADO_INCORRECTA']);
    expect(JSON.stringify(clave.body)).not.toContain('clave-equivocada');
    const texto = await subir(textoPlano());
    expect([texto.status, texto.body.codigo]).toEqual([400, 'ARCHIVO_CERTIFICADO_INVALIDO']);
    expect(dobles.boveda.secretos.size).toBe(1);
  });

  it('certificado de más de 50 KB → 413 sin tocar la bóveda; sin archivo o sin clave → 400', async () => {
    await put(cuerpoConfigurar);
    const grande = await subir(bytesAleatorios(BYTES_MAXIMOS_CERTIFICADO + 1));
    expect([grande.status, grande.body.codigo]).toEqual([413, 'ARCHIVO_DEMASIADO_GRANDE']);

    const sinArchivo = await http().post(`${RUTA}/certificado`).set('X-Sucursal-Id', SUCURSAL).field('clave', CLAVE_PFX);
    expect([sinArchivo.status, sinArchivo.body.errores]).toEqual([400, ['archivo']]);
    const sinClave = await http().post(`${RUTA}/certificado`).set('X-Sucursal-Id', SUCURSAL).attach('archivo', Buffer.from(textoPlano()), 'c.pfx');
    expect([sinClave.status, sinClave.body.errores]).toEqual([400, ['clave']]);
    expect(dobles.boveda.secretos.size).toBe(1);
  });

  it('sin aal2, PUT y POST .../certificado → 401 de step-up; GET con solo plat.fe.consultar → 200 sin aal2', async () => {
    await put(cuerpoConfigurar);
    const sinMfa = await put({ ...cuerpoConfigurar, version: 1 }).set('x-prueba-aal', 'aal1');
    expect(sinMfa.status).toBe(401);
    expect(sinMfa.headers['www-authenticate']).toContain('acr_values="aal2"');
    const subidaSinMfa = await subir(crearPfx(ahora)).set('x-prueba-aal', 'aal1');
    expect(subidaSinMfa.status).toBe(401);

    permisosDelActor = [PERMISOS_FE.consultar];
    const consultado = await http().get(RUTA).set('X-Sucursal-Id', SUCURSAL).set('x-prueba-aal', 'aal1');
    expect(consultado.status).toBe(200);
  });

  it('spec 62: GET /v1/fe/emisores con solo plat.fe.consultar y aal1 → 200; sin el permiso → 403', async () => {
    await put(cuerpoConfigurar);
    permisosDelActor = [PERMISOS_FE.consultar];
    const lista = await http().get('/v1/fe/emisores').set('X-Sucursal-Id', SUCURSAL).set('x-prueba-aal', 'aal1');
    expect(lista.status).toBe(200);
    expect(lista.body).toEqual([
      {
        empresa_id: EMPRESA,
        ruc: '20601234561',
        razon_social: 'EMPRESA DE PRUEBA SAC',
        emisor: { estado: 'BORRADOR', proveedor: 'SIMULADO', ambiente: 'BETA', certificado_vence_en: null, prueba_estado: null },
      },
    ]);
    expect(JSON.stringify(lista.body)).not.toMatch(/MODDATOS|huella|url|clave|secreto/);

    permisosDelActor = [PERMISOS_FE.configurar];
    expect((await http().get('/v1/fe/emisores').set('X-Sucursal-Id', SUCURSAL)).status).toBe(403);
  });

  it('sin plat.fe.configurar → 403 en PUT y POST; sin plat.fe.consultar → 403 en GET', async () => {
    permisosDelActor = [PERMISOS_FE.consultar];
    expect((await put(cuerpoConfigurar)).status).toBe(403);
    expect((await subir(crearPfx(ahora))).status).toBe(403);
    permisosDelActor = [PERMISOS_FE.configurar];
    expect((await http().get(RUTA).set('X-Sucursal-Id', SUCURSAL)).status).toBe(403);
  });

  describe('spec 50: prueba en beta y producción', () => {
    const cuerpoNubefact = { ...cuerpoConfigurar, proveedor: NUBEFACT, url_proveedor: URL_NUBEFACT };
    const prueba = () => http().post(`${RUTA}/prueba`).set('X-Sucursal-Id', SUCURSAL);
    const produccion = () => http().post(`${RUTA}/produccion`).set('X-Sucursal-Id', SUCURSAL);
    /** Lo que hace el worker al recibir el ACEPTADO del PSE. */
    const aceptarPrueba = () => {
      const emisor = Emisor.reconstituir(dobles.emisores.filas[0].datos);
      const numero = emisor.prueba?.numero ?? 0;
      emisor.registrarResultadoPrueba(numero, { resultado: 'ACEPTADO', codigo: '0', descripcion: null, observaciones: [] }, dobles.reloj.now());
      dobles.emisores.filas[0] = emisor;
    };

    it('TR-CA-133: POST .../prueba → 202 EN_PROCESO; aceptada, POST .../produccion → 200 en PRODUCCION', async () => {
      expect((await put(cuerpoNubefact)).body.estado).toBe('CONFIGURADO');
      const solicitada = await prueba();
      expect(solicitada.status).toBe(202);
      expect(solicitada.body.prueba).toMatchObject({ estado: 'EN_PROCESO', numero: 1, resultado_en: null });
      expect((await produccion()).body.codigo).toBe('PRUEBA_BETA_REQUERIDA');

      aceptarPrueba();
      const habilitada = await produccion();
      expect(habilitada.status).toBe(200);
      expect(habilitada.body).toMatchObject({ estado: 'PRODUCCION', ambiente: 'PRODUCCION', url_proveedor: URL_NUBEFACT, produccion_habilitada_en: AHORA });
      expect(JSON.stringify([solicitada.body, habilitada.body])).not.toContain(CLAVE_PROVEEDOR);
    });

    it('409 PRUEBA_EN_CURSO y ESTADO_EMISOR_INVALIDO; 409 PROVEEDOR_SIMULADO_EN_PRODUCCION; 404 sin emisor', async () => {
      const sinEmisor = await prueba();
      expect([sinEmisor.status, sinEmisor.body.codigo]).toEqual([404, 'EMISOR_NO_ENCONTRADO']);
      await put(cuerpoConfigurar);
      const borrador = await prueba();
      expect([borrador.status, borrador.body.codigo]).toEqual([409, 'ESTADO_EMISOR_INVALIDO']);

      await subir(crearPfx(ahora));
      expect((await prueba()).status).toBe(202);
      const enCurso = await prueba();
      expect([enCurso.status, enCurso.body.codigo]).toEqual([409, 'PRUEBA_EN_CURSO']);
      aceptarPrueba();
      const simulado = await produccion();
      expect([simulado.status, simulado.body.codigo]).toEqual([409, 'PROVEEDOR_SIMULADO_EN_PRODUCCION']);
    });

    it('PUT: URL fuera de los dominios → 400 URL_PROVEEDOR_NO_PERMITIDA; en producción cambiar la URL → 409 EMISOR_EN_PRODUCCION', async () => {
      const otraUrl = await put({ ...cuerpoNubefact, url_proveedor: 'https://169.254.169.254/latest' });
      expect([otraUrl.status, otraUrl.body.codigo]).toEqual([400, 'URL_PROVEEDOR_NO_PERMITIDA']);
      expect(JSON.stringify(otraUrl.body)).not.toContain('169.254');

      await put(cuerpoNubefact);
      await prueba();
      aceptarPrueba();
      await produccion();
      const version = dobles.emisores.filas[0].version;
      const cambio = await put({ ...cuerpoNubefact, url_proveedor: `${URL_NUBEFACT}0`, version });
      expect([cambio.status, cambio.body.codigo]).toEqual([409, 'EMISOR_EN_PRODUCCION']);
      const rotacion = await put({ ...cuerpoNubefact, clave: 'token-rotado', version });
      expect([rotacion.status, rotacion.body.estado]).toEqual([200, 'PRODUCCION']);
    });

    it('sin aal2 → 401 de step-up; sin plat.fe.configurar → 403', async () => {
      await put(cuerpoNubefact);
      for (const llamada of [prueba, produccion]) {
        const sinMfa = await llamada().set('x-prueba-aal', 'aal1');
        expect(sinMfa.status).toBe(401);
        expect(sinMfa.headers['www-authenticate']).toContain('acr_values="aal2"');
      }
      permisosDelActor = [PERMISOS_FE.consultar];
      expect((await prueba()).status).toBe(403);
      expect((await produccion()).status).toBe(403);
    });
  });

  it('OpenAPI documenta las rutas con sus códigos de error y la respuesta no tiene campos de clave', () => {
    const ruta = documento.paths['/v1/fe/emisores/{empresaId}'];
    const certificado = documento.paths['/v1/fe/emisores/{empresaId}/certificado'];
    expect(Object.keys(ruta.get?.responses ?? {}).sort()).toEqual(['200', '400', '401', '403', '404']);
    expect(Object.keys(ruta.put?.responses ?? {}).sort()).toEqual(['200', '201', '400', '401', '403', '404', '409', '503']);
    expect(Object.keys(certificado.post?.responses ?? {}).sort()).toEqual(['200', '400', '401', '403', '404', '409', '413', '422', '503']);
    const prueba = documento.paths['/v1/fe/emisores/{empresaId}/prueba'];
    const produccion = documento.paths['/v1/fe/emisores/{empresaId}/produccion'];
    expect(Object.keys(prueba.post?.responses ?? {}).sort()).toEqual(['202', '400', '401', '403', '404', '409']);
    expect(Object.keys(produccion.post?.responses ?? {}).sort()).toEqual(['200', '400', '401', '403', '404', '409', '422']);
    expect(JSON.stringify(ruta.put?.responses)).toMatch(/URL_PROVEEDOR_NO_PERMITIDA[\s\S]*EMISOR_EN_PRODUCCION/);

    const esquemas = documento.components?.schemas ?? {};
    const propiedades = (nombre: string) => Object.keys((esquemas[nombre] as { properties?: object }).properties ?? {});
    for (const nombre of ['EmisorDto', 'CertificadoEmisorDto', 'PruebaEmisorDto']) {
      expect(propiedades(nombre).filter((campo) => /clave|secreto|pfx|token/.test(campo))).toEqual([]);
    }
    const lista = documento.paths['/v1/fe/emisores'].get;
    expect(Object.keys(lista?.responses ?? {}).sort()).toEqual(['200', '401', '403']);
    expect(JSON.stringify(lista?.parameters ?? [])).not.toContain('empresaId');
    expect(propiedades('EmpresaConEmisorDto')).toEqual(['empresa_id', 'ruc', 'razon_social', 'emisor']);
    expect(propiedades('ResumenEmisorDto')).toEqual(['estado', 'proveedor', 'ambiente', 'certificado_vence_en', 'prueba_estado']);
    expect(propiedades('ConfigurarEmisorDto')).toContain('url_proveedor');
    expect(propiedades('ConfigurarEmisorDto')).toContain('clave');
  });
});
