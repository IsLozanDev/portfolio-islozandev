import type { TonoEstado } from '@vitrina/shared/ui';
import type { TipoAsignado, TipoEvento } from './evento-seguridad';

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
  destinatario: 'Destinatario',
  fecha: 'Fecha',
  tipo: 'Tipo',
  rangoIncompleto: 'Elija la fecha inicial y la final.',
  // Spec 18b: exportación y detalle de los ingresos.
  exportar: 'Exportar',
  exportando: 'Exportando…',
  tituloErrorExportar: 'No se pudo exportar la bitácora',
  datosDelIngreso: 'Ingreso',
  datosDeLaExportacion: 'Exportación',
  metodo: 'Método',
  aal: 'Nivel de autenticación',
  etapa: 'Etapa',
  motivo: 'Motivo',
  alcanceBloqueo: 'Alcance del bloqueo',
  bloqueadoHasta: 'Bloqueado hasta',
  correoIntentado: 'Correo intentado',
  navegador: 'Navegador',
  rangoExportado: 'Rango exportado',
  filtrosExportados: 'Filtros',
  sinFiltros: 'Sin filtros',
  filasExportadas: 'Filas',
} as const;

/** Método de ingreso (`amr` del token) en el resumen y el detalle de LOGIN (spec 18b). */
export const ETIQUETAS_METODO_INGRESO: Readonly<Record<string, string>> = {
  password: 'Contraseña',
  oauth: 'Proveedor externo',
  otp: 'Enlace por correo',
  totp: 'Código de verificación',
};

/** Motivo de LOGIN_FALLIDO: siempre visible en la lista y el detalle (spec 18b). */
export const ETIQUETAS_MOTIVO_FALLO: Readonly<Record<string, string>> = {
  CREDENCIALES: 'Contraseña incorrecta o correo inexistente',
  CORREO_NO_CONFIRMADO: 'Correo sin confirmar',
  USUARIO_SUSPENDIDO: 'Usuario suspendido',
  CODIGO_MFA: 'Código de verificación incorrecto',
  BLOQUEO_INGRESO: 'Bloqueo por intentos fallidos (correo e IP, o IP)',
  BLOQUEO_MFA: 'Bloqueo del código de verificación',
};

export const MOTIVOS_DE_BLOQUEO: readonly string[] = ['BLOQUEO_INGRESO', 'BLOQUEO_MFA'];

export const ETIQUETAS_ETAPA_INGRESO: Readonly<Record<string, string>> = {
  CLAVE: 'Contraseña',
  MFA: 'Código de verificación',
};

export const ETIQUETAS_ALCANCE_BLOQUEO: Readonly<Record<string, string>> = {
  CORREO_IP: 'Correo e IP',
  IP: 'IP',
};

export const ETIQUETAS_NIVEL_AUTENTICACION: Readonly<Record<string, string>> = {
  aal1: 'Contraseña o enlace (aal1)',
  aal2: 'Con segundo factor (aal2)',
};

export const ETIQUETAS_TIPO_ASIGNADO: Readonly<Record<TipoAsignado, string>> = {
  ROL: 'Rol',
  PERFIL: 'Perfil',
};

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
  LOGIN_FALLIDO: 'Ingreso fallido',
  EXPORTACION: 'Exportación',
};

/** Specs 18 y 18b: denegado e ingreso fallido en advertencia, soporte y exportación en información, el resto neutro. */
export const TONOS_TIPO_EVENTO: Readonly<Record<TipoEvento, TonoEstado>> = {
  LOGIN: 'neutro',
  ACCESO_DENEGADO: 'advertencia',
  ASIGNACION_OTORGADA: 'neutro',
  ASIGNACION_REVOCADA: 'neutro',
  ACCESO_SOPORTE: 'info',
  LOGIN_FALLIDO: 'advertencia',
  EXPORTACION: 'info',
};
