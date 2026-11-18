import type { Archivo } from '../../domain/archivo.js';
import type { CategoriaArchivo } from '../../domain/categoria.js';

/** Archivos del tenant del contexto. Un archivo de otro tenant no existe para quien consulta (TR-CA-205). */
export interface RepositorioArchivos {
  obtener(archivoId: string): Promise<Archivo | null>;
  /** Lanza `ConflictError` si otra operación cambió el archivo desde que se leyó. */
  guardar(archivo: Archivo): Promise<void>;
  /** Borra el archivo con sus versiones. No falla si ya no existe. */
  eliminar(archivoId: string): Promise<void>;
  buscarCategoria(codigo: string): Promise<CategoriaArchivo | null>;
}
