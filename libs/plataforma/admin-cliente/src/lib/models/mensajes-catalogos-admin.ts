import type { AlcanceCatalogo, OrigenItem } from './catalogo-admin';

/** Textos de catálogos en admin (TR-RF-025 y 026), en español de Perú. */
export const MENSAJES_CATALOGOS_ADMIN = {
  titulo: 'Catálogos',
  buscar: 'Buscar por código o nombre',
  alcance: 'Alcance',
  sinCatalogos: 'No hay catálogos con estos filtros.',
  verDetalle: 'Ver detalle',
} as const;

export const COLUMNAS_CATALOGOS_ADMIN = {
  codigo: 'Código',
  nombre: 'Nombre',
  alcance: 'Alcance',
  permite: 'Qué puede hacer',
} as const;

export const ETIQUETAS_ALCANCE_CATALOGO: Readonly<Record<AlcanceCatalogo, string>> = {
  GLOBAL: 'Global',
  MIXTO: 'Mixto',
  TENANT: 'De la empresa',
};

/** Lo que el tenant puede hacer en cada alcance (TR-RN-012). */
export const PERMITE_POR_ALCANCE: Readonly<Record<AlcanceCatalogo, string>> = {
  GLOBAL: 'Solo lectura',
  MIXTO: 'Ítems propios y ajustes',
  TENANT: 'Ítems propios',
};

export const ETIQUETAS_ORIGEN: Readonly<Record<OrigenItem, string>> = {
  GLOBAL: 'Global',
  PROPIO: 'Propio',
};

export const MENSAJES_DETALLE_CATALOGO_ADMIN = {
  migas: 'Ruta de navegación',
  migaCatalogos: 'Catálogos',
  codigo: 'Código',
  noExiste: 'El catálogo no existe',
  volver: 'Volver a catálogos',
  notaNormativo: 'Catálogo normativo: se consulta, no se personaliza',
  notaSoloEmpresa: 'Los cambios solo afectan a su empresa',
  buscar: 'Buscar por código, nombre o atributo',
  estado: 'Estado',
  origen: 'Origen',
  nuevoItemPropio: 'Nuevo ítem propio',
  sinItems: 'No hay ítems con estos filtros.',
  visible: 'Visible',
  global: (nombre: string) => `Global: ${nombre}`,
  personalizar: 'Personalizar',
  restablecer: 'Restablecer',
  editar: 'Editar',
  borrar: 'Borrar',
  oculto: (nombre: string) => `${nombre} oculto para su empresa`,
  visibleOtraVez: (nombre: string) => `${nombre} visible otra vez`,
  confirmarRestablecer: (nombre: string) => `¿Volver a los valores globales de ${nombre}?`,
  restablecido: 'Ítem restablecido',
  ajusteGuardado: 'Ajuste guardado',
  sinCambios: 'No había cambios',
  versionObsoleta: 'Otro usuario modificó el registro; recargue',
  sinValor: '—',
  confirmarBorrar: 'Borrar',
  borrarItem: (codigo: string) => `¿Borrar el ítem ${codigo}?`,
  itemBorrado: 'Ítem borrado',
  enUso: 'El ítem está en uso y no se puede borrar. ¿Cerrar su vigencia hoy?',
  cerrarVigencia: 'Cerrar vigencia',
  vigenciaCerrada: 'Vigencia cerrada',
  aunNoVigente: 'El ítem aún no entra en vigencia; edítelo para cambiarla',
  vigencia: (desde: string, hasta: string | null) => (hasta ? `${desde} – ${hasta}` : `Desde ${desde}`),
} as const;

export const COLUMNAS_ITEMS_ADMIN = {
  codigo: 'Código',
  nombre: 'Nombre',
  origen: 'Origen',
  orden: 'Orden',
  vigencia: 'Vigencia',
  estado: 'Estado',
  visible: 'Visible',
} as const;

export const MENSAJES_PANEL_AJUSTE = {
  titulo: (nombre: string) => `Personalizar ${nombre}`,
  alias: 'Alias (opcional)',
  ayudaAlias: 'Nombre que verá su empresa en lugar del global',
  orden: 'Orden (opcional)',
  ayudaOrden: 'Número entero; vacío usa el orden global',
  visible: 'Visible para su empresa',
  nombreGlobal: 'Nombre global',
} as const;

export const MENSAJES_FORMULARIO_ITEM_PROPIO = {
  tituloNuevo: 'Nuevo ítem propio',
  tituloEdicion: 'Editar ítem propio',
  catalogo: (codigo: string) => `Catálogo ${codigo}`,
  creado: 'Ítem creado',
  actualizado: 'Ítem actualizado',
  codigoDuplicado: 'El código ya existe en el catálogo',
  noExiste: 'El ítem no existe',
  volver: 'Volver al catálogo',
  versionObsoleta: 'Otro usuario modificó el ítem. Recargue para ver sus cambios.',
  recargar: 'Recargar',
} as const;
