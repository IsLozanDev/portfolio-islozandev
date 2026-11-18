export interface DetectorTipo {
  /** MIME real según el contenido, no según el nombre ni lo declarado. `null` si no se reconoce. */
  detectar(contenido: Uint8Array): Promise<string | null>;
}
