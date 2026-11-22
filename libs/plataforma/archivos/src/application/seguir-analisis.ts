import { NUMERO_PRIMERA_VERSION, type Archivo } from '../domain/archivo.js';
import { AnalisisNoIniciadoError, ArchivoNoEncontradoError, VersionNoEncontradaError } from '../domain/errores.js';
import { mensajeRechazoCarga } from '../domain/mensaje-rechazo-version.js';
import type { DependenciasArchivos } from './dependencias-archivos.js';
import { esResultadoSeguimiento, type CanalAnalisis, type ResultadoAnalisis, type ResultadoSeguimiento } from './ports/canal-analisis.js';

export interface SeguirAnalisisComando {
  archivoId: string;
  numero: number;
  usuarioId: string;
  /** Se aborta cuando el cliente corta o el stream llega a su tiempo máximo. */
  senal: AbortSignal;
}

/** Lo que recibe el cliente por SSE. Sin `subidoPor` ni datos del objeto. */
export type AvisoAnalisis =
  | { tipo: 'estado'; numero: number; estado: 'EN_ANALISIS' }
  | {
      tipo: 'fin';
      numero: number;
      resultado: ResultadoSeguimiento;
      motivo?: string;
      version_coincidente?: number;
      mensaje?: string;
    };

export interface DependenciasSeguimiento extends Pick<DependenciasArchivos, 'unidadDeTrabajo' | 'archivos'> {
  canal: CanalAnalisis;
}

/**
 * El análisis de una carga (versión 1) o de una versión, para el SSE: solo para quien la subió (a cualquier
 * otro, 404). Se suscribe antes de leer el estado: un resultado que llega en medio lo encuentra la lectura o
 * lo entrega el canal. Si ya terminó entrega solo el `fin`; si sigue en análisis, `estado` y después el `fin`.
 */
export class SeguirAnalisis {
  constructor(private readonly dependencias: DependenciasSeguimiento) {}

  async ejecutar(comando: SeguirAnalisisComando): Promise<AsyncIterable<AvisoAnalisis>> {
    const { archivoId, numero, usuarioId } = comando;
    await this.exigirArchivoDelTenant(archivoId);
    // La suscripción se suelta al terminar el stream por cualquier motivo, no solo cuando el cliente corta.
    const fin = new AbortController();
    comando.senal.addEventListener('abort', () => fin.abort(), { once: true });
    const suscripcion = this.dependencias.canal.suscribir(archivoId, numero, fin.signal)[Symbol.asyncIterator]();
    const primeroDelCanal = suscripcion.next();
    // Con Redis caído la suscripción falla: si el fin sale de la base, nadie espera esa promesa.
    primeroDelCanal.catch(() => undefined);
    let final: AvisoAnalisis | null;
    try {
      final = (await this.ultimoDelCanal(archivoId, numero, usuarioId)) ?? (await this.finDeLaBase(archivoId, numero, usuarioId));
    } catch (error) {
      await soltar(fin, suscripcion);
      throw error;
    }
    if (final === null) return avisosHastaElFin(numero, primeroDelCanal, suscripcion, fin);
    await soltar(fin, suscripcion);
    return soloElFin(final);
  }

  private exigirArchivoDelTenant(archivoId: string): Promise<void> {
    const { unidadDeTrabajo, archivos } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      if (!(await archivos.obtener(archivoId))) throw new ArchivoNoEncontradoError();
    });
  }

  /** Redis caído no impide seguir: se arranca desde el estado de la base. */
  private async ultimoDelCanal(archivoId: string, numero: number, usuarioId: string): Promise<AvisoAnalisis | null> {
    const ultimo = await this.dependencias.canal.ultimo(archivoId, numero).catch(() => null);
    if (ultimo === null) return null;
    if (ultimo.subidoPor !== usuarioId) throw new ArchivoNoEncontradoError();
    return avisoDe(ultimo);
  }

  /** `null` si la versión sigue en análisis. Se lee después de suscribirse. */
  private finDeLaBase(archivoId: string, numero: number, usuarioId: string): Promise<AvisoAnalisis | null> {
    const { unidadDeTrabajo, archivos } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const archivo = await archivos.obtener(archivoId);
      if (!archivo) throw new ArchivoNoEncontradoError();
      const version = archivo.versionNumero(numero);
      if (!version) throw new VersionNoEncontradaError();
      if (version.subidoPor !== usuarioId) throw new ArchivoNoEncontradoError();
      if (version.estado === 'PENDIENTE_CARGA') throw new AnalisisNoIniciadoError();
      return esResultadoSeguimiento(version.estado) ? finDeVersion(archivo, numero, version.estado) : null;
    });
  }
}

/** Solo la primera carga guarda su motivo en el archivo; una versión rechazada ya no existe en la base. */
function finDeVersion(archivo: Archivo, numero: number, resultado: ResultadoSeguimiento): AvisoAnalisis {
  const motivo = numero === NUMERO_PRIMERA_VERSION ? archivo.motivoRechazo : null;
  if (motivo === null) return { tipo: 'fin', numero, resultado };
  return { tipo: 'fin', numero, resultado, motivo, mensaje: mensajeRechazoCarga(motivo) };
}

function avisoDe(resultado: ResultadoAnalisis): AvisoAnalisis {
  return {
    tipo: 'fin',
    numero: resultado.numero,
    resultado: resultado.resultado,
    ...(resultado.motivoRechazo !== undefined && { motivo: resultado.motivoRechazo }),
    ...(resultado.versionCoincidente !== undefined && { version_coincidente: resultado.versionCoincidente }),
    ...(resultado.mensaje !== undefined && { mensaje: resultado.mensaje }),
  };
}

async function* avisosHastaElFin(
  numero: number,
  primeroDelCanal: Promise<IteratorResult<ResultadoAnalisis>>,
  suscripcion: AsyncIterator<ResultadoAnalisis>,
  fin: AbortController,
): AsyncGenerator<AvisoAnalisis> {
  try {
    yield { tipo: 'estado', numero, estado: 'EN_ANALISIS' };
    const primero = await primeroDelCanal;
    if (!primero.done) yield avisoDe(primero.value);
  } finally {
    await soltar(fin, suscripcion);
  }
}

/** abort despierta una espera pendiente; return cierra la suscripción si quedó detenida. */
async function soltar(fin: AbortController, suscripcion: AsyncIterator<ResultadoAnalisis>): Promise<void> {
  fin.abort();
  await suscripcion.return?.();
}

async function* soloElFin(final: AvisoAnalisis): AsyncGenerator<AvisoAnalisis> {
  yield final;
}
