import { ConsultarImportacion } from '../src/application/importacion/consultar-importacion.js';
import { DescargarErrores } from '../src/application/importacion/descargar-errores.js';
import { ListarImportaciones } from '../src/application/importacion/listar-importaciones.js';
import { PrevisualizarImportacion, type PrevisualizarImportacionComando } from '../src/application/importacion/previsualizar-importacion.js';
import { FilasInvalidasError, ImportacionEnCursoError } from '../src/domain/importacion/errores.js';
import { crearEntornoCatalogos, OperadorRequeridoDoble, type EntornoCatalogos } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

// Id de la semilla de 01f_cat_importacion.sql: UBIGEO nace vacío.
const UBIGEO = 'ca700000-0000-0000-0000-000000000005';

const csv = (...lineas: string[]): Buffer => Buffer.from(lineas.join('\n'), 'utf8');
const CABECERA_UBIGEO = 'codigo,descripcion,departamento,provincia';

async function capturar<T>(promesa: Promise<unknown>): Promise<T> {
  try {
    await promesa;
  } catch (error) {
    return error as T;
  }
  throw new Error('no falló');
}

describeConDb('Previsualizar y consultar importaciones (TR-RF-028, PostgreSQL 16)', () => {
  let entorno: EntornoCatalogos;
  let actorId: string;
  const comoOperador = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.operador, trabajo);
  const comoCliente = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.cliente, trabajo);
  const consultar = async (sql: string, parametros: unknown[] = []) => (await entorno.dataSource.query(sql, parametros))[0];

  const comando = (archivo: Buffer): PrevisualizarImportacionComando => ({
    catalogo: 'UBIGEO',
    archivo: { nombre: 'ubigeo.csv', contenido: archivo },
    versionOficial: '2026-06',
    fechaVigencia: '2026-06-01',
    actorId,
  });
  const previsualizar = (archivo: Buffer) => comoOperador(() => new PrevisualizarImportacion(entorno.importacion).ejecutar(comando(archivo)));

  beforeAll(async () => {
    entorno = await crearEntornoCatalogos();
    actorId = entorno.tenants.usuarioId;
  });

  afterAll(() => entorno?.cerrar());

  it('guarda la previsualización con las operaciones en el jsonb que leen las funciones de aplicación', async () => {
    const resultado = await previsualizar(csv(CABECERA_UBIGEO, '150101,Lima,LIMA,LIMA', '150102,Ancón,LIMA,LIMA'));
    expect(resultado.resumen).toEqual({ altas: 2, cambios: 0, bajas: 0, sinCambios: 0, totalFilas: 2 });
    const fila = await consultar(
      `SELECT tenant_id, estado, altas, version_catalogo, encolado_en, operaciones->'altas'->1 AS alta
         FROM cat.importacion WHERE id = $1`,
      [resultado.id],
    );
    expect(fila).toEqual({
      tenant_id: entorno.tenants.operador,
      estado: 'PREVISUALIZADA',
      altas: 2,
      version_catalogo: '1',
      encolado_en: null,
      alta: {
        numero: 3,
        codigo: '150102',
        codigo_externo: null,
        nombre: 'Ancón',
        abreviatura: null,
        orden: 3,
        atributos: { departamento: 'LIMA', provincia: 'LIMA' },
      },
    });
    const releida = await comoOperador(() => entorno.importacion.unidadDeTrabajo.run(() => entorno.importacion.importaciones.buscar(resultado.id)));
    expect(releida?.operaciones?.altas.map((alta) => alta.codigo)).toEqual(['150101', '150102']);
    expect(await consultar(`SELECT count(*)::int AS n FROM cat.catalogo_item WHERE catalogo_id = $1`, [UBIGEO])).toEqual({ n: 0 });
  });

  it('con filas inválidas guarda la RECHAZADA con sus errores, no toca ítems y el CSV se descarga', async () => {
    const error = await capturar<FilasInvalidasError>(previsualizar(csv(CABECERA_UBIGEO, '150101,Lima,LIMA,LIMA', '15A,Mala,LIMA,LIMA')));
    expect(error).toBeInstanceOf(FilasInvalidasError);
    expect(await consultar(`SELECT estado, total_errores, operaciones, jsonb_array_length(errores) AS errores FROM cat.importacion WHERE id = $1`, [error.importacionId])).toEqual(
      { estado: 'RECHAZADA', total_errores: 1, operaciones: null, errores: 1 },
    );
    const reporte = await comoOperador(() => new DescargarErrores(entorno.importacion).ejecutar({ id: error.importacionId }));
    expect([...reporte.lineas][1]).toBe('3;codigo;15A;El código no tiene el formato de la tabla\r\n');
    expect(await consultar(`SELECT count(*)::int AS n FROM cat.catalogo_item WHERE catalogo_id = $1`, [UBIGEO])).toEqual({ n: 0 });
  });

  it('una previsualización nueva vence las anteriores y el historial va del más reciente al más antiguo', async () => {
    const nueva = await previsualizar(csv(CABECERA_UBIGEO, '150101,Lima,LIMA,LIMA'));
    const vencidas = await consultar(
      `SELECT count(*)::int AS n FROM cat.importacion WHERE catalogo_id = $1 AND estado = 'VENCIDA' AND operaciones IS NULL AND errores IS NULL`,
      [UBIGEO],
    );
    expect(vencidas).toEqual({ n: 2 });
    const historial = await comoOperador(() => new ListarImportaciones(entorno.importacion).historial({ catalogo: 'UBIGEO', pagina: 1, tamano: 2 }));
    expect(historial.total).toBe(3);
    expect(historial.items[0]).toMatchObject({ id: nueva.id, estado: 'PREVISUALIZADA', resumen: { altas: 1 } });
    expect(historial.items[1]).not.toHaveProperty('operaciones');
    const detalle = await comoOperador(() => new ConsultarImportacion(entorno.importacion).ejecutar({ id: nueva.id }));
    expect(detalle).toMatchObject({ codigo: 'UBIGEO', estado: 'PREVISUALIZADA' });
  });

  it('bloqueo optimista y una sola EN_COLA por catálogo', async () => {
    const { importaciones, unidadDeTrabajo } = entorno.importacion;
    const primera = await previsualizar(csv(CABECERA_UBIGEO, '150101,Lima,LIMA,LIMA'));
    await comoOperador(() =>
      unidadDeTrabajo.run(async () => {
        const importacion = await importaciones.buscar(primera.id);
        if (!importacion) throw new Error('no se guardó');
        importacion.encolar(actorId, new Date());
        expect(await importaciones.guardar(importacion, 9)).toBe(false);
        expect(await importaciones.guardar(importacion, importacion.version)).toBe(true);
      }),
    );
    expect((await comoOperador(() => new ListarImportaciones(entorno.importacion).activas({ actorId }))).map((item) => item.id)).toEqual([primera.id]);

    // vencerPrevias no toca la EN_COLA: la segunda queda PREVISUALIZADA y no puede encolarse.
    const segunda = await previsualizar(csv(CABECERA_UBIGEO, '150102,Ancón,LIMA,LIMA'));
    const error = await capturar(
      comoOperador(() =>
        unidadDeTrabajo.run(async () => {
          const importacion = await importaciones.buscar(segunda.id);
          importacion?.encolar(actorId, new Date());
          if (importacion) await importaciones.guardar(importacion, importacion.version);
        }),
      ),
    );
    expect(error).toBeInstanceOf(ImportacionEnCursoError);
  });

  // La RLS entre tenants la prueba db/tests/01f_cat_importacion.test.sql con cat_test_app: aquí la
  // conexión es de superusuario y la salta.
  it('un cliente no pasa el verificador del operador', async () => {
    const [{ id }] = await entorno.dataSource.query(`SELECT id FROM cat.importacion WHERE catalogo_id = $1 LIMIT 1`, [UBIGEO]);
    await expect(comoCliente(() => new ConsultarImportacion(entorno.importacion).ejecutar({ id }))).rejects.toThrow(OperadorRequeridoDoble);
    await expect(comoCliente(() => new ListarImportaciones(entorno.importacion).activas({ actorId }))).rejects.toThrow(OperadorRequeridoDoble);
  });

  it('la lectura de globales trae cerrados e inactivos con las fechas como texto', async () => {
    await entorno.dataSource.query(
      `SELECT cat.guardar_item_global($1, NULL, $2, '150103', NULL, 'Ate', NULL, 3, '{"departamento":"LIMA","provincia":"LIMA"}',
              '2026-01-01', '2026-03-31', false, $3)`,
      ['0193f3a0-0000-7000-8000-0000000d9001', UBIGEO, actorId],
    );
    const globales = await comoOperador(() => entorno.importacion.unidadDeTrabajo.run(() => entorno.importacion.itemsGlobales.de(UBIGEO)));
    expect(globales).toEqual([
      {
        id: '0193f3a0-0000-7000-8000-0000000d9001',
        codigo: '150103',
        codigoExterno: null,
        nombre: 'Ate',
        abreviatura: null,
        orden: 3,
        atributos: { departamento: 'LIMA', provincia: 'LIMA' },
        vigenteDesde: '2026-01-01',
        vigenteHasta: '2026-03-31',
        activo: false,
      },
    ]);
  });
});
