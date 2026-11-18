import type { Archivo } from '../domain/archivo.js';
import { AlmacenNoDisponibleError, ArchivoNoEncontradoError } from '../domain/errores.js';
import type { DependenciasArchivos } from './dependencias-archivos.js';
import type { EstadoArchivo } from './ports/archivo.port.js';
import { estadoDe } from './vista-archivo.js';

const CODIGO_COLA_CAIDA = 'cola_analisis';

/**
 * El cliente avisa que ya subió el objeto: el archivo pasa a `EN_ANALISIS` y se encola su análisis después
 * de confirmar la transacción. Idempotente: un archivo que ya está `EN_ANALISIS` se vuelve a encolar con el
 * mismo `jobId` (cubre un encolado que falló); en cualquier otro estado se devuelve tal cual, sin encolar.
 */
export class ConfirmarCarga {
  constructor(private readonly dependencias: DependenciasArchivos) {}

  async ejecutar(archivoId: string): Promise<EstadoArchivo> {
    const archivo = await this.dependencias.unidadDeTrabajo.run(() => this.confirmar(archivoId));
    if (archivo.estado === 'EN_ANALISIS') await this.encolarAnalisis(archivo);
    return estadoDe(archivo);
  }

  private async confirmar(archivoId: string): Promise<Archivo> {
    const { archivos } = this.dependencias;
    const archivo = await archivos.obtener(archivoId);
    if (!archivo) throw new ArchivoNoEncontradoError();
    if (archivo.confirmarCarga()) await archivos.guardar(archivo);
    return archivo;
  }

  /** Con la cola caída el archivo queda `EN_ANALISIS` sin trabajo: el cliente recibe 503 y confirma otra vez. */
  private async encolarAnalisis(archivo: Archivo): Promise<void> {
    try {
      await this.dependencias.cola.encolar({ tenantId: archivo.tenantId, archivoId: archivo.id });
    } catch {
      throw new AlmacenNoDisponibleError(CODIGO_COLA_CAIDA);
    }
  }
}
