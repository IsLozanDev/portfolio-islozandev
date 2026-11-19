import type { Archivo, VersionArchivo } from '../../domain/archivo.js';
import type { CategoriaArchivo } from '../../domain/categoria.js';

/** Una versión tal como quedó guardada, con su fecha de subida (el agregado no la lleva). */
export interface VersionRegistrada extends Readonly<VersionArchivo> {
  subidoEn: Date;
}

/** Archivos del tenant del contexto. Un archivo de otro tenant no existe para quien consulta (TR-CA-205). */
export interface RepositorioArchivos {
  /** El archivo con todas sus versiones. */
  obtener(archivoId: string): Promise<Archivo | null>;
  /**
   * Lanza `ConflictError` si otra operación cambió el archivo desde que se leyó. Sincroniza las versiones:
   * inserta las nuevas, actualiza las cambiadas y borra las que el archivo descartó.
   */
  guardar(archivo: Archivo): Promise<void>;
  /** Borra el archivo con sus versiones. No falla si ya no existe. */
  eliminar(archivoId: string): Promise<void>;
  buscarCategoria(codigo: string): Promise<CategoriaArchivo | null>;
  /** Por número. Vacío si el archivo no existe. */
  listarVersiones(archivoId: string): Promise<VersionRegistrada[]>;
}
