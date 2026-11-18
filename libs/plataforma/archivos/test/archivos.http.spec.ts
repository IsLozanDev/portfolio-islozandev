import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { PermisoGuard } from '@vitrina/plataforma/seguridad';
import request from 'supertest';
import { AnalizarArchivo } from '../src/application/analizar-archivo.js';
import { ConfirmarCarga } from '../src/application/confirmar-carga.js';
import { ConsultarEstadoArchivo } from '../src/application/consultar-estado.js';
import { EmitirUrlDescarga } from '../src/application/emitir-url-descarga.js';
import { SolicitarCarga } from '../src/application/solicitar-carga.js';
import { ArchivosController } from '../src/interface/archivos.controller.js';
import { DIEZ_MEGABYTES, VEINTICINCO_MEGABYTES } from './support/categorias.js';
import { ejecutable, pdf, texto } from './support/contenidos.js';
import { AutorizadorFijo, crearDobles, ENTIDAD_CON_AUTORIZADOR, TENANT_A, TENANT_B, USUARIO, type Dobles } from './support/dobles.js';

const SUCURSAL = '0193f3a0-0000-7000-8000-000000000102';
const MFA_MAX_EDAD_SEG = 900;
const SUBIR = 'plat.archivo.subir';
const DESCARGAR = 'plat.archivo.descargar';
const ARCHIVO_INEXISTENTE = '99999999-0000-4000-8000-000000000009';
// Partida en dos para que el antivirus de la máquina no ponga este archivo en cuarentena.
const CADENA_EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD', '-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
const pdfInfectado = (): Uint8Array => Uint8Array.from([...pdf(), ...texto(CADENA_EICAR)]);

const cargaDe = (contenido: Uint8Array, cambios: object = {}) => ({
  categoria: 'DOCUMENTO',
  nombre_original: 'contrato.pdf',
  tamano: contenido.byteLength,
  mime: 'application/pdf',
  entidad_tipo: ENTIDAD_CON_AUTORIZADOR,
  entidad_id: 'E-1',
  ...cambios,
});

