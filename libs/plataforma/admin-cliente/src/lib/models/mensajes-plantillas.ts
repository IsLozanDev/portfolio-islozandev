import type { CanalPlantilla, OrigenPlantilla } from './plantilla';

/** Textos de plantillas de notificación en admin (TR-RF-074, spec 47), en español de Perú. */
export const MENSAJES_PLANTILLAS = {
  titulo: 'Plantillas de notificación',
  subtitulo: 'Correos que la plataforma envía a su empresa. Puede cambiar el texto; la versión original de la plataforma siempre se conserva.',
  buscar: 'Buscar nombre, código o asunto',
  sinPlantillas: 'No hay plantillas con este texto.',
  ver: 'Ver',
  editar: 'Editar',
  sinVersion: '—',
  codigoYFecha: (codigo: string, fecha: string) => `${codigo} · ${fecha}`,
} as const;

export const COLUMNAS_PLANTILLAS = {
  plantilla: 'Plantilla',
  asunto: 'Asunto',
  canal: 'Canal',
  origen: 'Origen',
  version: 'Versión',
  actualizada: 'Actualizada',
} as const;

export const ETIQUETAS_ORIGEN_PLANTILLA: Readonly<Record<OrigenPlantilla, string>> = {
  BASE: 'Base',
  PERSONALIZADA: 'Personalizada',
};

export const ETIQUETAS_CANAL_PLANTILLA: Readonly<Record<CanalPlantilla, string>> = {
  CORREO: 'Correo',
};

export const ICONOS_CANAL_PLANTILLA: Readonly<Record<CanalPlantilla, string>> = {
  CORREO: 'mail',
};

export const MENSAJES_VISTA_RAPIDA = {
  cerrar: 'Cerrar',
  editar: 'Editar',
  actualizada: (fecha: string) => `Actualizada el ${fecha}`,
  conVersion: (origen: string, version: number) => `${origen} · v${version}`,
  notaEjemplo: 'Con los datos de ejemplo de cada variable. No se envía nada.',
} as const;

export const MENSAJES_VISTA_PREVIA = {
  asunto: 'Asunto',
  tituloMarco: 'Vista previa del correo',
  generando: 'Generando vista previa…',
  noSePudo: 'No se pudo generar la vista previa.',
} as const;

/** «Personalizada · v3» o «Base». */
export function etiquetaOrigenConVersion(origen: OrigenPlantilla, version: number | null): string {
  const etiqueta = ETIQUETAS_ORIGEN_PLANTILLA[origen];
  return version === null ? etiqueta : MENSAJES_VISTA_RAPIDA.conVersion(etiqueta, version);
}

export const MENSAJES_EDITOR_PLANTILLA = {
  volver: 'Plantillas',
  noExiste: 'La plantilla no existe',
  noExisteTexto: 'Puede que ya no se pueda personalizar o que el enlace esté mal.',
  textoBase: 'Texto original de la plataforma',
  guardada: (fecha: string) => `Guardada el ${fecha}`,
  soloLectura: 'Solo lectura: puede ver la plantilla, pero no tiene permiso para personalizarla.',
  rigeBase: 'Rige el texto original de la plataforma. Al guardar se crea la versión 1 de su empresa; la base siempre se puede restaurar.',
  contenidoQuitado: (version: number) => `Guardada como versión ${version}.`,
  contenidoQuitadoTexto: 'Se quitó contenido no permitido al guardar. El editor muestra el texto tal como quedó.',
  contenido: 'Contenido',
  cambiosSinGuardar: 'Cambios sin guardar',
  asunto: 'Asunto',
  ayudaAsunto: 'Una sola línea.',
  contador: (largo: number, maximo: number) => `${largo}/${maximo}`,
  insertarVariable: (campo: string) => `Insertar variable en el cursor (${campo})`,
  ejemploVariable: (ejemplo: string) => `Ejemplo: ${ejemplo}`,
  etiquetaVariable: (nombre: string, tipo: string, ejemplo: string) => `Insertar ${nombre}, ${tipo}, ejemplo ${ejemplo}`,
  sinEjemplo: 'sin ejemplo',
  cuerpo: 'Cuerpo (HTML)',
  ayudaCuerpo: 'Etiquetas permitidas: p, br, strong, em, a, listas y tablas. El resto se quita al guardar.',
  descartar: 'Descartar',
  guardar: 'Guardar',
  guardadaComo: (version: number) => `Plantilla guardada como versión ${version}.`,
  vistaPrevia: 'Vista previa',
  queVersionVer: 'Qué versión ver',
  personalizada: 'Personalizada',
  base: 'Base',
  estadoActualizada: 'Actualizada al dejar de escribir',
  estadoCorregir: 'Corrija el contenido para actualizar la vista previa',
  estadoBase: 'Texto original de la plataforma',
  estadoGenerando: 'Generando vista previa…',
  notaEjemplo: 'Con los datos de ejemplo de cada variable. No se envía nada.',
  conflictoTitulo: 'Otra persona guardó una versión nueva',
  conflictoTexto: 'Su texto sigue en el editor. Si recarga, se copia antes al portapapeles para que no lo pierda.',
  conflictoRecargar: 'Copiar y recargar',
  conflictoSeguir: 'Seguir editando',
  copiado: 'Su cuerpo se copió al portapapeles.',
  noSeCopio: 'No se pudo copiar al portapapeles',
  noSeCopioTexto: 'Su texto sigue en el editor: cópielo a mano antes de recargar.',
  restaurar: 'Restaurar la base',
  restaurarTitulo: '¿Restaurar la base?',
  restaurarTexto: (version: number) =>
    `Los próximos correos de su empresa usarán el texto original de la plataforma. La versión ${version} deja de regir, pero queda en el historial.`,
  restaurada: 'Se restauró el texto original de la plataforma.',
} as const;

export const MENSAJES_HISTORIAL_PLANTILLA = {
  titulo: 'Historial de versiones',
  sinVersiones: 'Sin versiones propias · rige la base',
  conVigente: (cantidad: number, vigente: number) => `${cantidad} ${cantidad === 1 ? 'versión' : 'versiones'} · vigente v${vigente}`,
  sinVigente: (cantidad: number) => `${cantidad} ${cantidad === 1 ? 'versión' : 'versiones'} · rige la base`,
  noSePudo: 'No se pudo cargar el historial.',
  version: 'Versión',
  estado: 'Estado',
  guardadaPor: 'Guardada por',
  fecha: 'Fecha',
  numero: (version: number) => `v${version}`,
  vigente: 'Vigente',
  inactiva: 'Inactiva',
  usted: 'Usted',
  otroUsuario: 'Otro usuario',
  base: 'Base',
  baseSiempre: 'Siempre disponible',
  plataforma: 'Plataforma',
  sinFecha: '—',
} as const;

export const ERRORES_CAMPO_PLANTILLA = {
  asuntoObligatorio: 'El asunto es obligatorio',
  asuntoLargo: (maximo: number) => `El asunto pasa de ${maximo} caracteres`,
  asuntoUnaLinea: 'El asunto debe ir en una sola línea',
  cuerpoObligatorio: 'El cuerpo es obligatorio',
  variableNoPermitida: (nombres: readonly string[]) => `Variable no permitida: ${nombres.join(', ')}`,
} as const;
