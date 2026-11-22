import { createHash } from 'node:crypto';
import { NUMERO_PRIMERA_VERSION, type Archivo, type ContenidoAnalizado, type ContenidoInfectado } from '../domain/archivo.js';
import type { CategoriaArchivo } from '../domain/categoria.js';
import { CategoriaDesconocidaError } from '../domain/errores.js';
import { mensajeRechazoCarga, mensajeRechazoVersion } from '../domain/mensaje-rechazo-version.js';
import { evaluarAnalisis, type HallazgosAnalisis, type ResultadoAnalisis } from '../domain/resultado-analisis.js';
import { publicarEventosDe, type DependenciasAnalisis } from './dependencias-archivos.js';
import type { ResultadoAntivirus } from './ports/analizador-antivirus.js';
import type { ResultadoAnalisis as ResultadoPublicado } from './ports/canal-analisis.js';
import type { TrabajoAnalisis } from './ports/cola-analisis.js';

const FIRMA_SIN_NOMBRE = 'DESCONOCIDA';

interface ArchivoConCategoria {
  archivo: Archivo;
  categoria: CategoriaArchivo;
}

/** Lo medido sobre los bytes reales. `mimeReal` nulo: el detector no reconoció el contenido. */
interface Medicion {
  hash: string;
  bytes: number;
  mimeReal: string | null;
  antivirus: ResultadoAntivirus;
}

/**
 * TR-RF-080 y 081, en el worker: lee los bytes de la versión del trabajo, calcula el SHA-256, detecta el
 * tipo real, lo compara con las demás versiones y pasa el antivirus. La primera carga deja el archivo
 * `DISPONIBLE`, `RECHAZADO` o en `CUARENTENA`; una versión nueva queda vigente, en `CUARENTENA` o se borra.
 * Los bytes se leen y se analizan fuera de la transacción. Idempotente: una versión que ya no está
 * `EN_ANALISIS` no se toca. Un fallo de Storage, del antivirus o un conflicto de bloqueo optimista se relanza
 * para que la cola reintente; la versión sigue `EN_ANALISIS`.
 */
export class AnalizarArchivo {
  constructor(private readonly dependencias: DependenciasAnalisis) {}

  ejecutar(trabajo: TrabajoAnalisis): Promise<void> {
    const numero = trabajo.numero ?? NUMERO_PRIMERA_VERSION;
    return this.dependencias.contexto.run({ tenantId: trabajo.tenantId }, () => this.analizar(trabajo.archivoId, numero));
  }

  private async analizar(archivoId: string, numero: number): Promise<void> {
    const cargado = await this.dependencias.unidadDeTrabajo.run(() => this.cargar(archivoId));
    if (!cargado) return;
    if (numero === NUMERO_PRIMERA_VERSION) return this.analizarPrimeraCarga(cargado);
    return this.analizarVersionNueva(cargado, numero);
  }

  private async analizarPrimeraCarga({ archivo, categoria }: ArchivoConCategoria): Promise<void> {
    const { almacen } = this.dependencias;
    const ruta = archivo.primeraVersion.rutaStorage;
    // Un intento anterior guardó el rechazo y cayó antes de borrar: el borrado no falla si ya no existe.
    if (fueRechazado(archivo)) return almacen.borrar(ruta);
    if (archivo.estado !== 'EN_ANALISIS') return;

    const medicion = await this.leerYMedir(ruta);
    if (medicion === null) {
      archivo.devolverAPendiente();
    } else {
      aplicarResultadoPrimeraCarga(archivo, evaluarAnalisis(categoria, archivo.primeraVersion, hallazgosDe(medicion, null)), medicion);
    }
    await this.guardarConEventos(archivo);
    await this.publicarResultado(resultadoPrimeraCarga(archivo));
    if (fueRechazado(archivo)) await almacen.borrar(ruta);
  }

  /**
   * Una versión inexistente o fuera de análisis no se toca, ni su objeto: la ruta puede ser ya la de un
   * intento nuevo con el mismo número (lo que quede de un rechazo lo borra `SolicitarVersion`).
   */
  private async analizarVersionNueva({ archivo, categoria }: ArchivoConCategoria, numero: number): Promise<void> {
    const version = archivo.versionNumero(numero);
    if (version?.estado !== 'EN_ANALISIS') return;
    const ruta = version.rutaStorage;
    const { subidoPor } = version;

    const medicion = await this.leerYMedir(ruta);
    let rechazada = false;
    if (medicion === null) {
      archivo.devolverVersionAPendiente(numero);
    } else {
      const versionCoincidente = archivo.versionConHash(medicion.hash)?.numero ?? null;
      const resultado = evaluarAnalisis(categoria, version, hallazgosDe(medicion, versionCoincidente));
      rechazada = aplicarResultadoVersion(archivo, numero, resultado, medicion, versionCoincidente);
    }
    await this.guardarConEventos(archivo);
    await this.publicarResultado(resultadoVersion(archivo, numero, subidoPor));
    if (rechazada) await this.dependencias.almacen.borrar(ruta);
  }

  private async cargar(archivoId: string): Promise<ArchivoConCategoria | null> {
    const { archivos } = this.dependencias;
    const archivo = await archivos.obtener(archivoId);
    if (!archivo) return null;
    const categoria = await archivos.buscarCategoria(archivo.categoria);
    if (!categoria) throw new CategoriaDesconocidaError();
    return { archivo, categoria };
  }

  /** `null` si el objeto no existe: el cliente confirmó sin haberlo subido. */
  private async leerYMedir(ruta: string): Promise<Medicion | null> {
    const contenido = await this.dependencias.almacen.leer(ruta);
    return contenido === null ? null : this.medir(contenido);
  }

