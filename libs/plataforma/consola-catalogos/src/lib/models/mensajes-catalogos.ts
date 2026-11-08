/** Textos de la consola de catálogos, en español de Perú. Las páginas suman los suyos. */
export const MENSAJE_ERROR_DESCONOCIDO = 'No se pudo completar la operación. Inténtelo de nuevo.';

/** Mensaje propio de un código cuando la API no manda `mensaje` o el suyo no sirve para la pantalla. */
export const MENSAJES_POR_CODIGO: Readonly<Record<string, string>> = {
  SOLICITUD_INVALIDA: 'Revise los datos ingresados.',
  CODIGO_DUPLICADO: 'El código ya existe en el catálogo',
  IMPORTACION_NO_APLICABLE: 'La previsualización venció; vuelva a cargar el archivo',
  COLA_NO_DISPONIBLE: 'No se pudo encolar; intente de nuevo',
};

export const MENSAJES_CATALOGOS = {
  tituloCatalogos: 'Catálogos',
} as const;
