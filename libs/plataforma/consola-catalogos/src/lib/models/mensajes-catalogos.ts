import type { AlcanceCatalogo } from './catalogo';

/** Textos de la consola de catálogos, en español de Perú. */
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
  nuevoCatalogo: 'Nuevo catálogo',
  buscarCatalogo: 'Buscar por código o nombre',
  sinCatalogos: 'No hay catálogos con estos filtros.',
  verDetalle: 'Ver detalle',
  importable: 'Importable',
  noImportable: '—',
  sinFuente: '—',
} as const;

export const COLUMNAS_CATALOGOS = {
  codigo: 'Código',
  nombre: 'Nombre',
  alcance: 'Alcance',
  fuente: 'Fuente',
  version: 'Versión',
  importable: 'Importable',
} as const;

export const ETIQUETAS_ALCANCE: Readonly<Record<AlcanceCatalogo, string>> = {
  GLOBAL: 'Global',
  MIXTO: 'Mixto',
  TENANT: 'Del tenant',
};

export const MENSAJES_FORMULARIO_CATALOGO = {
  tituloNuevo: 'Nuevo catálogo',
  tituloEdicion: 'Editar catálogo',
  codigo: 'Código',
  ayudaCodigo: 'Mayúsculas, dígitos y guion bajo; no cambia después',
  nombre: 'Nombre',
  alcance: 'Alcance',
  ayudaAlcance: 'No cambia después de crear',
  fuente: 'Fuente (opcional)',
  editablePorTenant: 'Editable por el tenant',
  ayudaGlobal: 'Un catálogo global no es editable por el tenant',
  ayudaNoGlobal: 'Un catálogo mixto o del tenant siempre es editable por el tenant',
  crear: 'Crear catálogo',
  guardarCambios: 'Guardar cambios',
  creado: 'Catálogo creado',
  actualizado: 'Catálogo actualizado',
  sinCambios: 'No había cambios',
  versionObsoleta: 'Otro usuario modificó el catálogo. Recargue para ver sus cambios.',
  recargar: 'Recargar',
  noExiste: 'El catálogo no existe',
  volver: 'Volver a catálogos',
  codigoFormato: 'El código debe tener de 3 a 60 mayúsculas, dígitos o guion bajo',
  nombreLongitud: 'El nombre debe tener de 3 a 150 caracteres',
} as const;

export const MENSAJES_DETALLE_CATALOGO = {
  migaCatalogos: 'Catálogos',
  migas: 'Ruta',
  codigo: 'Código',
  fuente: 'Fuente',
  version: 'Versión',
  editablePorTenant: 'Editable por el tenant',
  si: 'Sí',
  no: 'No',
  editar: 'Editar catálogo',
  importar: 'Importar',
  pestanas: 'Contenido del catálogo',
  pestanaItems: 'Ítems',
  pestanaImportaciones: 'Importaciones',
  noExiste: 'El catálogo no existe',
  volver: 'Volver a catálogos',
} as const;

export const MENSAJES_ITEMS = {
  buscar: 'Buscar código o nombre',
  estado: 'Estado',
  nuevoItem: 'Nuevo ítem',
  sinItems: 'No hay ítems con estos filtros.',
  editar: 'Editar',
  borrar: 'Borrar',
  soloTenant: 'Este catálogo solo tiene ítems de cada tenant',
  soloImportacion: 'Esta tabla se actualiza solo por importación, para que coincida con la fuente oficial',
  importarArchivo: 'Importar un archivo',
  sinFin: 'sin fin',
  sinValor: '—',
  si: 'Sí',
  no: 'No',
  itemBorrado: 'Ítem borrado',
  vigenciaCerrada: 'Vigencia cerrada',
  confirmarBorrar: 'Borrar',
  enUso: 'El ítem está en uso y no se puede borrar. ¿Cerrar su vigencia hoy?',
  cerrarVigencia: 'Cerrar vigencia',
  aunNoVigente: 'El ítem aún no entra en vigencia; edítelo para cambiarla',
} as const;

export const COLUMNAS_ITEMS = {
  codigo: 'Código',
  codigoExterno: 'Código externo',
  nombre: 'Nombre',
  orden: 'Orden',
  vigencia: 'Vigencia',
  estado: 'Estado',
  activo: 'Activo',
} as const;

export function mensajeBorrarItem(codigo: string): string {
  return `¿Borrar el ítem ${codigo}?`;
}

/** `01/01/2026 – 31/12/2026` o `01/01/2026 – sin fin`. */
export function mensajeVigencia(desde: string, hasta: string | null): string {
  return `${desde} – ${hasta ?? MENSAJES_ITEMS.sinFin}`;
}

export const MENSAJES_FORMULARIO_ITEM_CONSOLA = {
  tituloNuevo: 'Nuevo ítem',
  tituloEdicion: 'Editar ítem',
  creado: 'Ítem creado',
  actualizado: 'Ítem actualizado',
  noExiste: 'El ítem no existe',
  volver: 'Volver al catálogo',
  versionObsoleta: 'Otro usuario modificó el ítem. Recargue para ver sus cambios.',
  recargar: 'Recargar',
} as const;

