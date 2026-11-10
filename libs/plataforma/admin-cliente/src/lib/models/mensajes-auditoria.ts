import type { TonoEstado } from '@vitrina/shared/ui';
import type { Finalidad, TipoEventoAuditoria } from './evento-auditoria';
import type { MotivoRotura } from './verificacion-integridad';

/** Textos del visor de auditoría (spec 20c, TR-RF-086) en español de Perú. */
export const MENSAJES_AUDITORIA = {
  titulo: 'Auditoría',
  tituloDetalle: 'Evento de auditoría',
  volver: 'Volver',
  rango: 'Rango de fechas',
  desde: 'Desde',
  hasta: 'Hasta',
  buscarUsuario: 'Buscar por correo o nombre',
  accion: 'Acción',
  /** La densidad −4 oculta el `mat-label`: el campo se explica con el placeholder, como `vit-filtros`. */
  placeholderAccion: 'Acción (p. ej. rest.venta.anular)',
  sucursal: 'Sucursal',
  todasLasSucursales: 'Todas',
  tipo: 'Tipo',
  sinEventos: 'No hay eventos de auditoría con estos filtros',
  verDetalle: 'Ver detalle',
  sistema: 'Sistema',
  todoElTenant: 'Todo el tenant',
  sinDato: '—',
  filtroEntidad: 'Entidad',
  filtroTitular: 'Titular',
  quitarFiltroEntidad: 'Quitar filtro de entidad',
  quitarFiltroTitular: 'Quitar filtro de titular',
  exportar: 'Exportar',
  exportando: 'Exportando…',
  tituloErrorExportar: 'No se pudo exportar la auditoría',
  // Detalle.
  usuario: 'Usuario',
  entidad: 'Entidad',
  motivo: 'Motivo',
  finalidad: 'Finalidad',
  ticket: 'Ticket',
  titular: 'Titular',
  ip: 'IP',
  cambios: 'Cambios',
  campo: 'Campo',
  antes: 'Antes',
  despues: 'Después',
  sinCambios: 'Este evento no registra cambios',
  cambiosRecortados: 'Se muestran los primeros 200 cambios',
  jsonCompleto: 'JSON completo',
  datosTecnicos: 'Datos técnicos',
  numeroEnCadena: 'N.º en la cadena',
  hashAnterior: 'Hash anterior',
  hash: 'Hash',
  traceId: 'trace_id',
  eventId: 'event_id',
  eventoNoEncontrado: 'El evento no existe o está fuera de tu alcance',
  // Franja de integridad.
  cadenaVerificada: 'Cadena verificada el',
  eventos: 'eventos',
  cadenaRota: 'Cadena rota en el evento N.º',
  verificadaEl: 'Verificada el',
  sinVerificar: 'La cadena aún no se ha verificado',
} as const;

export const COLUMNAS_AUDITORIA = {
  fecha: 'Fecha',
  tipo: 'Tipo',
  accion: 'Acción',
  entidad: 'Entidad',
  usuario: 'Usuario',
  sucursal: 'Sucursal',
} as const;

/** Las mismas etiquetas que la hoja XLSX del spec 20b. */
export const ETIQUETAS_TIPO_AUDITORIA: Readonly<Record<TipoEventoAuditoria, string>> = {
  OPERACION: 'Operación',
  ACCESO_SENSIBLE: 'Acceso sensible',
};

export const TONOS_TIPO_AUDITORIA: Readonly<Record<TipoEventoAuditoria, TonoEstado>> = {
  OPERACION: 'neutro',
  ACCESO_SENSIBLE: 'advertencia',
};

export const ETIQUETAS_FINALIDAD: Readonly<Record<Finalidad, string>> = {
  ATENCION: 'Atención',
  AUDITORIA_MEDICA: 'Auditoría médica',
  SOPORTE: 'Soporte',
  OTRO: 'Otro',
};

export const ETIQUETAS_MOTIVO_ROTURA: Readonly<Record<MotivoRotura, string>> = {
  HASH: 'el contenido no coincide con su hash',
  ENLACE: 'no enlaza con el evento anterior',
  HUECO: 'falta un evento en la cadena',
  TRUNCADA: 'faltan eventos ya verificados',
};