/** Hace lo que deja AutenticacionGuard: el principal del token. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    solicitud.principal = { usuarioId: USUARIO, tenantId: TENANT_A, tipo: 'INTERNO', aal: 'aal1', sesionId: 'sesion', amr: [] };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/archivos con el almacén en memoria (TR-RF-080 y 082)', () => {
  let app: INestApplication;
  let dobles: Dobles;
  let permisosDelActor: string[];
  const http = () => request(app.getHttpServer());
  const get = (ruta: string) => http().get(ruta).set('X-Sucursal-Id', SUCURSAL);
  const post = (ruta: string, cuerpo: object = {}) => http().post(ruta).set('X-Sucursal-Id', SUCURSAL).send(cuerpo);

  /** Lo que hace el navegador: pide la URL y sube con ella directo al almacén. */
  async function subir(contenido: Uint8Array, cambios: object = {}): Promise<string> {
    const solicitada = await post('/v1/archivos/cargas', cargaDe(contenido, cambios));
    expect(solicitada.status).toBe(201);
    dobles.almacen.subirConUrl(solicitada.body.carga.url, contenido);
    return solicitada.body.archivo_id;
  }

  async function procesarCola(): Promise<void> {
    for (const trabajo of dobles.cola.tomarTodos()) await new AnalizarArchivo(dobles).ejecutar(trabajo);
  }

  async function subirYAnalizar(contenido: Uint8Array, cambios: object = {}): Promise<string> {
    const archivoId = await subir(contenido, cambios);
    await post(`/v1/archivos/${archivoId}/confirmar`);
    await procesarCola();
    return archivoId;
  }

  beforeAll(async () => {
    dobles = crearDobles();
    const modulo = await Test.createTestingModule({
      controllers: [ArchivosController],
      providers: [
        { provide: SolicitarCarga, useValue: new SolicitarCarga(dobles) },
        { provide: ConfirmarCarga, useValue: new ConfirmarCarga(dobles) },
        { provide: ConsultarEstadoArchivo, useValue: new ConsultarEstadoArchivo(dobles) },
        { provide: EmitirUrlDescarga, useValue: new EmitirUrlDescarga(dobles) },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async () => false } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT_A }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(
      new PrincipalDePrueba(),
      new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG),
    );
    app.setGlobalPrefix('v1');
    await app.init();
  });

  beforeEach(() => {
    permisosDelActor = [SUBIR, DESCARGAR];
    dobles.contexto.alcance = { tenantId: TENANT_A, actorId: USUARIO };
    dobles.archivos.guardados.length = 0;
    dobles.publicador.eventos.length = 0;
    dobles.auditoria.entradas.length = 0;
    dobles.autorizadores.length = 0;
    dobles.cola.tomarTodos();
    dobles.cola.caida = false;
    dobles.almacen.caido = false;
  });

  afterAll(() => app?.close());

  describe('POST /v1/archivos/cargas', () => {
    it('201 con el archivo y la URL de carga', async () => {
      const respuesta = await post('/v1/archivos/cargas', cargaDe(pdf()));

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({
        archivo_id: dobles.archivos.guardados[0]?.id,
        carga: { url: expect.stringContaining('token='), token: expect.any(String), expira_en: '2026-11-18T17:00:00.000Z' },
      });
    });

    it.each([
      ['IMAGEN de 10 MB + 1 byte', { categoria: 'IMAGEN', mime: 'image/png', tamano: DIEZ_MEGABYTES + 1 }, DIEZ_MEGABYTES],
      ['DOCUMENTO de 25 MB + 1 byte', { tamano: VEINTICINCO_MEGABYTES + 1 }, VEINTICINCO_MEGABYTES],
    ])('%s → 422 TAMANO_EXCEDIDO con el máximo, sin fila', async (_caso, cambios, maximo) => {
      const respuesta = await post('/v1/archivos/cargas', cargaDe(pdf(), cambios));

      expect([respuesta.status, respuesta.body]).toEqual([422, { codigo: 'TAMANO_EXCEDIDO', mensaje: expect.any(String), tamano_max_bytes: maximo }]);
      expect(dobles.archivos.guardados).toEqual([]);
    });

    it.each([
      ['MIME fuera de la categoría', { mime: 'image/png' }, 'MIME_NO_PERMITIDO'],
      ['categoría inexistente', { categoria: 'VIDEO' }, 'CATEGORIA_DESCONOCIDA'],
      ['tamaño en cero', { tamano: 0 }, 'DATOS_INVALIDOS'],
      ['nombre vacío', { nombre_original: '  ' }, 'DATOS_INVALIDOS'],
      ['tipo de entidad en minúsculas', { entidad_tipo: 'contrato' }, 'DATOS_INVALIDOS'],
    ])('%s → 422 %s', async (_caso, cambios, codigo) => {
      const respuesta = await post('/v1/archivos/cargas', cargaDe(pdf(), cambios));

      expect([respuesta.status, respuesta.body.codigo]).toEqual([422, codigo]);
    });

    it('cuerpo sin campos o con el tamaño como texto → 400 con las rutas, no los valores', async () => {
      const sinCampos = await post('/v1/archivos/cargas', { categoria: 'DOCUMENTO' });
      const tamanoTexto = await post('/v1/archivos/cargas', cargaDe(pdf(), { tamano: '1024', nombre_original: 'dni-juana.pdf' }));

      expect(sinCampos.status).toBe(400);
      expect(sinCampos.body.errores).toEqual(expect.arrayContaining(['nombre_original', 'tamano', 'mime', 'entidad_tipo', 'entidad_id']));
      expect([tamanoTexto.status, tamanoTexto.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['tamano'] }]);
    });

    it('autorizador que niega editar → 403 ACCESO_ENTIDAD_DENEGADO', async () => {
      const autorizador = new AutorizadorFijo();
      autorizador.permiteEditar = false;
      dobles.autorizadores.push(autorizador);

      const respuesta = await post('/v1/archivos/cargas', cargaDe(pdf()));

      expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'ACCESO_ENTIDAD_DENEGADO']);
    });

    it('Storage caído → 503 ALMACEN_NO_DISPONIBLE, sin detalle interno', async () => {
      dobles.almacen.caido = true;

      const respuesta = await post('/v1/archivos/cargas', cargaDe(pdf()));

      expect([respuesta.status, respuesta.body]).toEqual([503, { codigo: 'ALMACEN_NO_DISPONIBLE', mensaje: expect.not.stringContaining('caido') }]);
    });
  });

  describe('POST /v1/archivos/{id}/confirmar', () => {
    it('200 con el archivo EN_ANALISIS; la segunda vez, 200 con el estado actual y un solo trabajo', async () => {
      const archivoId = await subir(pdf());

      const primera = await post(`/v1/archivos/${archivoId}/confirmar`);
      const segunda = await post(`/v1/archivos/${archivoId}/confirmar`);

      expect([primera.status, primera.body]).toEqual([
        200,
        { archivo_id: archivoId, estado: 'EN_ANALISIS', categoria: 'DOCUMENTO', nombre_original: 'contrato.pdf' },
      ]);
      expect([segunda.status, segunda.body.estado]).toEqual([200, 'EN_ANALISIS']);
      expect(dobles.cola.vivos.size).toBe(1);
    });

    it('cola caída → 503 ALMACEN_NO_DISPONIBLE y confirmar otra vez funciona', async () => {
      const archivoId = await subir(pdf());
      dobles.cola.caida = true;
      const caida = await post(`/v1/archivos/${archivoId}/confirmar`);
      dobles.cola.caida = false;
      const reintento = await post(`/v1/archivos/${archivoId}/confirmar`);

      expect([caida.status, caida.body.codigo]).toEqual([503, 'ALMACEN_NO_DISPONIBLE']);
      expect([reintento.status, dobles.cola.vivos.size]).toEqual([200, 1]);
    });

    it('id que no es uuid → 400; inexistente → 404 NO_ENCONTRADO', async () => {
      const malFormado = await post('/v1/archivos/no-es-uuid/confirmar');
      const inexistente = await post(`/v1/archivos/${ARCHIVO_INEXISTENTE}/confirmar`);

      expect(malFormado.status).toBe(400);
      expect([inexistente.status, inexistente.body.codigo]).toEqual([404, 'NO_ENCONTRADO']);
    });
  });

  describe('GET /v1/archivos/{id}', () => {
    it('TR-CA-199: tras subir, confirmar y analizar, el archivo está DISPONIBLE con sus bytes y su hash', async () => {
      const archivoId = await subirYAnalizar(pdf());

      const respuesta = await get(`/v1/archivos/${archivoId}`);

      expect([respuesta.status, respuesta.body]).toEqual([
        200,
        {
          archivo_id: archivoId,
          estado: 'DISPONIBLE',
          categoria: 'DOCUMENTO',
          nombre_original: 'contrato.pdf',
          bytes: pdf().byteLength,
          hash_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      ]);
      expect(dobles.publicador.tipos()).toEqual(['archivo.disponible']);
    });

    it('TR-CA-200: un .exe declarado application/pdf queda RECHAZADO con su motivo', async () => {
      const archivoId = await subirYAnalizar(ejecutable());

      const respuesta = await get(`/v1/archivos/${archivoId}`);

      expect(respuesta.body).toMatchObject({ estado: 'RECHAZADO', motivo_rechazo: 'TIPO_NO_PERMITIDO' });
    });
  });

  describe('GET /v1/archivos/{id}/descarga', () => {
    it('TR-CA-204: 200 con la URL a 15 minutos y la descarga auditada', async () => {
      dobles.autorizadores.push(new AutorizadorFijo());
      const archivoId = await subirYAnalizar(pdf());

      const respuesta = await get(`/v1/archivos/${archivoId}/descarga`);

      expect([respuesta.status, respuesta.body]).toEqual([200, { url: expect.any(String), expira_en: '2026-11-18T15:15:00.000Z' }]);
      expect(new URL(respuesta.body.url).searchParams.get('download')).toBe('contrato.pdf');
      expect(dobles.almacen.descargarConUrl(respuesta.body.url)).toEqual(pdf());
      expect(dobles.auditoria.entradas.map((entrada) => [entrada.accion, entrada.entidadId])).toEqual([['plat.archivo.descargar', archivoId]]);
    });

    it('disposicion=inline → sin nombre de descarga; vigencia_segundos=60 → expira al minuto', async () => {
      const archivoId = await subirYAnalizar(pdf());

      const respuesta = await get(`/v1/archivos/${archivoId}/descarga?disposicion=inline&vigencia_segundos=60`);

      expect([respuesta.status, respuesta.body.expira_en]).toEqual([200, '2026-11-18T15:01:00.000Z']);
      expect(new URL(respuesta.body.url).searchParams.has('download')).toBe(false);
    });

    it.each([901, 59])('vigencia_segundos=%i → 422 VIGENCIA_INVALIDA', async (vigencia) => {
      const archivoId = await subirYAnalizar(pdf());

      const respuesta = await get(`/v1/archivos/${archivoId}/descarga?vigencia_segundos=${vigencia}`);

      expect([respuesta.status, respuesta.body.codigo]).toEqual([422, 'VIGENCIA_INVALIDA']);
    });

    it('disposición fuera de lista o vigencia que no es número → 400', async () => {
      const archivoId = await subirYAnalizar(pdf());

      const disposicion = await get(`/v1/archivos/${archivoId}/descarga?disposicion=popup`);
      const vigencia = await get(`/v1/archivos/${archivoId}/descarga?vigencia_segundos=mucho`);

      expect([disposicion.status, vigencia.status]).toEqual([400, 400]);
    });

    it('TR-CA-201: un archivo en CUARENTENA → 409 ARCHIVO_NO_DISPONIBLE con su estado', async () => {
      const archivoId = await subirYAnalizar(pdfInfectado());

      const respuesta = await get(`/v1/archivos/${archivoId}/descarga`);

      expect([respuesta.status, respuesta.body]).toEqual([409, { codigo: 'ARCHIVO_NO_DISPONIBLE', mensaje: expect.any(String), estado: 'CUARENTENA' }]);
      expect(dobles.publicador.tipos()).toEqual(['archivo.en_cuarentena']);
    });

    it('un archivo pendiente, en análisis o rechazado → 409 con su estado', async () => {
      const pendiente = await subir(pdf());
      const enAnalisis = await subir(pdf());
      await post(`/v1/archivos/${enAnalisis}/confirmar`);
      dobles.cola.tomarTodos();
      const rechazado = await subirYAnalizar(ejecutable());

      const estados = [];
      for (const archivoId of [pendiente, enAnalisis, rechazado]) {
        const respuesta = await get(`/v1/archivos/${archivoId}/descarga`);
        estados.push([respuesta.status, respuesta.body.estado]);
      }

      expect(estados).toEqual([
        [409, 'PENDIENTE_CARGA'],
        [409, 'EN_ANALISIS'],
        [409, 'RECHAZADO'],
      ]);
    });

    it('autorizador que niega leer → 403 ACCESO_ENTIDAD_DENEGADO', async () => {
      const archivoId = await subirYAnalizar(pdf());
      const autorizador = new AutorizadorFijo();
      autorizador.permiteLeer = false;
      dobles.autorizadores.push(autorizador);

      const respuesta = await get(`/v1/archivos/${archivoId}/descarga`);

      expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'ACCESO_ENTIDAD_DENEGADO']);
    });
  });

  it('TR-CA-205: un archivo del tenant A pedido desde B → 404 NO_ENCONTRADO en estado, confirmar y descarga', async () => {
    const archivoId = await subirYAnalizar(pdf());
    dobles.contexto.alcance = { tenantId: TENANT_B, actorId: USUARIO };

    const respuestas = [
      await get(`/v1/archivos/${archivoId}`),
      await post(`/v1/archivos/${archivoId}/confirmar`),
      await get(`/v1/archivos/${archivoId}/descarga`),
    ];

    expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual([
      [404, 'NO_ENCONTRADO'],
      [404, 'NO_ENCONTRADO'],
      [404, 'NO_ENCONTRADO'],
    ]);
  });

  describe('permisos', () => {
    it('sin plat.archivo.subir → 403 en cargas y confirmar', async () => {
      const archivoId = await subir(pdf());
      permisosDelActor = [DESCARGAR];

      const respuestas = [await post('/v1/archivos/cargas', cargaDe(pdf())), await post(`/v1/archivos/${archivoId}/confirmar`)];

      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual([
        [403, 'SIN_PERMISO'],
        [403, 'SIN_PERMISO'],
      ]);
    });

    it('sin plat.archivo.descargar → 403 en estado y descarga', async () => {
      const archivoId = await subirYAnalizar(pdf());
      permisosDelActor = [SUBIR];

      const respuestas = [await get(`/v1/archivos/${archivoId}`), await get(`/v1/archivos/${archivoId}/descarga`)];

      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual([
        [403, 'SIN_PERMISO'],
        [403, 'SIN_PERMISO'],
      ]);
    });
  });

  it('OpenAPI: las cuatro rutas bajo /v1, con sus respuestas de error documentadas', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());

    expect(Object.keys(documento.paths).sort()).toEqual([
      '/v1/archivos/cargas',
      '/v1/archivos/{id}',
      '/v1/archivos/{id}/confirmar',
      '/v1/archivos/{id}/descarga',
    ]);
    expect(Object.keys(documento.paths['/v1/archivos/cargas']?.post?.responses ?? {})).toEqual(expect.arrayContaining(['201', '400', '401', '403', '422', '503']));
    expect(Object.keys(documento.paths['/v1/archivos/{id}/descarga']?.get?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '404', '409', '422', '503']),
    );
  });
});
