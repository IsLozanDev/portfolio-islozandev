export interface CargaFirmada {
  url: string;
  token: string;
  expiraEn: Date;
}

/** Bucket privado donde viven los bytes. Si no responde lanza `AlmacenNoDisponibleError`. */
export interface AlmacenArchivos {
  /** URL de un solo objeto para que el cliente suba directo. No reemplaza un objeto que ya existe. */
  firmarCarga(ruta: string): Promise<CargaFirmada>;
  /** Con `descargarComo` el navegador descarga con ese nombre; sin él, lo abre. */
  firmarDescarga(ruta: string, vigenciaSegundos: number, descargarComo?: string): Promise<string>;
  /** Sube los bytes desde el servidor (spec 52). No reemplaza un objeto que ya existe. */
  subir(ruta: string, contenido: Uint8Array, mime: string): Promise<void>;
  /** `null` si el objeto no existe. */
  leer(ruta: string): Promise<Uint8Array | null>;
  /** No falla si el objeto no existe. */
  borrar(ruta: string): Promise<void>;
}
