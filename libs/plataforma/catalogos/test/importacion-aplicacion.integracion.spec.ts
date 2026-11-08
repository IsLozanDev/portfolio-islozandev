import { AplicarImportacion } from '../src/application/importacion/aplicar-importacion.js';
import { PrevisualizarImportacion } from '../src/application/importacion/previsualizar-importacion.js';
import { ProcesarImportacion, type DependenciasProcesarImportacion } from '../src/application/importacion/procesar-importacion.js';
import type { EscrituraImportacion, TrabajoImportacion } from '../src/application/ports/importacion.js';
import { crearEntornoCatalogos, type EntornoCatalogos } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

// Id de la semilla de 01f_cat_importacion.sql: MONEDA nace vacío.
const MONEDA = 'ca700000-0000-0000-0000-000000000009';
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Códigos ISO de 3 letras distintos: AAA, AAB, … */
const codigoMoneda = (indice: number): string =>
  [Math.floor(indice / 676), Math.floor(indice / 26) % 26, indice % 26].map((posicion) => LETRAS[posicion]).join('');
const monedas = (cantidad: number, nombre = (indice: number) => `Moneda ${indice}`): Buffer =>
  Buffer.from(['codigo,descripcion', ...Array.from({ length: cantidad }, (_, indice) => `${codigoMoneda(indice)},${nombre(indice)}`)].join('\n'));

/** La escritura real, con un error forzado en el lote número `lote`. */
function fallandoEnLote(real: EscrituraImportacion, lote: number): EscrituraImportacion {
  let lotes = 0;
  return {
    iniciar: (id) => real.iniciar(id),
    aplicarLote: async (id, tipo, desde, hasta) => {
      lotes += 1;
      if (lotes === lote) throw new Error('fallo forzado en el lote');
      return real.aplicarLote(id, tipo, desde, hasta);
    },
    cerrarBajas: (id) => real.cerrarBajas(id),
    finalizar: (id, por) => real.finalizar(id, por),
  };
}

describeConDb('Aplicar importaciones en el worker (TR-RF-028, PostgreSQL 16)', () => {
  let entorno: EntornoCatalogos;
  let actorId: string;
  const comoOperador = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.operador, trabajo);
  const consultar = async (sql: string, parametros: unknown[] = []) => (await entorno.dataSource.query(sql, parametros))[0];
  const versionMoneda = async () => Number((await consultar(`SELECT version FROM cat.catalogo WHERE id = $1`, [MONEDA])).version);
  const itemsMoneda = async () => (await consultar(`SELECT count(*)::int AS n FROM cat.catalogo_item WHERE catalogo_id = $1`, [MONEDA])).n;
  const eventosMoneda = async () => (await entorno.eventosDe(MONEDA)).map((evento) => evento['event_type']);

  /** Previsualiza y aplica; devuelve el trabajo que dejó en la cola. */
  const encolar = async (archivo: Buffer): Promise<TrabajoImportacion> => {
    const previa = await comoOperador(() =>
      new PrevisualizarImportacion(entorno.importacion).ejecutar({
        catalogo: 'MONEDA',
        archivo: { nombre: 'monedas.csv', contenido: archivo },
        versionOficial: '2026-06',
        fechaVigencia: '2026-06-01',
        actorId,
      }),
    );
    await comoOperador(() => new AplicarImportacion(entorno.importacion).ejecutar({ id: previa.id, version: 0, actorId }));
    return entorno.cola.trabajos.at(-1) as TrabajoImportacion;
  };
  const procesar = (trabajo: TrabajoImportacion, cambios: Partial<DependenciasProcesarImportacion> = {}) =>
    new ProcesarImportacion({ ...entorno.procesar, ...cambios }).ejecutar(trabajo);
  const estadoDe = async (id: string) => consultar(`SELECT estado, motivo_fallo, operaciones IS NULL AS sin_operaciones FROM cat.importacion WHERE id = $1`, [id]);

  beforeAll(async () => {
    entorno = await crearEntornoCatalogos();
    actorId = entorno.tenants.usuarioId;
  });

  afterAll(() => entorno?.cerrar());

  it('un fallo forzado en el tercer lote no deja ningún ítem; queda FALLIDA y la versión no cambia', async () => {
    const trabajo = await encolar(monedas(2_500));
    const versionAntes = await versionMoneda();
    await procesar(trabajo, { escritura: fallandoEnLote(entorno.procesar.escritura, 3) });
    expect(await itemsMoneda()).toBe(0);
    expect(await versionMoneda()).toBe(versionAntes);
    expect(await estadoDe(trabajo.importacionId)).toEqual({
      estado: 'FALLIDA',
      motivo_fallo: 'No se pudo aplicar la importación: fallo forzado en el lote',
      sin_operaciones: true,
    });
    expect(await eventosMoneda()).toEqual([]);
  });

  it('aplicar deja los ítems, sube la versión exactamente en 1 y escribe los dos eventos en el outbox', async () => {
    const trabajo = await encolar(monedas(2_500));
    const versionAntes = await versionMoneda();
    await procesar(trabajo);
    expect(await itemsMoneda()).toBe(2_500);
    expect(await versionMoneda()).toBe(versionAntes + 1);
    expect(await estadoDe(trabajo.importacionId)).toEqual({ estado: 'APLICADA', motivo_fallo: null, sin_operaciones: true });
    expect(await eventosMoneda()).toEqual(['catalogo.actualizado', 'catalogo.importacion_aplicada']);
    const [, aplicada] = await entorno.eventosDe(MONEDA);
    expect(aplicada).toMatchObject({ tenant_id: entorno.tenants.operador, version: String(versionAntes + 1) });
    expect(aplicada?.['payload']).toMatchObject({ importacion_id: trabajo.importacionId, altas: 2_500, version_global: versionAntes + 1, por: actorId });
    expect(entorno.canal.publicados.get(trabajo.importacionId)?.at(-1)).toMatchObject({ tipo: 'fin', estado: 'APLICADA' });
  });

  it('reprocesar el trabajo ya aplicado no escribe nada', async () => {
    const trabajo = entorno.cola.trabajos.at(-1) as TrabajoImportacion;
    const versionAntes = await versionMoneda();
    await procesar(trabajo);
    expect(await versionMoneda()).toBe(versionAntes);
    expect(await eventosMoneda()).toHaveLength(2);
  });

  it('un cambio global entre previsualizar y aplicar termina OBSOLETA sin escribir', async () => {
    const trabajo = await encolar(monedas(2_500, (indice) => (indice === 0 ? 'Moneda renombrada' : `Moneda ${indice}`)));
    await entorno.dataSource.query(
      `SELECT cat.guardar_item_global(gen_random_uuid(), NULL, $1, 'ZZZ', NULL, 'Moneda de prueba', NULL, 0, '{}', '2026-01-01', NULL, true, $2)`,
      [MONEDA, actorId],
    );
    const versionAntes = await versionMoneda();
    await procesar(trabajo);
    expect(await estadoDe(trabajo.importacionId)).toMatchObject({ estado: 'OBSOLETA', sin_operaciones: true });
    expect(await versionMoneda()).toBe(versionAntes);
    expect(await consultar(`SELECT nombre FROM cat.catalogo_item WHERE catalogo_id = $1 AND codigo = 'AAA'`, [MONEDA])).toEqual({ nombre: 'Moneda 0' });
  });
});
