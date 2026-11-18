import { ArchivoNoEncontradoError } from '../domain/errores.js';
import type { DependenciasArchivos } from './dependencias-archivos.js';
import type { EstadoArchivo } from './ports/archivo.port.js';
import { estadoDe } from './vista-archivo.js';

/** Estado de un archivo del tenant del contexto. Uno de otro tenant no existe (TR-CA-205). */
export class ConsultarEstadoArchivo {
  constructor(private readonly dependencias: Pick<DependenciasArchivos, 'unidadDeTrabajo' | 'archivos'>) {}

  ejecutar(archivoId: string): Promise<EstadoArchivo> {
    const { unidadDeTrabajo, archivos } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const archivo = await archivos.obtener(archivoId);
      if (!archivo) throw new ArchivoNoEncontradoError();
      return estadoDe(archivo);
    });
  }
}