export function mensajeCatalogoDelItem(codigoCatalogo: string): string {
  return `Catálogo ${codigoCatalogo}`;
}

export const MENSAJES_IMPORTACION = {
  migaImportar: 'Importar',
  pasoArchivo: 'Archivo',
  pasoPrevisualizacion: 'Previsualización',
  asistente: 'Asistente de importación',
  noImportable: 'Este catálogo no se importa',
  volverAlCatalogo: 'Volver al catálogo',
  elegirArchivo: 'Elegir archivo',
  cambiarArchivo: 'Cambiar archivo',
  sinArchivo: 'Ningún archivo elegido',
  ayudaArchivo: 'CSV (UTF-8) o XLSX, hasta 20 MB',
  archivoRequerido: 'Elija un archivo',
  archivoGrande: 'El archivo supera 20 MB',
  archivoTipo: 'Solo se aceptan archivos CSV o XLSX',
  versionOficial: 'Versión oficial',
  ayudaVersionOficial: 'Como la publica la fuente, de 1 a 40 caracteres',
  fechaVigencia: 'Fecha de vigencia',
  ayudaFechaVigencia: 'Desde cuándo rigen las altas y los cambios (dd/mm/aaaa)',
  previsualizar: 'Previsualizar',
  validando: 'Validando el archivo completo…',
  cancelar: 'Cancelar',
  aplicar: 'Aplicar',
  tituloAplicar: '¿Aplicar la importación?',
  enCola: 'Importación en cola. Puede seguir trabajando',
  vencida: 'La previsualización venció; vuelva a cargar el archivo',
  colaNoDisponible: 'No se pudo encolar; intente de nuevo',
} as const;

export const MENSAJES_RESUMEN = {
  resumen: 'Resumen',
  altas: 'Altas',
  cambios: 'Cambios',
  bajas: 'Bajas',
  sinCambios: 'Sin cambios',
  totalFilas: 'Filas del archivo',
  muestra: 'Muestra por tipo',
  codigo: 'Código',
  nombre: 'Nombre',
  campo: 'Campo',
  antes: 'Antes',
  despues: 'Después',
  vigenteHasta: 'Vigente hasta',
  sinMuestra: 'No hay filas de este tipo.',
  sinValor: '—',
} as const;

export const CAMPOS_COMPARADOS = {
  codigoExterno: 'Código externo',
  nombre: 'Nombre',
  abreviatura: 'Abreviatura',
  orden: 'Orden',
  atributos: 'Atributos',
} as const;

export const MENSAJES_ERRORES_IMPORTACION = {
  titulo: 'Errores del archivo',
  descargar: 'Descargar todos los errores (CSV)',
  fila: 'Fila',
  columna: 'Columna',
  valor: 'Valor',
  mensaje: 'Mensaje',
  ningunCambio: 'Ningún ítem se modificó. Corrija el archivo y vuelva a previsualizarlo.',
} as const;

export const MENSAJES_HISTORIAL = {
  fecha: 'Fecha',
  versionOficial: 'Versión oficial',
  fechaVigencia: 'Vigencia',
  estado: 'Estado',
  altas: 'Altas',
  cambios: 'Cambios',
  bajas: 'Bajas',
  errores: 'Errores',
  motivo: 'Motivo',
  sinImportaciones: 'Este catálogo aún no tiene importaciones.',
  descargarErrores: 'Descargar errores',
  sinMotivo: '—',
} as const;

export const ETIQUETAS_ESTADO_IMPORTACION = {
  PREVISUALIZADA: 'Previsualizada',
  RECHAZADA: 'Rechazada',
  EN_COLA: 'En cola',
  EN_PROCESO: 'En proceso',
  APLICADA: 'Aplicada',
  FALLIDA: 'Fallida',
  OBSOLETA: 'Obsoleta',
  VENCIDA: 'Vencida',
} as const;

export function mensajeTituloImportar(codigo: string): string {
  return `Importar ${codigo}`;
}

/** TR-CA-073: el total real y el tope que trae la respuesta. */
export function mensajeTotalErrores(total: number, mostrados: number): string {
  return total > mostrados ? `Se encontraron ${total} errores; se muestran los primeros ${mostrados}` : `Se encontraron ${total} errores`;
}

export function mensajeVenceEn(fechaHora: string): string {
  return `Puede aplicarla hasta el ${fechaHora}`;
}

export function mensajeCierreVigencias(bajas: number): string {
  return bajas === 1 ? 'Se cerrará la vigencia de 1 ítem' : `Se cerrará la vigencia de ${bajas} ítems`;
}

export function mensajeAplicarConBajas(bajas: number): string {
  return bajas === 1 ? 'Aplicar y cerrar 1 vigencia' : `Aplicar y cerrar ${bajas} vigencias`;
}

/** Texto de la confirmación sin bajas: lo que va a pasar. */
export function mensajeResumenAplicar(altas: number, cambios: number): string {
  return `Se darán de alta ${altas} ${altas === 1 ? 'ítem' : 'ítems'} y se actualizarán ${cambios}.`;
}

export const MENSAJES_SEGUIMIENTO = {
  enCola: 'En cola',
} as const;

export function mensajeTituloImportando(codigo: string): string {
  return `Importando ${codigo}`;
}
