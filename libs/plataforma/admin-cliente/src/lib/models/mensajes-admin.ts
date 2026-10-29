import { MENSAJES_SHELL } from '@vitrina/shared/shell';
import type { Alcance } from './asignacion';
import type { EstadoAsignacion, EstadoMembresia } from './miembro';

/** Textos de la administración del cliente, en español de Perú. */
export const MENSAJES_ADMIN = {
  tituloUsuarios: 'Usuarios',
  invitarUsuario: 'Invitar usuario',
  buscarMiembro: 'Buscar por nombre o correo',
  sinMiembros: 'No hay usuarios con estos filtros.',
  verDetalle: 'Ver detalle',
  si: 'Sí',
  no: 'No',
  sinFecha: '—',
  tituloInvitar: 'Invitar usuario',
  nombre: 'Nombre',
  correo: 'Correo',
  invitar: 'Invitar',
  invitacionEnviada: 'Invitación enviada',
  tituloCorreoNoEnviado: 'Correo no enviado',
  correoNoEnviado: 'Invitación creada; el correo no se envió. Reenvíe invitando otra vez',
  tituloAsignar: 'Asignar rol o perfil',
  asignar: 'Asignar',
  asignacionOtorgada: 'Asignación otorgada',
} as const;

export const MENSAJES_DETALLE = {
  propietario: 'Propietario',
  invitacionVence: 'La invitación vence el',
  asignaciones: 'Asignaciones',
  sinAsignaciones: 'Este usuario no tiene asignaciones.',
  rolOPerfil: 'Rol o perfil',
  alcance: 'Alcance',
  vigencia: 'Vigencia',
  estado: 'Estado',
  acciones: 'Acciones',
  sinFin: 'sin fin',
  perfil: 'Perfil',
  asignar: 'Asignar',
  suspender: 'Suspender',
  reactivar: 'Reactivar',
  finalizar: 'Finalizar',
  revocar: 'Revocar',
  reenviarInvitacion: 'Reenviar invitación',
  volver: 'Volver a usuarios',
} as const;

/** Confirmación y resultado de cada acción de TR-RF-014. Los textos no prometen cierre inmediato (TR-RNF-014). */
export const CONFIRMACIONES = {
  suspender: {
    titulo: (nombre: string) => `¿Suspender a ${nombre}?`,
    texto: 'No podrá operar en el tenant hasta que lo reactive. Sus asignaciones se conservan.',
    hecho: 'Membresía suspendida',
  },
  reactivar: {
    titulo: (nombre: string) => `¿Reactivar a ${nombre}?`,
    texto: 'Recupera los permisos de sus asignaciones vigentes.',
    hecho: 'Membresía reactivada',
  },
  finalizar: {
    titulo: (nombre: string) => `¿Finalizar la membresía de ${nombre}?`,
    texto: 'Se revocan todas sus asignaciones. Pierde el acceso al tenant cuando se renueve su sesión (hasta 15 minutos).',
    hecho: 'Membresía finalizada',
  },
  revocar: {
    titulo: (asignacion: string) => `¿Revocar «${asignacion}»?`,
    texto: 'Las demás asignaciones del usuario no cambian.',
    hecho: 'Asignación revocada',
  },
} as const;

export const ETIQUETAS_ESTADO_ASIGNACION: Readonly<Record<EstadoAsignacion, string>> = {
  VIGENTE: 'Vigente',
  FUTURA: 'Futura',
  VENCIDA: 'Vencida',
  REVOCADA: 'Revocada',
};

export const COLUMNAS_MIEMBROS = {
  nombre: 'Nombre',
  correo: 'Correo',
  estado: 'Estado',
  propietario: 'Propietario',
  asignacionesVigentes: 'Asignaciones vigentes',
  invitacionVence: 'Invitación vence',
} as const;

export const MENSAJES_ASIGNACION = {
  rolOPerfil: 'Rol o perfil',
  roles: 'Roles',
  perfiles: 'Perfiles',
  alcance: 'Alcance',
  empresa: 'Empresa',
  sucursal: 'Sucursal',
  unidad: 'Unidad',
  vigenteDesde: 'Vigente desde',
  vigenteHasta: 'Vigente hasta (opcional)',
  /** TR-CA-038, texto del SRS. */
  vigenciaInvalida: 'La vigencia hasta no puede ser anterior a la vigencia desde',
  ubicacionRequerida: 'Elija dónde aplica la asignación.',
  sensible: 'requiere verificación',
} as const;

/** Roles y árbol de permisos (spec 16b). */
export const MENSAJES_ROLES = {
  tituloRoles: 'Roles',
  nuevoRol: 'Nuevo rol',
  buscarRol: 'Buscar por nombre o código',
  sinRoles: 'No hay roles con estos filtros.',
  producto: 'Producto',
  tipo: 'Tipo',
  estado: 'Estado',
  permisos: 'Permisos',
  codigo: 'Código',
  nombre: 'Nombre',
  permisosSeleccionados: (cantidad: number) => (cantidad === 1 ? '1 permiso seleccionado' : `${cantidad} permisos seleccionados`),
  otrosPermisos: 'Otros permisos',
  sensible: 'Requiere verificación',
  todaLaOpcion: (opcion: string) => `Todos los permisos de ${opcion}`,
  todoElModulo: (modulo: string) => `Todos los permisos de ${modulo}`,
  sinPermisosEnCatalogo: 'Este producto no tiene permisos en su catálogo.',
} as const;

export const ETIQUETAS_TIPO_ROL = { predefinido: 'Predefinido', propio: 'Propio' } as const;
export const ETIQUETAS_ESTADO_ROL = { activo: 'Activo', inactivo: 'Inactivo' } as const;

export const ETIQUETAS_ALCANCE: Readonly<Record<Alcance, string>> = {
  TENANT: 'Todo el tenant',
  EMPRESA: 'Una empresa',
  SUCURSAL: 'Una sucursal',
  UNIDAD: 'Una unidad operativa',
};

export const ETIQUETAS_ESTADO_MEMBRESIA: Readonly<Record<EstadoMembresia, string>> = {
  INVITADO: 'Invitado',
  ACTIVO: 'Activo',
  SUSPENDIDO: 'Suspendido',
  FINALIZADO: 'Finalizado',
};

/**
 * Texto para los códigos que la API responde sin `mensaje`. Los demás traen el suyo, con los textos
 * del SRS, y se muestran tal cual como texto plano.
 */
export const MENSAJES_POR_CODIGO: Readonly<Record<string, string>> = {
  SOLICITUD_INVALIDA: 'Revise los datos del formulario.',
  MFA_REQUERIDA: MENSAJES_SHELL.mfaRequerida,
  SIN_PERMISO: 'No tiene permiso para esta acción.',
  SUCURSAL_NO_ASIGNADA: 'No tiene acceso a la sucursal seleccionada.',
};

export const MENSAJE_ERROR_DESCONOCIDO = 'Ocurrió un error. Inténtelo de nuevo.';
