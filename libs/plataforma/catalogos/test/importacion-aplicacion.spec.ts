import { AplicarImportacion } from '../src/application/importacion/aplicar-importacion.js';
import { PrevisualizarImportacion } from '../src/application/importacion/previsualizar-importacion.js';
import { ProcesarImportacion } from '../src/application/importacion/procesar-importacion.js';
import type { AvisoImportacion, TrabajoImportacion } from '../src/application/ports/importacion.js';
import type { Catalogo } from '../src/domain/catalogo.js';
import { VersionObsoletaError } from '../src/domain/errores.js';
import { ColaNoDisponibleError, ImportacionEnCursoError, ImportacionNoAplicableError } from '../src/domain/importacion/errores.js';
import { AHORA, ANA, OPERADOR } from './support/dobles.js';
import { escenarioImportacion, type EscenarioImportacion } from './support/dobles-importacion.js';

const HORA = 3_600_000;
const csv = (...lineas: string[]): Buffer => Buffer.from(lineas.join('\n'), 'utf8');

/** UNIDAD_MEDIDA: códigos A-Z0-9 de hasta 3 caracteres, únicos hasta 46 656. */
const unidades = (cantidad: number, nombre = (indice: number) => `Unidad ${indice}`): Buffer =>
  csv('codigo,descripcion', ...Array.from({ length: cantidad }, (_, indice) => `${indice.toString(36).toUpperCase()},${nombre(indice)}`));

