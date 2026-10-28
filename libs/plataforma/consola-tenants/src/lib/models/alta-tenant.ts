import type { EstadoTenant, Modalidad, Plan, ProductoCodigo } from './catalogos';

export interface SolicitudAltaTenant {
  codigo: string;
  nombre: string;
  productoCodigo: ProductoCodigo;
  plan: Plan;
  modalidad: Modalidad;
  /** `YYYY-MM-DD`; obligatorio solo en modalidad `ACTIVO`. */
  vigenteHasta?: string;
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  correoPropietario: string;
  nombrePropietario: string;
}

/** Cuerpo de `POST /v1/org/tenants` (spec 12). */
export interface SolicitudAltaTenantCuerpo {
  codigo: string;
  nombre: string;
  producto_codigo: ProductoCodigo;
  plan: Plan;
  modalidad: Modalidad;
  vigente_hasta?: string;
  ruc: string;
  razon_social: string;
  nombre_comercial?: string;
  correo_propietario: string;
  nombre_propietario: string;
}

/** Parte de la respuesta 201 que usa la consola. */
export interface RespuestaAltaTenantCuerpo {
  tenant_id: string;
  estado: EstadoTenant;
  usuario_nuevo: boolean;
  correo_enviado: boolean;
}

export interface RespuestaAltaTenant {
  tenantId: string;
  estado: EstadoTenant;
  usuarioNuevo: boolean;
  correoEnviado: boolean;
}

export function aCuerpoAlta(solicitud: SolicitudAltaTenant): SolicitudAltaTenantCuerpo {
  return {
    codigo: solicitud.codigo,
    nombre: solicitud.nombre,
    producto_codigo: solicitud.productoCodigo,
    plan: solicitud.plan,
    modalidad: solicitud.modalidad,
    ...(solicitud.vigenteHasta ? { vigente_hasta: solicitud.vigenteHasta } : {}),
    ruc: solicitud.ruc,
    razon_social: solicitud.razonSocial,
    ...(solicitud.nombreComercial ? { nombre_comercial: solicitud.nombreComercial } : {}),
    correo_propietario: solicitud.correoPropietario,
    nombre_propietario: solicitud.nombrePropietario,
  };
}

export function aRespuestaAlta(respuesta: RespuestaAltaTenantCuerpo): RespuestaAltaTenant {
  return {
    tenantId: respuesta.tenant_id,
    estado: respuesta.estado,
    usuarioNuevo: respuesta.usuario_nuevo,
    correoEnviado: respuesta.correo_enviado,
  };
}
