import { ConsultarImportacion } from '../src/application/importacion/consultar-importacion.js';
import { DescargarErrores } from '../src/application/importacion/descargar-errores.js';
import { ListarImportaciones } from '../src/application/importacion/listar-importaciones.js';
import { PrevisualizarImportacion, type PrevisualizarImportacionComando } from '../src/application/importacion/previsualizar-importacion.js';
import { lineasReporteErrores } from '../src/application/importacion/reporte-errores-csv.js';
import type { Previsualizacion } from '../src/application/importacion/resultados-importacion.js';
import { CatalogoNoExisteError } from '../src/domain/errores.js';
import {
  ArchivoDemasiadoGrandeError,
  ArchivoInvalidoError,
  ColumnasInvalidasError,
  FilasInvalidasError,
  ImportacionNoAplicableError,
  ImportacionNoEncontradaError,
  TablaNoImportableError,
} from '../src/domain/importacion/errores.js';
import { AHORA, ANA, CLIENTE, OperadorRequeridoDoble } from './support/dobles.js';
import { escenarioImportacion, type EscenarioImportacion } from './support/dobles-importacion.js';

const BOM = '﻿';
const HORA = 3_600_000;

const csv = (...lineas: string[]): Buffer => Buffer.from(lineas.join('\n'), 'utf8');

/** UNIDAD_MEDIDA admite hasta 3 caracteres A-Z0-9: códigos únicos para archivos grandes. Las inválidas llevan guion. */
const unidades = (cantidad: number, esInvalida: (indice: number) => boolean = () => false): Buffer =>
  csv(
    'codigo,descripcion',
    ...Array.from({ length: cantidad }, (_, indice) =>
      esInvalida(indice) ? `X-${indice},Mala ${indice}` : `${indice.toString(36).toUpperCase()},Unidad ${indice}`,
    ),
  );

const comprobante = (codigo = '01'): Buffer => csv('codigo,descripcion', `${codigo},Comprobante ${codigo}`);

async function capturar<T extends Error>(promesa: Promise<unknown>): Promise<T> {
  try {
    await promesa;
  } catch (error) {
    return error as T;
  }
  throw new Error('no falló');
}

async function lineasDe(reporte: { lineas: Iterable<string> }): Promise<string[]> {
  return [...reporte.lineas];
}

