import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PermisoGuard } from '@vitrina/plataforma/seguridad';
import { AplicarImportacion } from '../src/application/importacion/aplicar-importacion.js';
import { ConsultarImportacion } from '../src/application/importacion/consultar-importacion.js';
import { DescargarErrores } from '../src/application/importacion/descargar-errores.js';
import { ListarImportaciones } from '../src/application/importacion/listar-importaciones.js';
import { PrevisualizarImportacion } from '../src/application/importacion/previsualizar-importacion.js';
import { SeguirImportacion } from '../src/application/importacion/seguir-importacion.js';
import type { Previsualizacion } from '../src/application/importacion/resultados-importacion.js';
import {
  ColaNoDisponibleError,
  ColumnasInvalidasError,
  FilasInvalidasError,
  ImportacionEnCursoError,
  ImportacionNoAplicableError,
} from '../src/domain/importacion/errores.js';
import { ImportacionesController } from '../src/interface/importaciones.controller.js';
import { AHORA, ANA, OPERADOR } from './support/dobles.js';
import { escenarioImportacion, type EscenarioImportacion } from './support/dobles-importacion.js';

const SUCURSAL = '0193f3a0-0000-7000-8000-000000000101';
const OTRO_USUARIO = '0193f3a0-0000-7000-8000-000000000902';
const IMPORTACION = '0193f3a0-0000-7000-8000-00000000f001';
const MFA_MAX_EDAD_SEG = 900;
const STEP_UP = `Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=${MFA_MAX_EDAD_SEG}`;
const MILISEGUNDOS_POR_SEGUNDO = 1000;
const VEINTE_MB = 20 * 1024 * 1024;
const RUTA_MANIFIESTO = new URL('../../seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

/** Lo que deja AutenticacionGuard. `x-prueba-aal` simula un token sin MFA y `x-prueba-usuario`, otro usuario. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    const aal = solicitud.headers['x-prueba-aal'] ?? 'aal2';
    const usuarioId = solicitud.headers['x-prueba-usuario'] ?? ANA;
    const ahoraSeg = Math.floor(Date.now() / MILISEGUNDOS_POR_SEGUNDO);
    solicitud.principal = { usuarioId, tenantId: OPERADOR, tipo: 'INTERNO', aal, sesionId: 'sesion', amr: aal === 'aal2' ? [{ method: 'totp', timestamp: ahoraSeg }] : [] };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

const previsualizacion: Previsualizacion = {
  id: IMPORTACION,
  estado: 'PREVISUALIZADA',
  versionOficial: '2026-06',
  fechaVigencia: '2026-06-01',
  archivoSha256: 'a'.repeat(64),
  resumen: { altas: 1, cambios: 0, bajas: 0, sinCambios: 0, totalFilas: 1 },
  muestra: {
    altas: [{ numero: 2, codigo: '150101', codigoExterno: null, nombre: 'Lima', abreviatura: null, orden: 2, atributos: { departamento: 'LIMA', provincia: 'LIMA' } }],
    cambios: [],
    bajas: [],
  },
  venceEn: new Date('2026-11-08T15:00:00Z'),
};

const listada = {
  id: IMPORTACION,
  catalogoId: '0193f3a0-0000-7000-8000-00000000c001',
  estado: 'RECHAZADA' as const,
  versionOficial: '2026-06',
  fechaVigencia: '2026-06-01',
  archivoNombre: 'ubigeo.csv',
  archivoSha256: 'a'.repeat(64),
  resumen: { altas: 0, cambios: 0, bajas: 0, sinCambios: 0 },
  totalErrores: 3,
  motivoFallo: null,
  lanzadoPor: ANA,
  creadoEn: AHORA,
  aplicadoPor: null,
  terminadoEn: null,
};
const listadaRespuesta = {
  id: IMPORTACION,
  estado: 'RECHAZADA',
  version_oficial: '2026-06',
  fecha_vigencia: '2026-06-01',
  archivo_nombre: 'ubigeo.csv',
  archivo_sha256: 'a'.repeat(64),
  resumen: { altas: 0, cambios: 0, bajas: 0, sin_cambios: 0 },
  total_errores: 3,
  motivo_fallo: null,
  lanzado_por: ANA,
  creado_en: AHORA.toISOString(),
  aplicado_por: null,
  terminado_en: null,
};

/** Lee un SSE completo: pares `evento` y `data` en el orden en que llegaron. */
function eventosDe(texto: string): { evento: string; data: unknown }[] {
  return texto
    .split('\n\n')
    .filter((bloque) => bloque.startsWith('event:'))
    .map((bloque) => {
      const [linea, datos] = bloque.split('\n');
      return { evento: linea?.slice('event: '.length) ?? '', data: JSON.parse(datos?.slice('data: '.length) ?? 'null') };
    });
}

describe('HTTP /v1/catalogos/.../importaciones (TR-RF-028)', () => {
  let app: INestApplication;
  let actual: EscenarioImportacion;
  let unidadMedidaId: string;
  let fallo: Error | null;
  let permisosDelActor: string[];
  const comandos: Record<string, unknown[]> = {};
  const registrar = (nombre: string, comando: unknown) => {
    (comandos[nombre] ??= []).push(comando);
    if (fallo) throw fallo;
  };
  const doble = (nombre: string, respuesta: unknown) => async (comando: unknown) => {
    registrar(nombre, comando);
    return respuesta;
  };
  const http = () => request(app.getHttpServer());
  const conSucursal = <T extends { set(campo: string, valor: string): T }>(solicitud: T) => solicitud.set('X-Sucursal-Id', SUCURSAL);
  const subir = (contenido: Buffer, nombre = 'ubigeo.csv') =>
    conSucursal(http().post('/v1/catalogos/UBIGEO/importaciones'))
      .field('version_oficial', '2026-06')
      .field('fecha_vigencia', '2026-06-01')
      .attach('archivo', contenido, nombre);

  beforeAll(async () => {
    actual = escenarioImportacion();
    unidadMedidaId = (await actual.catalogo('UNIDAD_MEDIDA', 'GLOBAL')).id;
    const manifiesto: { permisos: { codigo: string; sensible: boolean }[] } = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
    const sensibles = new Set(manifiesto.permisos.filter((permiso) => permiso.sensible).map((permiso) => permiso.codigo));
    const modulo = await Test.createTestingModule({
      controllers: [ImportacionesController],
      providers: [
        { provide: PrevisualizarImportacion, useValue: { ejecutar: doble('previsualizar', previsualizacion) } },
        { provide: ListarImportaciones, useValue: { historial: doble('historial', { items: [listada], total: 1 }), activas: doble('activas', []) } },
        {
          provide: ConsultarImportacion,
          useValue: { ejecutar: doble('consultar', { ...listada, codigo: 'UBIGEO', estado: 'EN_PROCESO', avance: 40, venceEn: AHORA }) },
        },
        {
          provide: DescargarErrores,
          useValue: {
            ejecutar: doble('errores', { nombreArchivo: 'errores-UBIGEO-2026-11-07.csv', lineas: ['﻿fila;columna;valor;mensaje\r\n', '3;codigo;15A;Mal\r\n'] }),
          },
        },
        { provide: AplicarImportacion, useValue: { ejecutar: doble('aplicar', { id: IMPORTACION, estado: 'EN_COLA' }) } },
        { provide: SeguirImportacion, useValue: new SeguirImportacion(actual.importacion) },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async (codigo: string) => sensibles.has(codigo) } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: OPERADOR }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(new PrincipalDePrueba(), new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  beforeEach(() => {
    fallo = null;
    permisosDelActor = ['plat.catalogo.importar'];
    for (const nombre of Object.keys(comandos)) delete comandos[nombre];
  });

  afterAll(() => app?.close());

  describe('POST /v1/catalogos/{codigo}/importaciones', () => {
    it('responde 201 con la previsualización en snake_case y pasa el archivo en memoria', async () => {
      const respuesta = await subir(Buffer.from('codigo,descripcion,departamento,provincia\n150101,Lima,LIMA,LIMA\n'));
      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({
        id: IMPORTACION,
        estado: 'PREVISUALIZADA',
        version_oficial: '2026-06',
        fecha_vigencia: '2026-06-01',
        archivo_sha256: 'a'.repeat(64),
        resumen: { altas: 1, cambios: 0, bajas: 0, sin_cambios: 0, total_filas: 1 },
        muestra: {
          altas: [{ fila: 2, codigo: '150101', codigo_externo: null, nombre: 'Lima', abreviatura: null, orden: 2, atributos: { departamento: 'LIMA', provincia: 'LIMA' } }],
          cambios: [],
          bajas: [],
        },
        vence_en: '2026-11-08T15:00:00.000Z',
      });
      const [comando] = comandos['previsualizar'] as { archivo: { nombre: string; contenido: Buffer } }[];
      expect(comando).toMatchObject({ catalogo: 'UBIGEO', versionOficial: '2026-06', fechaVigencia: '2026-06-01', actorId: ANA });
      expect(comando?.archivo.nombre).toBe('ubigeo.csv');
      expect(comando?.archivo.contenido.toString()).toContain('150101,Lima');
    });

    it('20 MB + 1 byte responde 413 ARCHIVO_DEMASIADO_GRANDE sin llegar al caso de uso', async () => {
      const respuesta = await subir(Buffer.alloc(VEINTE_MB + 1, 'a'));
      expect(respuesta.status).toBe(413);
      expect(respuesta.body).toEqual({ codigo: 'ARCHIVO_DEMASIADO_GRANDE', mensaje: 'El archivo supera los 20 MB' });
      expect(comandos['previsualizar']).toBeUndefined();
    });

    it('filas inválidas responden 422 con la importación, el total y los errores', async () => {
      fallo = new FilasInvalidasError(IMPORTACION, [{ fila: 3, columna: 'codigo', valor: '15A', mensaje: 'El código no tiene el formato de la tabla' }], 3_000);
      const respuesta = await subir(Buffer.from('x'));
      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toEqual({
        codigo: 'FILAS_INVALIDAS',
        mensaje: 'El archivo tiene filas inválidas; no se importó nada',
        importacion_id: IMPORTACION,
        total_errores: 3_000,
        errores: [{ fila: 3, columna: 'codigo', valor: '15A', mensaje: 'El código no tiene el formato de la tabla' }],
      });
    });

    it('TR-CA-073: una columna faltante responde 400 COLUMNAS_INVALIDAS', async () => {
      fallo = new ColumnasInvalidasError('Falta la columna descripcion');
      const respuesta = await subir(Buffer.from('codigo\nA00\n'));
      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toEqual({ codigo: 'COLUMNAS_INVALIDAS', mensaje: 'Falta la columna descripcion' });
    });

    it('sin archivo o con una fecha imposible responde 400 SOLICITUD_INVALIDA', async () => {
      const sinArchivo = await conSucursal(http().post('/v1/catalogos/UBIGEO/importaciones')).field('version_oficial', '2026-06').field('fecha_vigencia', '2026-06-01');
      expect(sinArchivo.status).toBe(400);
      expect(sinArchivo.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores: ['archivo'] });
      const fecha = await conSucursal(http().post('/v1/catalogos/UBIGEO/importaciones'))
        .field('version_oficial', '2026-06')
        .field('fecha_vigencia', '2026-02-30')
        .attach('archivo', Buffer.from('x'), 'ubigeo.csv');
      expect(fecha.status).toBe(400);
      expect(fecha.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores: ['fecha_vigencia'] });
    });
  });

  it('GET /v1/catalogos/{codigo}/importaciones da el historial y rechaza más de 50 por página', async () => {
    const respuesta = await conSucursal(http().get('/v1/catalogos/UBIGEO/importaciones?pagina=2&tamano=10'));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ items: [listadaRespuesta], total: 1 });
    expect(comandos['historial']).toEqual([{ catalogo: 'UBIGEO', pagina: 2, tamano: 10 }]);
    expect((await conSucursal(http().get('/v1/catalogos/UBIGEO/importaciones?tamano=51'))).status).toBe(400);
  });

  it('GET /v1/catalogos/importaciones/{id}/errores.csv descarga el CSV con su nombre', async () => {
    const respuesta = await conSucursal(http().get(`/v1/catalogos/importaciones/${IMPORTACION}/errores.csv`)).buffer(true);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(respuesta.headers['content-disposition']).toBe('attachment; filename="errores-UBIGEO-2026-11-07.csv"');
    expect(respuesta.text).toBe('﻿fila;columna;valor;mensaje\r\n3;codigo;15A;Mal\r\n');
  });

  it('errores.csv de una que no está RECHAZADA responde 409 IMPORTACION_NO_APLICABLE', async () => {
    fallo = new ImportacionNoAplicableError('PREVISUALIZADA');
    const respuesta = await conSucursal(http().get(`/v1/catalogos/importaciones/${IMPORTACION}/errores.csv`));
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe('IMPORTACION_NO_APLICABLE');
  });

  it('GET /v1/catalogos/importaciones?activas=true lista las del usuario; sin el filtro, 400', async () => {
    const respuesta = await conSucursal(http().get('/v1/catalogos/importaciones?activas=true'));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual([]);
    expect(comandos['activas']).toEqual([{ actorId: ANA }]);
    expect((await conSucursal(http().get('/v1/catalogos/importaciones'))).status).toBe(400);
  });

  it('GET /v1/catalogos/importaciones/{id} trae estado EN_PROCESO y avance; un id que no es UUID da 404', async () => {
    const respuesta = await conSucursal(http().get(`/v1/catalogos/importaciones/${IMPORTACION}`));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ id: IMPORTACION, codigo: 'UBIGEO', estado: 'EN_PROCESO', avance: 40, vence_en: AHORA.toISOString() });
    const noUuid = await conSucursal(http().get('/v1/catalogos/importaciones/no-es-uuid'));
    expect(noUuid.status).toBe(404);
    expect(noUuid.body).toEqual({ codigo: 'IMPORTACION_NO_ENCONTRADA', mensaje: 'La importación no existe' });
  });

  describe('POST /v1/catalogos/importaciones/{id}/aplicar', () => {
    const aplicar = () => conSucursal(http().post(`/v1/catalogos/importaciones/${IMPORTACION}/aplicar`)).send({ version: 0 });

    it('responde 202 con EN_COLA', async () => {
      const respuesta = await aplicar();
      expect(respuesta.status).toBe(202);
      expect(respuesta.body).toEqual({ id: IMPORTACION, estado: 'EN_COLA' });
      expect(comandos['aplicar']).toEqual([{ id: IMPORTACION, version: 0, actorId: ANA }]);
    });

    it('otra en curso da 409 IMPORTACION_EN_CURSO y la cola caída, 503 COLA_NO_DISPONIBLE', async () => {
      fallo = new ImportacionEnCursoError();
      expect((await aplicar()).body).toEqual({ codigo: 'IMPORTACION_EN_CURSO', mensaje: 'Ya hay una importación en curso para este catálogo' });
      fallo = new ColaNoDisponibleError();
      const caida = await aplicar();
      expect(caida.status).toBe(503);
      expect(caida.body).toEqual({ codigo: 'COLA_NO_DISPONIBLE', mensaje: 'No se pudo encolar la importación; intente de nuevo' });
    });

    it('sin version responde 400', async () => {
      expect((await conSucursal(http().post(`/v1/catalogos/importaciones/${IMPORTACION}/aplicar`)).send({})).status).toBe(400);
    });
  });

  describe('GET /v1/catalogos/importaciones/{id}/eventos (SSE)', () => {
    /** Una importación EN_COLA de ANA en los dobles. La anterior en cola se cierra: hay una sola por catálogo. */
    const enCola = async (): Promise<string> => {
      const anterior = await actual.importaciones.enColaDe(unidadMedidaId);
      anterior?.marcarFallida('Cerrada por la prueba', AHORA);
      if (anterior) await actual.importaciones.guardar(anterior, anterior.version);
      const previa = await new PrevisualizarImportacion(actual.importacion).ejecutar({
        catalogo: 'UNIDAD_MEDIDA',
        archivo: { nombre: 'unidades.csv', contenido: Buffer.from(`codigo,descripcion\nU${actual.importaciones.filas.size},Unidad\n`) },
        versionOficial: '2026-06',
        fechaVigencia: '2026-06-01',
        actorId: ANA,
      });
      await new AplicarImportacion(actual.importacion).ejecutar({ id: previa.id, version: 0, actorId: ANA });
      return previa.id;
    };

    /** Publica cuando el SSE ya se suscribió. */
    const publicarAlSuscribirse = async (id: string, avisos: Parameters<typeof actual.canal.publicar>[1][]) => {
      while (actual.canal.suscritos(id) === 0) await new Promise((resolver) => setTimeout(resolver, 10));
      for (const aviso of avisos) await actual.canal.publicar(id, aviso);
    };

    it('entrega el estado actual, los avances y el fin, con las cabeceras de SSE, y cierra', async () => {
      const id = await enCola();
      const [respuesta] = await Promise.all([
        conSucursal(http().get(`/v1/catalogos/importaciones/${id}/eventos`)).buffer(true),
        publicarAlSuscribirse(id, [
          { tipo: 'avance', estado: 'EN_PROCESO', avance: 40 },
          { tipo: 'avance', estado: 'EN_PROCESO', avance: 99 },
          { tipo: 'fin', estado: 'APLICADA', resumen: { altas: 1, cambios: 0, bajas: 0, sin_cambios: 0 }, motivo: null },
        ]),
      ]);
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['content-type']).toBe('text/event-stream; charset=utf-8');
      expect(respuesta.headers['cache-control']).toBe('no-cache');
      expect(respuesta.headers['x-accel-buffering']).toBe('no');
      expect(eventosDe(respuesta.text)).toEqual([
        { evento: 'avance', data: { tipo: 'avance', estado: 'EN_COLA', avance: 0 } },
        { evento: 'avance', data: { tipo: 'avance', estado: 'EN_PROCESO', avance: 40 } },
        { evento: 'avance', data: { tipo: 'avance', estado: 'EN_PROCESO', avance: 99 } },
        { evento: 'fin', data: { tipo: 'fin', estado: 'APLICADA', resumen: { altas: 1, cambios: 0, bajas: 0, sin_cambios: 0 }, motivo: null } },
      ]);
      expect(actual.canal.suscritos(id)).toBe(0);
    });

    it('una ya terminada entrega solo el fin de la base y cierra', async () => {
      const id = await enCola();
      const importacion = await actual.importaciones.buscar(id);
      importacion?.marcarFallida('No se pudo aplicar la importación: fallo', AHORA);
      if (importacion) await actual.importaciones.guardar(importacion, importacion.version);
      const respuesta = await conSucursal(http().get(`/v1/catalogos/importaciones/${id}/eventos`)).buffer(true);
      expect(eventosDe(respuesta.text)).toEqual([
        { evento: 'fin', data: { tipo: 'fin', estado: 'FALLIDA', resumen: null, motivo: 'No se pudo aplicar la importación: fallo' } },
      ]);
    });

    it('a otro usuario responde 404 y una sin aplicar, 409', async () => {
      const id = await enCola();
      const otro = await conSucursal(http().get(`/v1/catalogos/importaciones/${id}/eventos`)).set('x-prueba-usuario', OTRO_USUARIO);
      expect(otro.status).toBe(404);
      expect(otro.body).toEqual({ codigo: 'IMPORTACION_NO_ENCONTRADA', mensaje: 'La importación no existe' });
      const previa = await new PrevisualizarImportacion(actual.importacion).ejecutar({
        catalogo: 'UNIDAD_MEDIDA',
        archivo: { nombre: 'unidades.csv', contenido: Buffer.from('codigo,descripcion\nZZ,Unidad\n') },
        versionOficial: '2026-06',
        fechaVigencia: '2026-06-01',
        actorId: ANA,
      });
      expect((await conSucursal(http().get(`/v1/catalogos/importaciones/${previa.id}/eventos`))).status).toBe(409);
    });
  });

  describe('seguridad', () => {
    it('con aal1 responde 401 step-up (permiso sensible) y sin el permiso, 403', async () => {
      const aal1 = await conSucursal(http().get(`/v1/catalogos/importaciones/${IMPORTACION}`)).set('x-prueba-aal', 'aal1');
      expect(aal1.status).toBe(401);
      expect(aal1.headers['www-authenticate']).toBe(STEP_UP);
      permisosDelActor = ['plat.catalogo.leer'];
      expect((await conSucursal(http().get(`/v1/catalogos/importaciones/${IMPORTACION}`))).status).toBe(403);
      expect(comandos['consultar']).toBeUndefined();
    });
  });

  it('las 7 rutas figuran en OpenAPI con sus códigos de error', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const rutas = Object.entries(documento.paths).flatMap(([ruta, metodos]) =>
      Object.entries(metodos as Record<string, { responses: Record<string, unknown> }>).map(([metodo, operacion]) => [
        `${metodo.toUpperCase()} ${ruta}`,
        Object.keys(operacion.responses).sort(),
      ]),
    );
    expect(Object.fromEntries(rutas)).toEqual({
      'GET /v1/catalogos/importaciones': ['200', '400', '401', '403'],
      'GET /v1/catalogos/importaciones/{id}/errores.csv': ['200', '401', '403', '404', '409'],
      'GET /v1/catalogos/importaciones/{id}/eventos': ['200', '401', '403', '404', '409'],
      'GET /v1/catalogos/importaciones/{id}': ['200', '401', '403', '404'],
      'POST /v1/catalogos/importaciones/{id}/aplicar': ['202', '400', '401', '403', '404', '409', '503'],
      'POST /v1/catalogos/{codigo}/importaciones': ['201', '400', '401', '403', '404', '413', '422'],
      'GET /v1/catalogos/{codigo}/importaciones': ['200', '400', '401', '403', '404'],
    });
  });
});
