import type { TonoEstado } from '@vitrina/shared/ui';
import type { TipoEvento } from './evento-seguridad';

/** Textos de la bitácora de seguridad (spec 18, TR-RF-019) en español de Perú. */
export const MENSAJES_BITACORA = {
  titulo: 'Bitácora de seguridad',
  tituloDetalle: 'Evento de seguridad',
  volver: 'Volver a la bitácora',
  rango: 'Rango de fechas',
  desde: 'Desde',
  hasta: 'Hasta',
  buscarUsuario: 'Buscar por correo o nombre',
  /** TR-CA-052. */
  sinEventos: 'Sin eventos para los filtros seleccionados',
  verDetalle: 'Ver detalle',
  sistema: 'Sistema',
  sinDato: '—',
  datosDelEvento: 'Datos del evento',
  sinDatos: 'El evento no trae más datos.',
  ip: 'IP',
  usuario: 'Usuario',
  fecha: 'Fecha',
  tipo: 'Tipo',
  rangoIncompleto: 'Elija la fecha inicial y la final.',
} as const;

export const COLUMNAS_BITACORA = {
  fecha: 'Fecha',
  tipo: 'Tipo',
  usuario: 'Usuario',
  resumen: 'Resumen',
} as const;

export const ETIQUETAS_TIPO_EVENTO: Readonly<Record<TipoEvento, string>> = {
  LOGIN: 'Ingreso',
  ACCESO_DENEGADO: 'Acceso denegado',
  ASIGNACION_OTORGADA: 'Asignación otorgada',
  ASIGNACION_REVOCADA: 'Asignación revocada',
  ACCESO_SOPORTE: 'Acceso de soporte',
};

/** Spec 18: denegado en advertencia, soporte en información, el resto neutro. */
export const TONOS_TIPO_EVENTO: Readonly<Record<TipoEvento, TonoEstado>> = {
  LOGIN: 'neutro',
  ACCESO_DENEGADO: 'advertencia',
  ASIGNACION_OTORGADA: 'neutro',
  ASIGNACION_REVOCADA: 'neutro',
  ACCESO_SOPORTE: 'info',
};
