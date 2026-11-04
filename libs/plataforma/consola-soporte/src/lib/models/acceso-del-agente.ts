export type EstadoSoporte = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'REVOCADO' | 'EXPIRADO';
export const MODOS_SOPORTE = ['LECTURA', 'ESCRITURA'] as const;
export type ModoSoporte = (typeof MODOS_SOPORTE)[number];
/** 1 a 4 horas (TR-RN-011): el administrador las confirma o cambia al aprobar. */
export const HORAS_SOPORTE = [1, 2, 3, 4] as const;

/** Respuesta tal cual de `GET /v1/seg/soporte/mis-accesos` (spec 18). */
export interface AccesoDelAgenteRespuesta {
  id: string;
  tenant_id: string;
  tenant_nombre: string;
  ticket: string;
  modo: ModoSoporte;
  estado: EstadoSoporte;
  horas_solicitadas: number;
  solicitado_en: string;
  desde: string | null;
  hasta: string | null;
  motivo_cierre: string | null;
  causa_cierre: string | null;
}

export interface AccesoDelAgente {
  id: string;
  tenantId: string;
  tenantNombre: string;
  ticket: string;
  modo: ModoSoporte;
  estado: EstadoSoporte;
  horasSolicitadas: number;
  solicitadoEn: Date;
  hasta: Date | null;
}

export interface SolicitudDeAcceso {
  tenantId: string;
  ticket: string;
  motivo: string;
  modo: ModoSoporte;
  horas: number;
}

export interface TenantElegible {
  id: string;
  codigo: string;
  nombre: string;
}

export function aAccesoDelAgente(respuesta: AccesoDelAgenteRespuesta): AccesoDelAgente {
  return {
    id: respuesta.id,
    tenantId: respuesta.tenant_id,
    tenantNombre: respuesta.tenant_nombre,
    ticket: respuesta.ticket,
    modo: respuesta.modo,
    estado: respuesta.estado,
    horasSolicitadas: respuesta.horas_solicitadas,
    solicitadoEn: new Date(respuesta.solicitado_en),
    hasta: respuesta.hasta ? new Date(respuesta.hasta) : null,
  };
}

/** «Entrar» solo con el acceso aprobado y antes de `hasta`. */
export function esVigente(acceso: AccesoDelAgente, ahora: Date): boolean {
  return acceso.estado === 'APROBADO' && acceso.hasta !== null && ahora < acceso.hasta;
}
