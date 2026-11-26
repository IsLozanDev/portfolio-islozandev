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

/** Textos de la lista de emisores (artboard FE-Emisores). */
export const MENSAJES_EMISORES = {
  titulo: 'Emisor electrónico',
  subtitulo: 'Cada empresa emite con su propio RUC, certificado y usuario SOL.',
  empresa: 'Empresa',
  ruc: 'RUC',
  proveedor: 'Proveedor',
  ambiente: 'Ambiente',
  estado: 'Estado',
  certificadoVence: 'Certificado vence',
  configurar: 'Configurar',
  verEmisor: 'Ver emisor',
  sinEmpresas: 'No hay empresas activas.',
  sinDato: '—',
} as const;

/** Textos de la página del emisor (artboard FE-Emisor). */
export const MENSAJES_EMISOR = {
  volver: 'Emisor electrónico',
  subtitulo: 'Emite con su propio certificado y usuario SOL.',
  empresaNoEncontrada: 'La empresa no existe o está inactiva.',
  recargar: 'Recargar',
  completarEmpresa: 'Completar los datos de la empresa',
  secciones: {
    proveedor: 'Proveedor y credencial',
    certificado: 'Certificado digital',
    prueba: 'Prueba en beta',
    produccion: 'Producción',
  },
  proveedor: {
    proveedor: 'Proveedor',
    usuario: 'Usuario del proveedor',
    usuarioSol: 'Usuario secundario SOL',
    ayudaUsuarioSol: 'En mayúsculas y sin el RUC. Se crea en SUNAT Operaciones en Línea.',
    clave: 'Clave del proveedor',
    claveSol: 'Clave SOL',
    url: 'URL del proveedor',
    regimenIgv: 'Régimen de IGV',
    leyendaPie: 'Leyenda del pie (opcional)',
    avisoRepetirPrueba: 'Si cambias el proveedor, la URL, la clave o el certificado tendrás que volver a ejecutar la prueba.',
    bloqueadoEnProduccion: 'En producción no se cambia el proveedor ni la URL.',
    sinProveedores: 'No se pudo leer la lista de proveedores.',
    guardar: 'Guardar',
    descartar: 'Descartar',
    guardado: 'Proveedor guardado.',
  },
  certificado: {
    rucCertificado: 'RUC del certificado',
    vence: 'Vence',
    huella: 'Huella SHA-256',
    sinCertificado: 'Sin certificado',
    restricciones: '.pfx o .p12, hasta 50 KB. Se guarda cifrado y no se vuelve a mostrar.',
    elegirArchivo: 'Elegir archivo',
    clave: 'Clave del certificado',
    subir: 'Subir certificado',
    reemplazar: 'Reemplazar certificado',
    sinInterrupcion: 'Al reemplazarlo no se interrumpe la emisión.',
    subido: 'Certificado cargado.',
  },
  prueba: {
    explicacion: 'Envía una boleta de prueba a la beta de SUNAT. No tiene validez tributaria.',
    sinPruebas: 'Sin pruebas',
    aunNoHay: 'Aún no hay pruebas para este emisor.',
    enProceso: (numero: number) => `Prueba n.º ${numero} en proceso. Se actualiza sola; puedes seguir en la página.`,
    errorEnvio: 'No se pudo enviar la prueba. Vuelve a intentarlo.',
    ejecutar: 'Ejecutar prueba',
    volverAProbar: 'Volver a probar',
    probando: 'Probando…',
    actualizar: 'Actualizar',
    numero: (numero: number) => `Prueba n.º ${numero}`,
  },
  produccion: {
    explicacion: 'Desde ese momento los comprobantes se envían a SUNAT con validez tributaria. No se puede volver a beta.',
    vigenteHasta: (fechaHora: string) => `La prueba aceptada vale hasta el ${fechaHora}.`,
    pasar: 'Pasar a producción',
    enProduccionDesde: (fecha: string) => `En producción desde ${fecha}`,
    confirmarTitulo: '¿Pasar a producción?',
    confirmarTexto: (razonSocial: string, ruc: string) =>
      `${razonSocial} (RUC ${ruc}) empezará a emitir con validez tributaria. Las boletas y facturas se envían a SUNAT en producción. No se puede volver a beta.`,
    hecho: 'El emisor está en producción.',
  },
} as const;
