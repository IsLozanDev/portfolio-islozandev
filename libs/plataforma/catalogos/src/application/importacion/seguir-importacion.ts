import { ImportacionNoAplicableError, ImportacionNoEncontradaError } from '../../domain/importacion/errores.js';
import type { Importacion } from '../../domain/importacion/importacion.js';
import { exigirOperador } from '../dependencias-catalogos.js';
import type { AvisoImportacion } from '../ports/importacion.js';
import { resumenDeAviso } from './avance.js';
import { buscarImportacion, type DependenciasImportacion } from './dependencias-importacion.js';

const MOTIVO_OBSOLETA = 'El catálogo cambió desde la previsualización; vuelva a previsualizar';
const AVISO_EN_COLA: AvisoImportacion = { tipo: 'avance', estado: 'EN_COLA', avance: 0 };

export interface SeguirImportacionComando {
  id: string;
  actorId: string;
  /** Se aborta cuando el cliente corta o el stream llega a su tiempo máximo. */
  senal: AbortSignal;
}

/**
 * Avance de una importación para el SSE: solo para quien la lanzó (a cualquier otro, 404). Lo primero es
 * el estado actual: el `fin` de la base si ya terminó, si no el último aviso de Redis. Después, cada aviso
 * del canal hasta el `fin`.
 */
export class SeguirImportacion {
  constructor(private readonly dependencias: DependenciasImportacion) {}

  async ejecutar(comando: SeguirImportacionComando): Promise<AsyncIterable<AvisoImportacion>> {
    const importacion = await this.importacionDelActor(comando);
    const final = finDeLaBase(importacion);
    if (final) return soloElFin(final);
    if (importacion.estado !== 'EN_COLA') throw new ImportacionNoAplicableError(importacion.estado);

    // La suscripción se suelta al terminar el stream por cualquier motivo, no solo cuando el cliente corta.
    const fin = new AbortController();
    comando.senal.addEventListener('abort', () => fin.abort(), { once: true });
    // Se suscribe antes de leer el último aviso: así no se pierde uno publicado entre ambos pasos.
    const suscripcion = this.dependencias.canal.suscribir(importacion.id, fin.signal)[Symbol.asyncIterator]();
    const primeroDelCanal = suscripcion.next();
    const actual = (await this.ultimoAviso(importacion.id)) ?? AVISO_EN_COLA;
    return avisosHastaElFin(actual, primeroDelCanal, suscripcion, fin);
  }

  private importacionDelActor(comando: SeguirImportacionComando): Promise<Importacion> {
    const { unidadDeTrabajo, importaciones } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const importacion = await buscarImportacion(importaciones, comando.id);
      if (importacion.lanzadoPor !== comando.actorId) throw new ImportacionNoEncontradaError();
      return importacion;
    });
  }

  /** Redis caído no impide seguir: se arranca desde el estado de la base. */
  private async ultimoAviso(importacionId: string): Promise<AvisoImportacion | null> {
    try {
      return await this.dependencias.canal.ultimo(importacionId);
    } catch {
      return null;
    }
  }
}

async function* avisosHastaElFin(
  actual: AvisoImportacion,
  primeroDelCanal: Promise<IteratorResult<AvisoImportacion>>,
  suscripcion: AsyncIterator<AvisoImportacion>,
  fin: AbortController,
): AsyncGenerator<AvisoImportacion> {
  try {
    yield actual;
    if (actual.tipo === 'fin') return;
    for (let resultado = await primeroDelCanal; !resultado.done; resultado = await suscripcion.next()) {
      yield resultado.value;
      if (resultado.value.tipo === 'fin') return;
    }
  } finally {
    // abort despierta una espera pendiente; return cierra la suscripción si quedó detenida en un yield.
    fin.abort();
    await suscripcion.return?.();
  }
}

async function* soloElFin(fin: AvisoImportacion): AsyncGenerator<AvisoImportacion> {
  yield fin;
}

function finDeLaBase(importacion: Importacion): AvisoImportacion | null {
  const { estado, motivoFallo } = importacion;
  if (estado === 'APLICADA') return { tipo: 'fin', estado, resumen: resumenDeAviso(importacion.resumen), motivo: null };
  if (estado === 'FALLIDA') return { tipo: 'fin', estado, resumen: null, motivo: motivoFallo };
  if (estado === 'OBSOLETA') return { tipo: 'fin', estado, resumen: null, motivo: motivoFallo ?? MOTIVO_OBSOLETA };
  return null;
}
