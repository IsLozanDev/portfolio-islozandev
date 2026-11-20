import { NUMERO_PRIMERA_VERSION, type Archivo } from '../domain/archivo.js';
import { ArchivoNoEncontradoError } from '../domain/errores.js';
import { encolarAnalisis, type DependenciasArchivos } from './dependencias-archivos.js';
import type { EstadoArchivo } from './ports/archivo.port.js';
import { estadoDe } from './vista-archivo.js';

/**
 * El cliente avisa que ya subió el objeto: el archivo pasa a `EN_ANALISIS` y se encola su análisis después
 * de confirmar la transacción. Idempotente: un archivo que ya está `EN_ANALISIS` se vuelve a encolar con el
 * mismo `jobId` (cubre un encolado que falló); en cualquier otro estado se devuelve tal cual, sin encolar.
 */
export class ConfirmarCarga {
  constructor(private readonly dependencias: DependenciasArchivos) {}

  async ejecutar(archivoId: string): Promise<EstadoArchivo> {
    const archivo = await this.dependencias.unidadDeTrabajo.run(() => this.confirmar(archivoId));
    if (archivo.estado === 'EN_ANALISIS') {
      await encolarAnalisis(this.dependencias.cola, { tenantId: archivo.tenantId, archivoId: archivo.id, numero: NUMERO_PRIMERA_VERSION });
    }
    return estadoDe(archivo);
  }

  private async confirmar(archivoId: string): Promise<Archivo> {
    const { archivos } = this.dependencias;
    const archivo = await archivos.obtener(archivoId);
    if (!archivo) throw new ArchivoNoEncontradoError();
    if (archivo.confirmarCarga()) await archivos.guardar(archivo);
    return archivo;
  }
}
