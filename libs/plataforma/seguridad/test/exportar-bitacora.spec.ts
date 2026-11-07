import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { ExportarBitacora, MAXIMO_FILAS_EXPORTACION } from '../src/application/exportar-bitacora.js';
import { ConsultarBitacora, ConsultarEventoSeguridad } from '../src/application/lecturas-bitacora.js';
import { FABRICA_ESCRITOR_BITACORA } from '../src/application/ports/escritor-bitacora.port.js';
import type { EventoBitacoraExportado, FiltroExportacion, LecturaBitacora } from '../src/application/ports/lectura-bitacora.js';
import type { BitacoraSeguridad, TipoEventoSeguridad } from '../src/application/ports/repositorios.js';
import { EscritorBitacoraXlsx, fechaLima } from '../src/infrastructure/xlsx/escritor-bitacora.xlsx.js';
import { BitacoraController } from '../src/interface/bitacora.controller.js';
import { PERMISO } from '../src/interface/decoradores.js';
import { ANA, Doble, PrincipalDePrueba } from './support/dobles-http.js';

const SEMANA = { desde: '2026-10-27', hasta: '2026-11-02' };
const TAMANO_LOTE = 1_000;
const SEGUNDOS_MAXIMOS_10000_FILAS = 10;
const COLUMNAS = 6;

const ana = { id: ANA, nombre: 'Ana Torres', correo: 'ana.torres@saboresdelsur.pe' };
const eventosDePrueba: EventoBitacoraExportado[] = [
  { id: '3', tipo: 'LOGIN_FALLIDO', ocurridoEn: new Date('2026-11-02T20:30:05Z'), usuario: ana, resumen: 'BLOQUEO_INGRESO', ip: '190.42.10.8' },
  { id: '2', tipo: 'LOGIN', ocurridoEn: new Date('2026-11-01T13:00:00Z'), usuario: ana, resumen: 'password', ip: '190.42.10.8' },
  { id: '1', tipo: 'ACCESO_DENEGADO', ocurridoEn: new Date('2026-10-30T15:00:00Z'), usuario: null, resumen: 'plat.rol.gestionar', ip: null },
];

/** Lectura en memoria: entrega los eventos en lotes como el adaptador real. */
class LecturaEnMemoria implements LecturaBitacora {
  eventos: EventoBitacoraExportado[] = [];
  totalForzado: number | null = null;
  filtros: FiltroExportacion[] = [];

  listar = async () => ({ items: [], total: 0 });
  detalle = async () => null;

  async contar(filtro: FiltroExportacion): Promise<number> {
    this.filtros.push(filtro);
    return this.totalForzado ?? this.eventos.length;
  }

  async recorrer(_filtro: FiltroExportacion, alLote: (eventos: EventoBitacoraExportado[]) => Promise<void>): Promise<void> {
    for (let inicio = 0; inicio < this.eventos.length; inicio += TAMANO_LOTE) await alLote(this.eventos.slice(inicio, inicio + TAMANO_LOTE));
  }
}

class BitacoraEnMemoria implements BitacoraSeguridad {
  registros: Array<{ tipo: TipoEventoSeguridad; usuarioId: string | null; detalle: Record<string, unknown>; ip: string | null | undefined }> = [];
  falla = false;