describe('AplicarImportacion y ProcesarImportacion (TR-RF-028)', () => {
  let actual: EscenarioImportacion;
  let unidadMedida: Catalogo;

  const previsualizar = async (archivo: Buffer) =>
    new PrevisualizarImportacion(actual.importacion).ejecutar({
      catalogo: 'UNIDAD_MEDIDA',
      archivo: { nombre: 'unidades.csv', contenido: archivo },
      versionOficial: '2026-06',
      fechaVigencia: '2026-06-01',
      actorId: ANA,
    });
  const aplicar = (id: string, version = 0) => new AplicarImportacion(actual.importacion).ejecutar({ id, version, actorId: ANA });
  const procesar = (trabajo: TrabajoImportacion) => new ProcesarImportacion(actual.procesar).ejecutar(trabajo);
  const estadoDe = async (id: string) => (await actual.importaciones.buscar(id))?.estado;
  const avisosDe = (id: string): AvisoImportacion[] => actual.canal.publicados.get(id) ?? [];

  /** 2 500 altas, 1 cambio (la U0 existente con otro nombre) y 1 baja (ZZZ). */
  const enCola = async () => {
    const previa = await previsualizar(unidades(2_501));
    await aplicar(previa.id);
    return { id: previa.id, trabajo: actual.cola.trabajos.at(-1) as TrabajoImportacion };
  };

  beforeEach(async () => {
    actual = escenarioImportacion();
    unidadMedida = await actual.catalogo('UNIDAD_MEDIDA', 'GLOBAL');
    await actual.global(unidadMedida, '0', 'Nombre anterior', 2);
    await actual.global(unidadMedida, 'ZZZ', 'Se da de baja', 99);
  });

  describe('aplicar', () => {
    it('responde sin escribir ítems: deja EN_COLA, encola el trabajo y avisa 0 %', async () => {
      const escriturasPrevias = actual.items.escrituras;
      const previa = await previsualizar(unidades(3));
      expect(await aplicar(previa.id)).toEqual({ id: previa.id, estado: 'EN_COLA' });
      expect(await estadoDe(previa.id)).toBe('EN_COLA');
      expect(actual.cola.trabajos).toEqual([{ importacionId: previa.id, tenantId: OPERADOR, usuarioId: ANA }]);
      expect(avisosDe(previa.id)).toEqual([{ tipo: 'avance', estado: 'EN_COLA', avance: 0 }]);
      expect(actual.items.escrituras).toBe(escriturasPrevias);
    });

    it('una segunda del mismo catálogo mientras otra está en cola da IMPORTACION_EN_CURSO', async () => {
      await enCola();
      const otra = await previsualizar(unidades(2));
      await expect(aplicar(otra.id)).rejects.toThrow(ImportacionEnCursoError);
      expect(await estadoDe(otra.id)).toBe('PREVISUALIZADA');
    });

    it('con la cola caída responde COLA_NO_DISPONIBLE y la importación sigue PREVISUALIZADA', async () => {
      const previa = await previsualizar(unidades(2));
      actual.cola.caida = true;
      await expect(aplicar(previa.id)).rejects.toThrow(ColaNoDisponibleError);
      const importacion = await actual.importaciones.buscar(previa.id);
      expect(importacion).toMatchObject({ estado: 'PREVISUALIZADA', aplicadoPor: null, encoladoEn: null });
      actual.cola.caida = false;
      await expect(aplicar(previa.id, importacion?.version)).resolves.toMatchObject({ estado: 'EN_COLA' });
    });

    it('a las 24 h responde IMPORTACION_NO_APLICABLE y la deja VENCIDA', async () => {
      const previa = await previsualizar(unidades(2));
      actual.fijarAhora(new Date(AHORA.getTime() + 24 * HORA));
      await expect(aplicar(previa.id)).rejects.toThrow('La importación está en estado VENCIDA y no se puede aplicar');
      expect(await estadoDe(previa.id)).toBe('VENCIDA');
      expect(actual.cola.trabajos).toEqual([]);
    });

    it('con otra versión da VERSION_OBSOLETA y una ya en cola, IMPORTACION_NO_APLICABLE', async () => {
      const previa = await previsualizar(unidades(2));
      await expect(aplicar(previa.id, 7)).rejects.toThrow(VersionObsoletaError);
      await aplicar(previa.id);
      await expect(aplicar(previa.id, 1)).rejects.toThrow(ImportacionNoAplicableError);
    });

    it('una EN_COLA del catálogo con el trabajo perdido hace más de 1 h queda FALLIDA y libera la cola', async () => {
      const { id: perdida } = await enCola();
      actual.fijarAhora(new Date(AHORA.getTime() + 2 * HORA));
      const nueva = await previsualizar(unidades(2));
      await expect(aplicar(nueva.id)).resolves.toMatchObject({ estado: 'EN_COLA' });
      expect(await actual.importaciones.buscar(perdida)).toMatchObject({ estado: 'FALLIDA', motivoFallo: 'Trabajo perdido en la cola' });
    });
  });

  describe('procesar en el worker', () => {
    it('aplica en lotes de 1 000, sube la versión una vez y escribe los dos eventos en la transacción', async () => {
      const { id, trabajo } = await enCola();
      const versionAntes = (await actual.catalogos.buscarPorId(unidadMedida.id))?.version ?? 0;
      await procesar(trabajo);

      expect(actual.escritura.lotes).toEqual(['ALTA:0-1000', 'ALTA:1000-2000', 'ALTA:2000-2500', 'CAMBIO:0-1']);
      expect(actual.escritura.bajasCerradas).toBe(1);
      expect(await actual.importaciones.buscar(id)).toMatchObject({ estado: 'APLICADA', aplicadoPor: ANA, operaciones: null });
      const versionDespues = (await actual.catalogos.buscarPorId(unidadMedida.id))?.version;
      expect(versionDespues).toBe(versionAntes + 1);

      const eventos = actual.publicados.filter((evento) => evento.aggregateId === unidadMedida.id);
      expect(eventos.map((evento) => evento.eventType)).toEqual(['catalogo.actualizado', 'catalogo.importacion_aplicada']);
      expect(eventos[0]?.payload).toEqual({
        catalogo_id: unidadMedida.id,
        codigo: 'UNIDAD_MEDIDA',
        version_global: versionDespues,
        version_tenant: 0,
        tenant_id: null,
        cambio: 'IMPORTACION',
        item_id: null,
        por: ANA,
      });
      expect(eventos[1]?.payload).toMatchObject({ importacion_id: id, altas: 2_500, cambios: 1, bajas: 1, version_global: versionDespues, por: ANA });
      expect(JSON.stringify(eventos[1]?.payload)).not.toMatch(/@/);
    });

    it('los avisos crecen hasta 99 y terminan en `fin` APLICADA con el resumen', async () => {
      const { id, trabajo } = await enCola();
      await procesar(trabajo);
      const avisos = avisosDe(id);
      const avances = avisos.flatMap((aviso) => (aviso.tipo === 'avance' ? [aviso.avance] : []));
      expect(avances).toEqual([...avances].sort((uno, otro) => uno - otro));
      expect(Math.max(...avances)).toBe(99);
      expect(avisos.slice(1, 2)).toEqual([{ tipo: 'avance', estado: 'EN_PROCESO', avance: 0 }]);
      expect(avisos.at(-1)).toEqual({ tipo: 'fin', estado: 'APLICADA', resumen: { altas: 2_500, cambios: 1, bajas: 1, sin_cambios: 0 }, motivo: null });
    });

    it('un fallo en el tercer lote la deja FALLIDA con motivo, sin eventos ni versión nueva, y no relanza', async () => {
      const { id, trabajo } = await enCola();
      const versionAntes = (await actual.catalogos.buscarPorId(unidadMedida.id))?.version;
      actual.escritura.fallarEnLote = 3;
      await expect(procesar(trabajo)).resolves.toBeUndefined();

      const importacion = await actual.importaciones.buscar(id);
      expect(importacion?.estado).toBe('FALLIDA');
      expect(importacion?.motivoFallo).toBe('No se pudo aplicar la importación: duplicate key value violates unique constraint "ux_cat_item"');
      expect(actual.publicados.filter((evento) => evento.aggregateId === unidadMedida.id)).toEqual([]);
      expect((await actual.catalogos.buscarPorId(unidadMedida.id))?.version).toBe(versionAntes);
      expect(avisosDe(id).at(-1)).toEqual({ tipo: 'fin', estado: 'FALLIDA', resumen: null, motivo: importacion?.motivoFallo });
      expect(actual.avisos).toContainEqual(expect.objectContaining({ evento: 'cat.importacion.fallida', error: 'Error' }));
    });

    it('si el catálogo cambió desde la previsualización termina OBSOLETA sin escribir', async () => {
      const { id, trabajo } = await enCola();
      actual.escritura.iniciarDevuelve = false;
      await procesar(trabajo);
      expect(await estadoDe(id)).toBe('OBSOLETA');
      expect(actual.escritura.lotes).toEqual([]);
      expect(avisosDe(id).at(-1)).toMatchObject({ tipo: 'fin', estado: 'OBSOLETA', resumen: null });
    });

    it('reprocesar un trabajo ya aplicado no escribe nada', async () => {
      const { trabajo } = await enCola();
      await procesar(trabajo);
      const lotes = actual.escritura.lotes.length;
      const eventos = actual.publicados.length;
      await procesar(trabajo);
      expect(actual.escritura.lotes).toHaveLength(lotes);
      expect(actual.publicados).toHaveLength(eventos);
    });

    it('con Redis caído al publicar el avance registra el aviso y la importación se aplica igual', async () => {
      const { id, trabajo } = await enCola();
      actual.procesar.canal = {
        publicar: async () => {
          throw new Error('Connection is closed.');
        },
        ultimo: async () => null,
        suscribir: () => actual.canal.suscribir(id),
      };
      await procesar(trabajo);
      expect(await estadoDe(id)).toBe('APLICADA');
      expect(actual.avisos).toContainEqual(expect.objectContaining({ evento: 'cat.importacion.avance_error', importacionId: id, error: 'Error' }));
    });
  });
});
