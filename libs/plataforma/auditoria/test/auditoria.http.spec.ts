import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { PERMISO, PermisoGuard } from '@vitrina/plataforma/seguridad';
import { ConsultarAuditoria, type EventoAuditoriaListado } from '../src/application/consultar-auditoria.js';
import { ExportarAuditoria } from '../src/application/exportar-auditoria.js';
import { ObtenerEventoAuditoria, type DetalleEventoAuditoria } from '../src/application/obtener-evento-auditoria.js';
import { ObtenerUltimaVerificacion } from '../src/application/obtener-ultima-verificacion.js';
import { FABRICA_ESCRITOR_AUDITORIA, type EscritorAuditoria } from '../src/application/ports/escritor-auditoria.port.js';
import {
  AuditoriaNoDisponibleError,
  EventoAuditoriaNoEncontradoError,
  ExportacionDemasiadoGrandeError,
  RangoInvalidoError,
  SinVerificacionesError,
  SucursalFueraDeAlcanceError,
} from '../src/domain/errores.js';
import type { Verificacion } from '../src/domain/verificacion.js';
import { EscritorAuditoriaXlsx } from '../src/infrastructure/xlsx/escritor-auditoria.xlsx.js';
import { AuditoriaController } from '../src/interface/auditoria.controller.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const SURCO = '0193f3a0-0000-7000-8000-000000000102';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const ROSA = '0193f3a0-0000-7000-8000-000000000903';
const EVENTO = '0193f3a0-0000-7000-8000-00000000a001';
const CONSULTAR = 'plat.auditoria.consultar';
const EXPORTAR = 'plat.auditoria.exportar';
const MFA_MAX_EDAD_SEG = 900;
const MILISEGUNDOS_POR_SEGUNDO = 1000;
const STEP_UP = `Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=${MFA_MAX_EDAD_SEG}`;
const COLUMNAS_XLSX = 14;
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