describe('PrevisualizarImportacion (TR-RF-028)', () => {
  let actual: EscenarioImportacion;
  let previsualizar: PrevisualizarImportacion;

  const comando = (archivo: Buffer, cambios: Partial<PrevisualizarImportacionComando> = {}): PrevisualizarImportacionComando => ({
    catalogo: 'TIPO_COMPROBANTE',
    archivo: { nombre: 'comprobantes.csv', contenido: archivo },
    versionOficial: '2026-06',
    fechaVigencia: '2026-06-01',
    actorId: ANA,
    ...cambios,
  });

  beforeEach(async () => {
    actual = escenarioImportacion();
    previsualizar = new PrevisualizarImportacion(actual.importacion);
    const tipos = await actual.catalogo('TIPO_COMPROBANTE', 'GLOBAL');
    await actual.global(tipos, '01', 'Factura', 1);
    await actual.global(tipos, '03', 'Boleta', 2);
    await actual.global(tipos, '08', 'Nota de débito', 4);
    await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    await actual.catalogo('UNIDAD_MEDIDA', 'GLOBAL');
  });

  const deUnidades = (archivo: Buffer) => comando(archivo, { catalogo: 'UNIDAD_MEDIDA', archivo: { nombre: 'unidades.csv', contenido: archivo } });

  it('TIPO_COMPROBANTE: calcula altas, cambios y bajas sin tocar ningún ítem', async () => {
    const escriturasPrevias = actual.items.escrituras;
    const resultado = await previsualizar.ejecutar(
      comando(csv('codigo;descripcion;orden', '01;Factura;1', '03;Boleta de venta;2', '07;Nota de crédito;3')),
    );
    expect(resultado).toMatchObject<Partial<Previsualizacion>>({
      version: 0,
      estado: 'PREVISUALIZADA',
      versionOficial: '2026-06',
      fechaVigencia: '2026-06-01',
      resumen: { altas: 1, cambios: 1, bajas: 1, sinCambios: 1, totalFilas: 3 },
      venceEn: new Date(AHORA.getTime() + 24 * HORA),
    });
    expect(resultado.archivoSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(resultado.muestra.altas.map((fila) => fila.codigo)).toEqual(['07']);
    expect(resultado.muestra.cambios.map((cambio) => [cambio.antes.nombre, cambio.despues.nombre])).toEqual([['Boleta', 'Boleta de venta']]);
    expect(resultado.muestra.bajas).toEqual([expect.objectContaining({ codigo: '08', vigenteHasta: '2026-05-31' })]);
    expect(actual.items.escrituras).toBe(escriturasPrevias);
    const guardada = await actual.importaciones.buscar(resultado.id);
    expect(guardada?.operaciones?.bajas).toHaveLength(1);
  });

  it('la muestra trae hasta 20 de cada tipo', async () => {
    const archivo = csv('codigo,descripcion', ...Array.from({ length: 30 }, (_, indice) => `${10 + indice},Nuevo ${indice}`));
    const resultado = await previsualizar.ejecutar(comando(archivo));
    expect(resultado.resumen.altas).toBe(30);
    expect(resultado.muestra.altas).toHaveLength(20);
  });

  it('MEDIO_PAGO da TABLA_NO_IMPORTABLE y un catálogo inexistente, CATALOGO_NO_EXISTE', async () => {
    await expect(previsualizar.ejecutar(comando(comprobante(), { catalogo: 'MEDIO_PAGO' }))).rejects.toThrow(TablaNoImportableError);
    await expect(previsualizar.ejecutar(comando(comprobante(), { catalogo: 'NO_EXISTE' }))).rejects.toThrow(CatalogoNoExisteError);
  });

  it('un actor fuera del operador recibe 403 y no se guarda nada', async () => {
    actual.comoTenant(CLIENTE);
    await expect(previsualizar.ejecutar(comando(comprobante()))).rejects.toThrow(OperadorRequeridoDoble);
    expect(actual.importaciones.filas.size).toBe(0);
  });

  it('errores de archivo y de cabecera no guardan nada (TR-CA-073)', async () => {
    await expect(previsualizar.ejecutar(comando(Buffer.alloc(20 * 1024 * 1024 + 1)))).rejects.toThrow(ArchivoDemasiadoGrandeError);
    await expect(
      previsualizar.ejecutar(comando(comprobante(), { archivo: { nombre: 'comprobantes.txt', contenido: comprobante() } })),
    ).rejects.toThrow(ArchivoInvalidoError);
    const columnas = await capturar(previsualizar.ejecutar(comando(csv('codigo', '01'))));
    expect(columnas).toBeInstanceOf(ColumnasInvalidasError);
    expect(columnas.message).toBe('Falta la columna descripcion');
    expect(actual.importaciones.filas.size).toBe(0);
  });

  it('una fila inválida entre 5 000 válidas: 422 con la fila, RECHAZADA y ningún ítem tocado', async () => {
    const escriturasPrevias = actual.items.escrituras;
    const error = await capturar<FilasInvalidasError>(previsualizar.ejecutar(deUnidades(unidades(5_001, (indice) => indice === 2_500))));
    expect(error).toBeInstanceOf(FilasInvalidasError);
    expect(error.totalErrores).toBe(1);
    expect(error.errores).toEqual([{ fila: 2_502, columna: 'codigo', valor: 'X-2500', mensaje: 'El código no tiene el formato de la tabla' }]);
    const rechazada = await actual.importaciones.buscar(error.importacionId);
    expect(rechazada?.estado).toBe('RECHAZADA');
    expect(rechazada?.operaciones).toBeNull();
    expect(actual.items.escrituras).toBe(escriturasPrevias);
  });

  it('15 000 filas con 3 000 inválidas: 100 en la respuesta, total 3 000 y el CSV con las 3 000', async () => {
    const error = await capturar<FilasInvalidasError>(previsualizar.ejecutar(deUnidades(unidades(15_000, (indice) => indice % 5 === 0))));
    expect(error.errores).toHaveLength(100);
    expect(error.totalErrores).toBe(3_000);
    const lineas = await lineasDe(await new DescargarErrores(actual.importacion).ejecutar({ id: error.importacionId }));
    expect(lineas).toHaveLength(1 + 3_000);
    expect(lineas[0]).toBe(`${BOM}fila;columna;valor;mensaje\r\n`);
    expect(lineas[1]).toBe('2;codigo;X-0;El código no tiene el formato de la tabla\r\n');
  });

  it('12 000 inválidas: guarda 10 000 y el CSV termina con «Se muestran 10 000 de 12 000 errores»', async () => {
    const error = await capturar<FilasInvalidasError>(previsualizar.ejecutar(deUnidades(unidades(12_000, () => true))));
    expect(error.totalErrores).toBe(12_000);
    expect((await actual.importaciones.buscar(error.importacionId))?.errores).toHaveLength(10_000);
    const lineas = await lineasDe(await new DescargarErrores(actual.importacion).ejecutar({ id: error.importacionId }));
    expect(lineas).toHaveLength(1 + 10_000 + 1);
    expect(lineas.at(-1)).toBe('Se muestran 10 000 de 12 000 errores\r\n');
  });

  it('el reporte escapa un valor con `;` y comillas y se llama errores-{codigo}-{fecha}.csv', async () => {
    const error = await capturar<FilasInvalidasError>(previsualizar.ejecutar(comando(csv('codigo,descripcion', '"0""1;x",Factura'))));
    const reporte = await new DescargarErrores(actual.importacion).ejecutar({ id: error.importacionId });
    expect(reporte.nombreArchivo).toBe('errores-TIPO_COMPROBANTE-2026-11-07.csv');
    expect((await lineasDe(reporte))[1]).toBe('2;codigo;"0""1;x";El código no tiene el formato de la tabla\r\n');
  });

  it('una previsualización nueva vence la anterior y la RECHAZADA, con sus operaciones y errores', async () => {
    const rechazo = await capturar<FilasInvalidasError>(previsualizar.ejecutar(comando(comprobante('X'))));
    const primera = await previsualizar.ejecutar(comando(comprobante()));
    const segunda = await previsualizar.ejecutar(comando(csv('codigo,descripcion', '01,Factura')));
    expect((await actual.importaciones.buscar(primera.id))?.estado).toBe('VENCIDA');
    expect((await actual.importaciones.buscar(primera.id))?.operaciones).toBeNull();
    expect((await actual.importaciones.buscar(rechazo.importacionId))?.errores).toBeNull();
    expect((await actual.importaciones.buscar(segunda.id))?.estado).toBe('PREVISUALIZADA');
    await expect(new DescargarErrores(actual.importacion).ejecutar({ id: rechazo.importacionId })).rejects.toThrow(ImportacionNoAplicableError);
  });
});

describe('Consultar, listar y descargar', () => {
  let actual: EscenarioImportacion;
  let previa: Previsualizacion;

  beforeEach(async () => {
    actual = escenarioImportacion();
    await actual.catalogo('TIPO_COMPROBANTE', 'GLOBAL');
    previa = await new PrevisualizarImportacion(actual.importacion).ejecutar({
      catalogo: 'TIPO_COMPROBANTE',
      archivo: { nombre: 'comprobantes.csv', contenido: csv('codigo,descripcion', '01,Factura') },
      versionOficial: '2026-06',
      fechaVigencia: '2026-06-01',
      actorId: ANA,
    });
  });

  it('consultar trae el detalle con el código del catálogo', async () => {
    const detalle = await new ConsultarImportacion(actual.importacion).ejecutar({ id: previa.id });
    expect(detalle).toMatchObject({ id: previa.id, codigo: 'TIPO_COMPROBANTE', estado: 'PREVISUALIZADA', resumen: { altas: 1 } });
  });

  it('un id inexistente da IMPORTACION_NO_ENCONTRADA y un cliente, 403', async () => {
    await expect(new ConsultarImportacion(actual.importacion).ejecutar({ id: 'no-existe' })).rejects.toThrow(ImportacionNoEncontradaError);
    actual.comoTenant(CLIENTE);
    await expect(new ConsultarImportacion(actual.importacion).ejecutar({ id: previa.id })).rejects.toThrow(OperadorRequeridoDoble);
  });

  it('consultar una EN_COLA de más de 1 h la deja FALLIDA «Trabajo perdido en la cola»', async () => {
    const importacion = await actual.importaciones.buscar(previa.id);
    importacion?.encolar(ANA, AHORA);
    if (importacion) await actual.importaciones.guardar(importacion, importacion.version);
    actual.fijarAhora(new Date(AHORA.getTime() + HORA + 1));
    const detalle = await new ConsultarImportacion(actual.importacion).ejecutar({ id: previa.id });
    expect(detalle).toMatchObject({ estado: 'FALLIDA', motivoFallo: 'Trabajo perdido en la cola' });
    expect((await actual.importaciones.buscar(previa.id))?.estado).toBe('FALLIDA');
  });

  it('el historial va del más reciente al más antiguo, con tope de 50 por página', async () => {
    actual.fijarAhora(new Date(AHORA.getTime() + HORA));
    const segunda = await new PrevisualizarImportacion(actual.importacion).ejecutar({
      catalogo: 'TIPO_COMPROBANTE',
      archivo: { nombre: 'b.csv', contenido: csv('codigo,descripcion', '03,Boleta') },
      versionOficial: '2026-07',
      fechaVigencia: '2026-07-01',
      actorId: ANA,
    });
    const listar = new ListarImportaciones(actual.importacion);
    const historial = await listar.historial({ catalogo: 'TIPO_COMPROBANTE', pagina: 1, tamano: 500 });
    expect(historial.total).toBe(2);
    expect(historial.items.map((item) => [item.id, item.estado])).toEqual([
      [segunda.id, 'PREVISUALIZADA'],
      [previa.id, 'VENCIDA'],
    ]);
    await expect(listar.historial({ catalogo: 'NO_EXISTE', pagina: 1, tamano: 10 })).rejects.toThrow(CatalogoNoExisteError);
  });

  it('activas lista solo las EN_COLA del usuario', async () => {
    const listar = new ListarImportaciones(actual.importacion);
    expect(await listar.activas({ actorId: ANA })).toEqual([]);
    const importacion = await actual.importaciones.buscar(previa.id);
    importacion?.encolar(ANA, AHORA);
    if (importacion) await actual.importaciones.guardar(importacion, importacion.version);
    expect((await listar.activas({ actorId: ANA })).map((item) => item.id)).toEqual([previa.id]);
    expect(await listar.activas({ actorId: 'otro-usuario' })).toEqual([]);
  });

  it('descargar errores de una que no es RECHAZADA da IMPORTACION_NO_APLICABLE', async () => {
    await expect(new DescargarErrores(actual.importacion).ejecutar({ id: previa.id })).rejects.toThrow(
      'La importación está en estado PREVISUALIZADA y no se puede aplicar',
    );
  });
});

describe('reporte de errores en CSV', () => {
  it('neutraliza un valor que Excel tomaría como fórmula y ordena por fila', () => {
    const lineas = [
      ...lineasReporteErrores(
        [
          { fila: 9, columna: 'codigo', valor: '=HYPERLINK("x")', mensaje: 'El código no tiene el formato de la tabla' },
          { fila: 3, columna: 'orden', valor: 'uno', mensaje: 'El orden debe ser un número entero' },
        ],
        2,
      ),
    ];
    expect(lineas.slice(1)).toEqual([
      '3;orden;uno;El orden debe ser un número entero\r\n',
      `9;codigo;"'=HYPERLINK(""x"")";El código no tiene el formato de la tabla\r\n`,
    ]);
  });
});
