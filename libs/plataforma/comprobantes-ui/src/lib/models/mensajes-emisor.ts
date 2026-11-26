export const MENSAJE_ERROR_DESCONOCIDO_FE = 'No se pudo completar la operación. Intenta de nuevo.';

export const CODIGOS_ERROR_FE = {
  versionObsoleta: 'VERSION_OBSOLETA',
  datosEmisorIncompletos: 'DATOS_EMISOR_INCOMPLETOS',
  archivoCertificadoInvalido: 'ARCHIVO_CERTIFICADO_INVALIDO',
  /** 413 del límite de 50 KB, o el mismo límite en el cliente. */
  archivoDemasiadoGrande: 'ARCHIVO_DEMASIADO_GRANDE',
} as const;

/** Código de la API → texto en español, para los códigos de las cinco rutas del emisor. */
export const MENSAJES_ERROR_FE: Readonly<Record<string, string>> = {
  PROVEEDOR_FE_INVALIDO: 'El proveedor elegido no está disponible.',
  URL_PROVEEDOR_NO_PERMITIDA: 'La URL no pertenece al proveedor elegido.',
  USUARIO_SOL_INVALIDO: 'El usuario SOL va en mayúsculas, sin el RUC.',
  EMPRESA_INACTIVA: 'La empresa está inactiva.',
  EMISOR_EN_PRODUCCION: 'En producción no se cambia el proveedor ni la URL.',
  [CODIGOS_ERROR_FE.datosEmisorIncompletos]: 'Falta el domicilio fiscal o el ubigeo de la empresa.',
  [CODIGOS_ERROR_FE.archivoCertificadoInvalido]: 'El archivo no es un certificado .pfx válido.',
  CLAVE_CERTIFICADO_INCORRECTA: 'La clave del certificado no es correcta.',
  CERTIFICADO_SIN_RUC: 'El certificado no indica un RUC.',
  CERTIFICADO_OTRO_RUC: 'El certificado no corresponde al RUC de la empresa.',
  CERTIFICADO_VENCIDO: 'El certificado está vencido.',
  CERTIFICADO_NO_VIGENTE: 'El certificado aún no está vigente.',
  [CODIGOS_ERROR_FE.archivoDemasiadoGrande]: 'El archivo supera los 50 KB.',
  ESTADO_EMISOR_INVALIDO: 'El emisor no está listo para la prueba.',
  PRUEBA_EN_CURSO: 'Ya hay una prueba en curso.',
  PRODUCCION_NO_PERMITIDA: 'Este ambiente no permite pasar a producción.',
  PROVEEDOR_SIMULADO_EN_PRODUCCION: 'El simulador no puede pasar a producción.',
  PRUEBA_BETA_REQUERIDA: 'Necesitas una prueba aceptada en las últimas 24 horas.',
  [CODIGOS_ERROR_FE.versionObsoleta]: 'Otro usuario cambió el emisor. Se recargaron los datos.',
};

export function mensajeErrorFe(codigo: string): string {
  return MENSAJES_ERROR_FE[codigo] ?? MENSAJE_ERROR_DESCONOCIDO_FE;
}

/** TR-CA-133. */
export const MENSAJE_PRUEBA_ACEPTADA = 'Conexión correcta: comprobante de prueba aceptado';

/** TR-CA-134: con el código y la descripción de SUNAT o del PSE. */
export function mensajePruebaRechazada(codigo: string | null, descripcion: string | null): string {
  const detalle = [codigo, descripcion].filter(Boolean).join(' ');
  return detalle ? `SUNAT rechazó el comprobante de prueba: ${detalle}` : 'SUNAT rechazó el comprobante de prueba';
}

export const MENSAJE_PRUEBA_SIGUE_EN_PROCESO = 'Sigue en proceso. SUNAT puede tardar.';

/** Por qué una sección está deshabilitada (la tabla de comportamiento del spec 62). */
export const MOTIVOS_DESHABILITADA = {
  sinEmisor: 'Guarda primero el proveedor',
  faltaConfigurar: 'Completa el proveedor y el certificado',
  sinPruebaAceptada: 'Necesita una prueba aceptada',
  pruebaVencida: 'La prueba venció: vuelve a probar',
  pruebaEnProduccion: 'En producción no se ejecutan pruebas',
} as const;

export const AYUDA_CREDENCIAL_CONFIGURADA = 'Configurada. Déjalo vacío para conservarla.';
export const AYUDA_CERTIFICADO_OPCIONAL = 'Opcional: este proveedor firma por su cuenta';
