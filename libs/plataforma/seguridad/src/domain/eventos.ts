import type { Alcance } from './alcance.js';

/** Eventos de seg en el outbox, todos en schema_version 1. El aggregate_type es el nombre del agregado. */
export const EVENTOS_SEG = {
  rolCreado: 'rol.creado',
  rolPermisosCambiados: 'rol.permisos_cambiados',
  rolInactivado: 'rol.inactivado',
  perfilCreado: 'perfil.creado',
  perfilRolesCambiados: 'perfil.roles_cambiados',
  asignacionOtorgada: 'asignacion.otorgada',
  asignacionRevocada: 'asignacion.revocada',
  membresiaInvitada: 'membresia.invitada',
  membresiaAceptada: 'membresia.aceptada',
  membresiaSuspendida: 'membresia.suspendida',
  membresiaReactivada: 'membresia.reactivada',
  membresiaFinalizada: 'membresia.finalizada',
} as const;

export interface RolCreado {
  producto_codigo: string;
  codigo: string;
  nombre: string;
  copiado_de: string | null;
  permisos: string[];
}

export interface Cambios {
  agregados: string[];
  quitados: string[];
}

export interface RolInactivado {
  afectados: number;
}

export interface PerfilCreado {
  codigo: string;
  nombre: string;
  roles: string[];
}

export interface AsignacionOtorgada {
  membresia_id: string;
  rol_id: string | null;
  perfil_id: string | null;
  alcance: Alcance;
  empresa_id: string | null;
  sucursal_id: string | null;
  unidad_id: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  otorgado_por: string | null;
}

export interface AsignacionRevocada {
  membresia_id: string;
  motivo: string;
  por: string;
}

// Membresías: ningún payload lleva correo ni nombre (TR-RNF-026).

export interface MembresiaInvitada {
  usuario_id: string;
  invitado_por: string;
  reinvitacion: boolean;
  expira_en: string;
}

export interface MembresiaAceptada {
  usuario_id: string;
}

export interface MembresiaCambiada {
  usuario_id: string;
  motivo: string;
  por: string;
}

export interface MembresiaFinalizada extends MembresiaCambiada {
  asignaciones_revocadas: string[];
}

/** Diferencia entre dos conjuntos, ordenada para que el payload sea estable. */
export function diferencia(antes: Iterable<string>, despues: Iterable<string>): Cambios {
  const a = new Set(antes);
  const d = new Set(despues);
  return {
    agregados: [...d].filter((x) => !a.has(x)).sort(),
    quitados: [...a].filter((x) => !d.has(x)).sort(),
  };
}