  private async medir(contenido: Uint8Array): Promise<Medicion> {
    const { detector, antivirus } = this.dependencias;
    return {
      hash: createHash('sha256').update(contenido).digest('hex'),
      bytes: contenido.byteLength,
      mimeReal: await detector.detectar(contenido),
      antivirus: await antivirus.analizar(contenido),
    };
  }

  /**
   * Después de confirmar la transacción: un mensaje de una transacción revertida mentiría. Con Redis caído no
   * relanza; el resultado ya está en la base y el SSE lo lee al conectar.
   */
  private async publicarResultado(resultado: ResultadoPublicado | null): Promise<void> {
    if (resultado === null) return;
    try {
      await this.dependencias.canal.publicar(resultado);
    } catch (error) {
      this.dependencias.alFallarCanal(error);
    }
  }

  private guardarConEventos(archivo: Archivo): Promise<void> {
    return this.dependencias.unidadDeTrabajo.run(async () => {
      await this.dependencias.archivos.guardar(archivo);
      await publicarEventosDe(this.dependencias.publicador, archivo);
    });
  }
}

const ESTADOS_TERMINADOS: readonly string[] = ['DISPONIBLE', 'CUARENTENA', 'RECHAZADO'];

function esTerminado(estado: string): estado is ResultadoPublicado['resultado'] {
  return ESTADOS_TERMINADOS.includes(estado);
}

/** `null` si el archivo volvió a pendiente (se confirmó sin subir): no hay resultado que avisar. */
function resultadoPrimeraCarga(archivo: Archivo): ResultadoPublicado | null {
  if (!esTerminado(archivo.estado)) return null;
  const base = { archivoId: archivo.id, numero: NUMERO_PRIMERA_VERSION, resultado: archivo.estado, subidoPor: archivo.primeraVersion.subidoPor };
  const motivo = archivo.motivoRechazo;
  return motivo === null ? base : { ...base, motivoRechazo: motivo, mensaje: mensajeRechazoCarga(motivo) };
}

/** Un intento rechazado ya no está en el archivo: queda su rechazo, y quién lo subió llega aparte. */
function resultadoVersion(archivo: Archivo, numero: number, subidoPor: string): ResultadoPublicado | null {
  const version = archivo.versionNumero(numero);
  const base = { archivoId: archivo.id, numero, subidoPor };
  if (version !== null) return esTerminado(version.estado) ? { ...base, resultado: version.estado } : null;
  const rechazo = archivo.rechazoVersion;
  if (rechazo === null) return null;
  return {
    ...base,
    resultado: 'RECHAZADO',
    motivoRechazo: rechazo.motivo,
    ...(rechazo.versionCoincidente !== null && { versionCoincidente: rechazo.versionCoincidente }),
    mensaje: mensajeRechazoVersion(rechazo, archivo.versionVigente),
  };
}

/** En una función aparte: el compilador da por fijo el estado que ya comprobó y las transiciones lo cambian. */
function fueRechazado(archivo: Archivo): boolean {
  return archivo.estado === 'RECHAZADO';
}

function hallazgosDe(medicion: Medicion, versionCoincidente: number | null): HallazgosAnalisis {
  return { bytes: medicion.bytes, mimeReal: medicion.mimeReal, limpio: medicion.antivirus.limpio, versionCoincidente };
}

/** La primera carga no tiene otra versión con la que coincidir: nunca llega `IDENTICA`. */
function aplicarResultadoPrimeraCarga(archivo: Archivo, resultado: ResultadoAnalisis, medicion: Medicion): void {
  if (resultado === 'IDENTICA') throw new Error('La primera carga no puede coincidir con otra versión');
  if (resultado === 'TAMANO_NO_COINCIDE' || resultado === 'TIPO_NO_PERMITIDO') return archivo.rechazar(resultado);
  if (resultado === 'INFECTADO') return archivo.ponerEnCuarentena(contenidoInfectado(medicion));
  archivo.aprobar(contenidoAnalizado(medicion));
}

/** Devuelve si la versión se rechazó: entonces su objeto se borra después de guardar. */
function aplicarResultadoVersion(
  archivo: Archivo,
  numero: number,
  resultado: ResultadoAnalisis,
  medicion: Medicion,
  versionCoincidente: number | null,
): boolean {
  if (resultado === 'TAMANO_NO_COINCIDE' || resultado === 'TIPO_NO_PERMITIDO' || resultado === 'IDENTICA') {
    archivo.rechazarVersion(numero, { motivo: resultado, versionCoincidente: resultado === 'IDENTICA' ? versionCoincidente : null });
    return true;
  }
  if (resultado === 'INFECTADO') archivo.ponerVersionEnCuarentena(numero, contenidoInfectado(medicion));
  else archivo.aprobarVersion(numero, contenidoAnalizado(medicion));
  return false;
}

function contenidoInfectado(medicion: Medicion): ContenidoInfectado {
  return { ...contenidoAnalizado(medicion), firma: medicion.antivirus.firma ?? FIRMA_SIN_NOMBRE };
}

/** `evaluarAnalisis` rechaza por tipo todo contenido sin MIME reconocido: aquí siempre llega con uno. */
function contenidoAnalizado(medicion: Medicion): ContenidoAnalizado {
  if (medicion.mimeReal === null) throw new Error('El análisis no rechazó un contenido sin tipo reconocido');
  return { hash: medicion.hash, bytes: medicion.bytes, mimeReal: medicion.mimeReal };
}