  async registrar(tipo: TipoEventoSeguridad, usuarioId: string | null, detalle: Record<string, unknown>, ip?: string | null): Promise<void> {
    if (this.falla) throw new Error('bitácora caída');
    this.registros.push({ tipo, usuarioId, detalle, ip });
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
  const hoja = libro.getWorksheet('Bitácora');
  const filas: unknown[][] = [];
  // Una celda vacía no existe en el XLSX: se lee como texto vacío para comparar.
  hoja?.eachRow((fila) => filas.push(Array.from({ length: COLUMNAS }, (_, columna) => fila.getCell(columna + 1).value ?? '')));
  return filas;
}

describe('Exportación XLSX de la bitácora (HTTP sin base, exceljs real, spec 18b)', () => {
  let app: INestApplication;
  const lectura = new LecturaEnMemoria();
  const bitacora = new BitacoraEnMemoria();
  const unidadDeTrabajo = { run: <T>(trabajo: () => Promise<T>) => trabajo() } as UnitOfWork;
  const exportar = () => request(app.getHttpServer()).get('/seg/bitacora/exportar');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [BitacoraController],
      providers: [
        { provide: APP_GUARD, useClass: PrincipalDePrueba },
        { provide: ConsultarBitacora, useValue: new Doble() },
        { provide: ConsultarEventoSeguridad, useValue: new Doble() },
        { provide: ExportarBitacora, useValue: new ExportarBitacora({ unidadDeTrabajo, lectura, bitacora, avisar: () => undefined }) },
        { provide: FABRICA_ESCRITOR_BITACORA, useValue: (destino: NodeJS.WritableStream) => new EscritorBitacoraXlsx(destino) },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    lectura.eventos = eventosDePrueba;
    lectura.totalForzado = null;
    lectura.filtros = [];
    bitacora.registros = [];
    bitacora.falla = false;
  });

  it('la ruta lleva plat.seguridad.bitacora_exportar', () => {
    expect(Reflect.getMetadata(PERMISO, BitacoraController.prototype.exportar)).toBe('plat.seguridad.bitacora_exportar');
  });

  it('descarga un XLSX con encabezado y las filas en el orden de la lista, y deja una fila EXPORTACION', async () => {
    const respuesta = await exportar().query({ ...SEMANA, tipo: 'LOGIN_FALLIDO', usuario: 'ana' }).buffer(true).parse(binario);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(respuesta.headers['content-disposition']).toBe('attachment; filename="bitacora-20261027-20261102.xlsx"');
    expect(await filasDelLibro(respuesta.body as Buffer)).toEqual([
      ['Fecha', 'Tipo', 'Usuario', 'Correo', 'Resumen', 'IP'],
      ['02/11/2026 15:30:05', 'Ingreso fallido', 'Ana Torres', 'ana.torres@saboresdelsur.pe', 'Bloqueo por intentos fallidos (correo e IP, o IP)', '190.42.10.8'],
      ['01/11/2026 08:00:00', 'Ingreso', 'Ana Torres', 'ana.torres@saboresdelsur.pe', 'Contraseña', '190.42.10.8'],
      ['30/10/2026 10:00:00', 'Acceso denegado', '', '', 'plat.rol.gestionar', ''],
    ]);
    expect(bitacora.registros).toEqual([
      {
        tipo: 'EXPORTACION',
        usuarioId: ANA,
        detalle: { recurso: 'bitacora', filtros: { ...SEMANA, tipo: 'LOGIN_FALLIDO', usuario: 'ana' }, filas: 3 },
        ip: expect.stringContaining('127.0.0.1'),
      },
    ]);
  });

  it(`con ${MAXIMO_FILAS_EXPORTACION + 1} filas responde 422 en JSON y no audita`, async () => {
    lectura.totalForzado = MAXIMO_FILAS_EXPORTACION + 1;

    const respuesta = await exportar().query(SEMANA);

    expect(respuesta.status).toBe(422);
    expect(respuesta.headers['content-disposition']).toBeUndefined();
    expect(respuesta.body).toEqual({
      codigo: 'EXPORTACION_DEMASIADO_GRANDE',
      mensaje: 'La exportación tiene 10 001 filas; el máximo es 10 000. Acote el rango o los filtros',
    });
    expect(bitacora.registros).toEqual([]);
  });

  it('si la fila EXPORTACION no se escribe, responde 503 sin archivo', async () => {
    bitacora.falla = true;

    const respuesta = await exportar().query(SEMANA);

    expect(respuesta.status).toBe(503);
    expect(respuesta.body).toEqual({ codigo: 'AUDITORIA_NO_DISPONIBLE', mensaje: 'No se pudo registrar la exportación; intente de nuevo' });
    expect(respuesta.headers['content-type']).toContain('application/json');
  });

  it('sin rango responde 400 RANGO_BITACORA_INVALIDO y no audita', async () => {
    const respuesta = await exportar().query({ desde: '2026-10-27' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('RANGO_BITACORA_INVALIDO');
    expect(bitacora.registros).toEqual([]);
  });

  it(`${MAXIMO_FILAS_EXPORTACION} filas salen completas en menos de ${SEGUNDOS_MAXIMOS_10000_FILAS} s`, async () => {
    lectura.eventos = Array.from({ length: MAXIMO_FILAS_EXPORTACION }, (_, indice) => ({
      ...eventosDePrueba[1],
      id: String(MAXIMO_FILAS_EXPORTACION - indice),
      ocurridoEn: new Date(Date.parse('2026-11-02T20:00:00Z') - indice * 1000),
    }));
    const inicio = Date.now();

    const respuesta = await exportar().query(SEMANA).buffer(true).parse(binario);

    expect((Date.now() - inicio) / 1000).toBeLessThan(SEGUNDOS_MAXIMOS_10000_FILAS);
    const filas = await filasDelLibro(respuesta.body as Buffer);
    expect(filas).toHaveLength(MAXIMO_FILAS_EXPORTACION + 1);
    expect(filas[1]?.[0]).toBe('02/11/2026 15:00:00');
  }, 30_000);
});

describe('fechaLima', () => {
  it('escribe el día y la hora de Lima, sin horario de verano', () => {
    expect(fechaLima(new Date('2026-01-01T04:59:59Z'))).toBe('31/12/2025 23:59:59');
    expect(fechaLima(new Date('2026-07-15T17:05:09Z'))).toBe('15/07/2026 12:05:09');
  });
});
