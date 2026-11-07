import ExcelJS from 'exceljs';
import type { FilaLeida, TablaLeida } from '../src/application/ports/importacion.js';
import { ArchivoInvalidoError } from '../src/domain/importacion/errores.js';
import { LectorTablaArchivos } from '../src/infrastructure/lectores/lector-tabla.archivos.js';

const lector = new LectorTablaArchivos();
const BOM = '﻿';

async function todas(tabla: TablaLeida): Promise<FilaLeida[]> {
  const filas: FilaLeida[] = [];
  for await (const fila of tabla.filas) filas.push(fila);
  return filas;
}

const leerCsv = (texto: string): Promise<TablaLeida> => lector.leer(Buffer.from(texto, 'utf8'), 'CSV');

async function mensajeDe(accion: () => Promise<unknown>): Promise<string> {
  try {
    await accion();
  } catch (error) {
    expect(error).toBeInstanceOf(ArchivoInvalidoError);
    return (error as Error).message;
  }
  throw new Error('no falló');
}

async function libroXlsx(hojas: Record<string, (string | number)[][]>): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) libro.addWorksheet(nombre).addRows(filas);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

describe('LectorCsv', () => {
  it('lee la cabecera y las filas con `,`', async () => {
    const tabla = await leerCsv('codigo,descripcion\n01,Factura\n03,Boleta de venta\n');
    expect(tabla.cabecera).toEqual(['codigo', 'descripcion']);
    expect(await todas(tabla)).toEqual([
      { numero: 2, celdas: { codigo: '01', descripcion: 'Factura' } },
      { numero: 3, celdas: { codigo: '03', descripcion: 'Boleta de venta' } },
    ]);
  });

  it('acepta `;` con BOM, comillas y tildes', async () => {
    const tabla = await leerCsv(`${BOM}codigo;descripcion\r\n150101;"Lima; cercado"\r\n150102;Ancón\r\n`);
    expect(tabla.cabecera).toEqual(['codigo', 'descripcion']);
    expect((await todas(tabla)).map((fila) => fila.celdas['descripcion'])).toEqual(['Lima; cercado', 'Ancón']);
  });

  it('salta las filas vacías sin perder el número de fila y completa celdas faltantes', async () => {
    const filas = await todas(await leerCsv('codigo,descripcion,orden\n01,Factura\n\n,,\n07,Nota de crédito,3\n'));
    expect(filas).toEqual([
      { numero: 2, celdas: { codigo: '01', descripcion: 'Factura', orden: '' } },
      { numero: 5, celdas: { codigo: '07', descripcion: 'Nota de crédito', orden: '3' } },
    ]);
  });

  it('rechaza Latin-1', async () => {
    const latin1 = Buffer.from('codigo,descripcion\n01,Año\n', 'latin1');
    expect(await mensajeDe(() => lector.leer(latin1, 'CSV'))).toBe('El archivo no está en UTF-8');
  });

  it('rechaza un archivo vacío y uno solo con cabecera', async () => {
    expect(await mensajeDe(() => leerCsv(''))).toBe('El archivo está vacío');
    expect(await mensajeDe(async () => todas(await leerCsv('codigo,descripcion\n')))).toBe('El archivo no tiene filas');
  });

  it('rechaza comillas mal cerradas con la fila', async () => {
    expect(await mensajeDe(async () => todas(await leerCsv('codigo,descripcion\n01,Factura\n03,"Boleta\n')))).toBe(
      'El CSV no es válido en la fila 3',
    );
  });

  it('acepta 50 000 filas y rechaza 50 001', async () => {
    const csvDe = (filas: number): string =>
      ['codigo,descripcion', ...Array.from({ length: filas }, (_, indice) => `${indice},Fila ${indice}`)].join('\n');
    expect(await todas(await leerCsv(csvDe(50_000)))).toHaveLength(50_000);
    expect(await mensajeDe(async () => todas(await leerCsv(csvDe(50_001))))).toBe('El archivo supera las 50 000 filas');
  });
});

describe('LectorXlsx', () => {
  it('lee la primera hoja con las celdas como texto', async () => {
    const archivo = await libroXlsx({
      Ubigeo: [
        ['codigo', 'descripcion', 'orden'],
        ['150101', 'Lima', 1],
        ['150102', 'Ancón', 2],
      ],
      Otra: [['no', 'se', 'lee']],
    });
    const tabla = await lector.leer(archivo, 'XLSX');
    expect(tabla.cabecera).toEqual(['codigo', 'descripcion', 'orden']);
    expect(await todas(tabla)).toEqual([
      { numero: 2, celdas: { codigo: '150101', descripcion: 'Lima', orden: '1' } },
      { numero: 3, celdas: { codigo: '150102', descripcion: 'Ancón', orden: '2' } },
    ]);
  });

  it('rechaza solo cabecera', async () => {
    const archivo = await libroXlsx({ Hoja: [['codigo', 'descripcion']] });
    expect(await mensajeDe(async () => todas(await lector.leer(archivo, 'XLSX')))).toBe('El archivo no tiene filas');
  });

  it('rechaza un .xlsx que no es ZIP', async () => {
    expect(await mensajeDe(() => lector.leer(Buffer.from('codigo,descripcion\n01,Factura\n'), 'XLSX'))).toBe(
      'Solo se aceptan archivos CSV o XLSX',
    );
  });

  it('rechaza un ZIP que no es un XLSX válido', async () => {
    const corrupto = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(200, 7)]);
    expect(await mensajeDe(async () => todas(await lector.leer(corrupto, 'XLSX')))).toBe('El archivo XLSX no es válido');
  });
});