const verificacion: Verificacion = {
  id: '0193f3a0-0000-7000-8000-00000000b001',
  tenantId: TENANT,
  modo: 'INCREMENTAL',
  desdeNumero: '120',
  hastaNumero: '136',
  ultimoHash: 'c'.repeat(64),
  filas: 16,
  estado: 'ROTA',
  numeroRoto: '137',
  motivo: 'HASH',
  iniciadaEn: new Date('2026-11-10T08:30:00Z'),
  terminadaEn: new Date('2026-11-10T08:30:02Z'),
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

type Analizador = Parameters<request.Test['parse']>[0];

/** supertest junta el cuerpo binario para abrirlo con exceljs. */
const binario = ((respuesta: NodeJS.ReadableStream, alTerminar: (error: Error | null, cuerpo: Buffer) => void): void => {
  const partes: Buffer[] = [];
  respuesta.on('data', (parte: Buffer) => partes.push(parte));
  respuesta.on('end', () => alTerminar(null, Buffer.concat(partes)));
}) as unknown as Analizador;

async function filasDelLibro(cuerpo: Buffer): Promise<unknown[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(cuerpo as unknown as ArrayBuffer);
  const filas: unknown[][] = [];
  // Una celda vacía no existe en el XLSX: se lee como texto vacío para comparar.
  libro.getWorksheet('Auditoría')?.eachRow((fila) => filas.push(Array.from({ length: COLUMNAS_XLSX }, (_, columna) => fila.getCell(columna + 1).value ?? '')));
  return filas;
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/aud/eventos (spec 20b)', () => {
  let app: INestApplication;
  let permisosDelActor: string[];
  let fallo: Error | null;
  const consultas: unknown[][] = [];
  const detalles: string[] = [];
  const exportaciones: unknown[] = [];
  let falloExportacion: Error | null;
  let falloIntegridad: Error | null;
  const http = () => request(app.getHttpServer());
  const listar = (query: Record<string, string>) => http().get('/v1/aud/eventos').query(query).set('X-Sucursal-Id', SURCO);
  const obtener = (id: string) => http().get(`/v1/aud/eventos/${id}`).set('X-Sucursal-Id', SURCO);
  const exportar = (query: Record<string, string>) => http().get('/v1/aud/eventos/exportar').query(query).set('X-Sucursal-Id', SURCO);

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
          provide: ExportarAuditoria,
          useValue: {
            ejecutar: async (filtro: unknown, escritor: EscritorAuditoria) => {
              exportaciones.push(filtro);
              if (falloExportacion) throw falloExportacion;
              escritor.abrir();
              await escritor.escribir([{ ...listado, camposCambiados: 'estado, total' }, { ...sistema, camposCambiados: '' }]);
              await escritor.terminar();
            },
          },
        },
        { provide: FABRICA_ESCRITOR_AUDITORIA, useValue: (destino: NodeJS.WritableStream) => new EscritorAuditoriaXlsx(destino) },
        {
          provide: ObtenerUltimaVerificacion,
          useValue: {
            ejecutar: async () => {
              if (falloIntegridad) throw falloIntegridad;
              return verificacion;
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
    const catalogo = { sensible: async (codigo: string) => codigo === EXPORTAR } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(new PrincipalDePrueba(), new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(() => app?.close());

  beforeEach(() => {
    permisosDelActor = [CONSULTAR, EXPORTAR];
    fallo = null;
    falloExportacion = null;
    falloIntegridad = null;
    consultas.length = 0;
    detalles.length = 0;
    exportaciones.length = 0;
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

  describe('exportación XLSX (TR-RN-047, TR-RN-009)', () => {
    it('con aal2 descarga la hoja «Auditoría» con las columnas definidas y el nombre del rango', async () => {
      const respuesta = await exportar({ ...OCTUBRE, accion: 'rest.venta.anular' }).buffer(true).parse(binario);

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['content-type']).toContain('spreadsheetml');
      expect(respuesta.headers['content-disposition']).toBe('attachment; filename="auditoria-20261001-20261031.xlsx"');
      expect(exportaciones).toEqual([expect.objectContaining({ ...OCTUBRE, accion: 'rest.venta.anular' })]);
      expect(await filasDelLibro(respuesta.body)).toEqual([
        ['Fecha', 'Tipo', 'Acción', 'Entidad', 'Id', 'Usuario', 'Correo', 'Sucursal', 'Motivo', 'Finalidad', 'Ticket', 'Campos cambiados', 'IP', 'N.º'],
        ['15/10/2026 10:00:00', 'Operación', 'rest.venta.anular', 'venta', 'V-000981', 'Rosa Huamán', 'rosa@sabores.pe', 'SURCO · Surco', 'cliente desistió', '', '', 'estado, total', '190.42.10.8', 7],
        ['15/10/2026 10:00:00', 'Operación', 'rest.venta.anular', 'venta', 'V-000981', '', '', '', 'cliente desistió', '', '', '', '190.42.10.8', 7],
      ]);
    });

    it('con aal1 responde 401 step-up sin llegar al caso de uso', async () => {
      const respuesta = await exportar(OCTUBRE).set('x-prueba-aal', 'aal1');
      expect([respuesta.status, respuesta.body.codigo, respuesta.headers['www-authenticate']]).toEqual([401, 'MFA_REQUERIDA', STEP_UP]);
      expect(exportaciones).toEqual([]);
    });

    it('sin plat.auditoria.exportar responde 403 SIN_PERMISO', async () => {
      permisosDelActor = [CONSULTAR];
      const respuesta = await exportar(OCTUBRE);
      expect([respuesta.status, respuesta.body.codigo]).toEqual([403, 'SIN_PERMISO']);
      expect(exportaciones).toEqual([]);
    });

    it('más de 10 000 filas es 422 y la auditoría caída es 503, como JSON y sin archivo', async () => {
      falloExportacion = new ExportacionDemasiadoGrandeError(12_345, 10_000);
      const grande = await exportar(OCTUBRE);
      expect([grande.status, grande.body.codigo, grande.headers['content-disposition']]).toEqual([422, 'EXPORTACION_DEMASIADO_GRANDE', undefined]);

      falloExportacion = new AuditoriaNoDisponibleError();
      const caida = await exportar(OCTUBRE);
      expect([caida.status, caida.body.codigo, caida.headers['content-disposition']]).toEqual([503, 'AUDITORIA_NO_DISPONIBLE', undefined]);
    });
  });

  describe('GET /v1/aud/integridad', () => {
    const integridad = () => http().get('/v1/aud/integridad').set('X-Sucursal-Id', SURCO);

    it('devuelve el último resultado del tenant', async () => {
      const respuesta = await integridad();
      expect([respuesta.status, respuesta.body]).toEqual([
        200,
        {
          id: verificacion.id,
          modo: 'INCREMENTAL',
          desde_numero: '120',
          hasta_numero: '136',
          filas: 16,
          estado: 'ROTA',
          numero_roto: '137',
          motivo: 'HASH',
          iniciada_en: '2026-11-10T08:30:00.000Z',
          terminada_en: '2026-11-10T08:30:02.000Z',
        },
      ]);
    });

    it('sin alcance TENANT es 403, sin verificaciones 404 y sin permiso 403 SIN_PERMISO', async () => {
      falloIntegridad = new SucursalFueraDeAlcanceError();
      expect((await integridad()).body.codigo).toBe('SUCURSAL_FUERA_DE_ALCANCE');
      falloIntegridad = new SinVerificacionesError();
      const sinVerificaciones = await integridad();
      expect([sinVerificaciones.status, sinVerificaciones.body.codigo]).toEqual([404, 'SIN_VERIFICACIONES']);
      permisosDelActor = [EXPORTAR];
      const sinPermiso = await integridad();
      expect([sinPermiso.status, sinPermiso.body.codigo]).toEqual([403, 'SIN_PERMISO']);
    });
  });

  it('cada ruta exige su permiso', () => {
    const reflector = new Reflector();
    const permisoDe = (metodo: 'listar' | 'consultar' | 'exportar' | 'integridad') => reflector.get(PERMISO, AuditoriaController.prototype[metodo]);
    expect([permisoDe('listar'), permisoDe('consultar'), permisoDe('exportar'), permisoDe('integridad')]).toEqual([CONSULTAR, CONSULTAR, EXPORTAR, CONSULTAR]);
  });

  it('las rutas están en OpenAPI con sus códigos de error', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const codigos = (ruta: string) => Object.keys(documento.paths[ruta]?.get?.responses ?? {}).sort();
    expect(codigos('/v1/aud/eventos')).toEqual(['200', '400', '401', '403']);
    expect(codigos('/v1/aud/eventos/{id}')).toEqual(['200', '401', '403', '404']);
    expect(codigos('/v1/aud/eventos/exportar')).toEqual(['200', '400', '401', '403', '422', '503']);
    expect(codigos('/v1/aud/integridad')).toEqual(['200', '401', '403', '404']);
    expect(Object.keys(documento.paths).sort()).toEqual(['/v1/aud/eventos', '/v1/aud/eventos/exportar', '/v1/aud/eventos/{id}', '/v1/aud/integridad']);
  });
});
