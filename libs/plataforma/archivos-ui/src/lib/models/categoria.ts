export interface CategoriaRespuesta {
  codigo: string;
  mimes_permitidos: string[];
  tamano_max_bytes: number;
}

/** Lo que el front valida antes de subir; la API vuelve a validar al pedir la carga. */
export interface Categoria {
  codigo: string;
  mimesPermitidos: readonly string[];
  tamanoMaxBytes: number;
}

export function aCategoria(respuesta: CategoriaRespuesta): Categoria {
  return { codigo: respuesta.codigo, mimesPermitidos: [...respuesta.mimes_permitidos], tamanoMaxBytes: respuesta.tamano_max_bytes };
}
