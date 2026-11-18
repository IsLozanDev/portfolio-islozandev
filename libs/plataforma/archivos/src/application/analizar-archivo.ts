import { createHash } from 'node:crypto';
import type { Archivo, ContenidoAnalizado } from '../domain/archivo.js';
import type { CategoriaArchivo } from '../domain/categoria.js';
import { CategoriaDesconocidaError } from '../domain/errores.js';
import { evaluarAnalisis, type HallazgosAnalisis, type ResultadoAnalisis } from '../domain/resultado-analisis.js';
import { publicarEventosDe, type DependenciasAnalisis } from './dependencias-archivos.js';
import type { ResultadoAntivirus } from './ports/analizador-antivirus.js';
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
 * TR-RF-080, en el worker: lee los bytes, calcula el SHA-256, detecta el tipo real y pasa el antivirus; deja
 * el archivo `DISPONIBLE`, `RECHAZADO` o en `CUARENTENA`. Los bytes se leen y se analizan fuera de la
 * transacción. Idempotente: un archivo que ya no está `EN_ANALISIS` no se toca. Un fallo de Storage o del
 * antivirus se relanza para que la cola reintente; el archivo sigue `EN_ANALISIS`.
 */
export class AnalizarArchivo {
  constructor(private readonly dependencias: DependenciasAnalisis) {}

  ejecutar(trabajo: TrabajoAnalisis): Promise<void> {
    return this.dependencias.contexto.run({ tenantId: trabajo.tenantId }, () => this.analizar(trabajo.archivoId));
  }

  private async analizar(archivoId: string): Promise<void> {
    const { unidadDeTrabajo, almacen } = this.dependencias;
    const cargado = await unidadDeTrabajo.run(() => this.cargar(archivoId));
    if (!cargado) return;
    const { archivo, categoria } = cargado;
    const ruta = archivo.primeraVersion.rutaStorage;
    // Un intento anterior guardó el rechazo y cayó antes de borrar: el borrado no falla si ya no existe.
    if (fueRechazado(archivo)) return almacen.borrar(ruta);
    if (archivo.estado !== 'EN_ANALISIS') return;

    const contenido = await almacen.leer(ruta);
    if (contenido === null) {
      archivo.devolverAPendiente();
    } else {
      const medicion = await this.medir(contenido);
      aplicarResultado(archivo, evaluarAnalisis(categoria, archivo.primeraVersion, hallazgosDe(medicion)), medicion);
    }
    await unidadDeTrabajo.run(() => this.guardarConEventos(archivo));
    if (fueRechazado(archivo)) await almacen.borrar(ruta);
  }

  private async cargar(archivoId: string): Promise<ArchivoConCategoria | null> {
    const { archivos } = this.dependencias;
    const archivo = await archivos.obtener(archivoId);
    if (!archivo) return null;
    const categoria = await archivos.buscarCategoria(archivo.categoria);
    if (!categoria) throw new CategoriaDesconocidaError();
    return { archivo, categoria };
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

  private async guardarConEventos(archivo: Archivo): Promise<void> {
    await this.dependencias.archivos.guardar(archivo);
    await publicarEventosDe(this.dependencias.publicador, archivo);
  }
}

/** En una función aparte: el compilador da por fijo el estado que ya comprobó y las transiciones lo cambian. */
function fueRechazado(archivo: Archivo): boolean {
  return archivo.estado === 'RECHAZADO';
}

function hallazgosDe(medicion: Medicion): HallazgosAnalisis {
  return { bytes: medicion.bytes, mimeReal: medicion.mimeReal, limpio: medicion.antivirus.limpio };
}

function aplicarResultado(archivo: Archivo, resultado: ResultadoAnalisis, medicion: Medicion): void {
  if (resultado === 'TAMANO_NO_COINCIDE' || resultado === 'TIPO_NO_PERMITIDO') return archivo.rechazar(resultado);
  const contenido = contenidoAnalizado(medicion);
  if (resultado === 'INFECTADO') return archivo.ponerEnCuarentena({ ...contenido, firma: medicion.antivirus.firma ?? FIRMA_SIN_NOMBRE });
  archivo.aprobar(contenido);
}

/** `evaluarAnalisis` rechaza por tipo todo contenido sin MIME reconocido: aquí siempre llega con uno. */
function contenidoAnalizado(medicion: Medicion): ContenidoAnalizado {
  if (medicion.mimeReal === null) throw new Error('El análisis no rechazó un contenido sin tipo reconocido');
  return { hash: medicion.hash, bytes: medicion.bytes, mimeReal: medicion.mimeReal };
}
