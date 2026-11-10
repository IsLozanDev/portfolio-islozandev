import type { TipoEventoAuditoria } from '../../domain/filtro-auditoria.js';

/** Textos de la hoja de la exportación (spec 20b). */
export const ETIQUETAS_AUDITORIA = {
  hoja: 'Auditoría',
  tipos: {
    OPERACION: 'Operación',
    ACCESO_SENSIBLE: 'Acceso sensible',
  } satisfies Record<TipoEventoAuditoria, string>,
  columnas: {
    fecha: 'Fecha',
    tipo: 'Tipo',
    accion: 'Acción',
    entidad: 'Entidad',
    id: 'Id',
    usuario: 'Usuario',
    correo: 'Correo',
    sucursal: 'Sucursal',
    motivo: 'Motivo',
    finalidad: 'Finalidad',
    ticket: 'Ticket',
    campos: 'Campos cambiados',
    ip: 'IP',
    numero: 'N.º',
  },
} as const;
