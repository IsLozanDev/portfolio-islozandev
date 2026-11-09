import type { AlcanceFeriado } from './feriado';

/** Textos de la gestión de feriados (TR-RF-029), en español de Perú. */
export const MENSAJE_ERROR_DESCONOCIDO = 'No se pudo completar la operación. Inténtelo de nuevo.';

/** Mensaje propio de un código cuando la API no manda `mensaje`. */
export const MENSAJES_POR_CODIGO: Readonly<Record<string, string>> = {
  SOLICITUD_INVALIDA: 'Revise los datos ingresados.',
  FERIADO_DUPLICADO: 'La fecha ya está registrada como feriado',
  SUCURSAL_NO_ENCONTRADA: 'La sucursal no existe',
  VERSION_OBSOLETA: 'Otro usuario modificó el registro; recargue',
};

export const MENSAJES_FERIADOS = {
  titulo: 'Feriados',
  nuevoFeriado: 'Nuevo feriado',
  sucursal: 'Sucursal',
  alcance: 'Alcance',
  todas: 'Todas',
  sinFeriados: (anio: number) => `No hay feriados registrados para ${anio}`,
  editar: 'Editar',
  borrar: 'Borrar',
  confirmarBorrar: 'Borrar',
  borrarFeriado: (nombre: string, fecha: string) => `¿Borrar el feriado ${nombre} del ${fecha}?`,
  borrarRecurrente: 'Dejará de aplicar en todos los años.',
  borrado: 'Feriado borrado',
  creado: 'Feriado creado',
  actualizado: 'Feriado actualizado',
  sinCambios: 'No había cambios',
  si: 'Sí',
  no: 'No',
  sinSucursal: '—',
} as const;

export const COLUMNAS_FERIADOS = {
  fecha: 'Fecha',
  dia: 'Día',
  nombre: 'Nombre',
  alcance: 'Alcance',
  sucursal: 'Sucursal',
  recurrente: 'Se repite cada año',
} as const;

export const ETIQUETAS_ALCANCE_FERIADO: Readonly<Record<AlcanceFeriado, string>> = {
  GLOBAL: 'Global',
  TENANT: 'Empresa',
  SUCURSAL: 'Sucursal',
};

export const MENSAJES_SELECTOR_ANIO = {
  anterior: 'Año anterior',
  siguiente: 'Año siguiente',
  anio: 'Año',
} as const;

export const MENSAJES_FORMULARIO_FERIADO = {
  tituloNuevo: 'Nuevo feriado',
  tituloEdicion: 'Editar feriado',
  alcance: 'Alcance',
  todaLaEmpresa: 'Toda la empresa',
  unaSucursal: 'Una sucursal',
  notaGlobal: 'Feriado nacional (GLOBAL): aplica a todos los tenants',
  sucursal: 'Sucursal',
  fecha: 'Fecha',
  formatoFecha: 'dd/mm/aaaa',
  nombre: 'Nombre',
  recurrente: 'Se repite cada año desde esta fecha',
  fechaInvalida: 'Ingrese una fecha válida (dd/mm/aaaa).',
} as const;
