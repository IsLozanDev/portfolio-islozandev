import type { EstadoTenant, ProductoCodigo } from './catalogos';

export interface FiltroTenants {
  q?: string;
  estado?: EstadoTenant;
  producto?: ProductoCodigo;
  /** Empieza en 1, como la API. */
  pagina: number;
  tamano: number;
}

/** Respuestas tal cual de `/v1/org/tenants` (spec 17a). */
export interface SuscripcionRespuesta {
  producto_codigo: string;
  plan: string;
  estado: string;
  vigente_hasta: string | null;
}

export interface TenantListadoRespuesta {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoTenant;
  creado_en: string;
  suscripciones: SuscripcionRespuesta[];
}

export interface CambioDeEstadoRespuesta {
  estado_anterior: EstadoTenant;
  estado_nuevo: EstadoTenant;
  motivo: string;
  fecha_efectiva: string;
  registrado_en: string;
}

export interface TenantDetalleRespuesta extends TenantListadoRespuesta {
  estado_motivo: string | null;
  estado_cambiado_en: string | null;
  version: number;
  empresa_principal: { id: string; ruc: string; razon_social: string } | null;
  historial: CambioDeEstadoRespuesta[];
}

export interface SuscripcionResumen {
  productoCodigo: string;
  plan: string;
  estado: string;
  vigenteHasta: string | null;
}

export interface TenantListado {
  id: string;
  codigo: string;
  nombre: string;
  estado: EstadoTenant;
  creadoEn: string;
  suscripciones: SuscripcionResumen[];
}

export interface CambioDeEstado {
  estadoAnterior: EstadoTenant;
  estadoNuevo: EstadoTenant;
  motivo: string;
  fechaEfectiva: string;
  registradoEn: string;
}

export interface TenantDetalle extends TenantListado {
  estadoMotivo: string | null;
  estadoCambiadoEn: string | null;
  version: number;
  empresaPrincipal: { id: string; ruc: string; razonSocial: string } | null;
  historial: CambioDeEstado[];
}

export interface SolicitudCambioEstado {
  estado: EstadoTenant;
  motivo: string;
}

export interface ResultadoCambioEstado {
  cambiado: boolean;
  estado: EstadoTenant;
}

export function aTenantListado(fila: TenantListadoRespuesta): TenantListado {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    estado: fila.estado,
    creadoEn: fila.creado_en,
    suscripciones: fila.suscripciones.map(aSuscripcionResumen),
  };
}

export function aTenantDetalle(respuesta: TenantDetalleRespuesta): TenantDetalle {
  const empresa = respuesta.empresa_principal;
  return {
    ...aTenantListado(respuesta),
    estadoMotivo: respuesta.estado_motivo,
    estadoCambiadoEn: respuesta.estado_cambiado_en,
    version: respuesta.version,
    empresaPrincipal: empresa ? { id: empresa.id, ruc: empresa.ruc, razonSocial: empresa.razon_social } : null,
    historial: respuesta.historial.map(aCambioDeEstado),
  };
}

function aSuscripcionResumen(suscripcion: SuscripcionRespuesta): SuscripcionResumen {
  return {
    productoCodigo: suscripcion.producto_codigo,
    plan: suscripcion.plan,
    estado: suscripcion.estado,
    vigenteHasta: suscripcion.vigente_hasta,
  };
}

function aCambioDeEstado(cambio: CambioDeEstadoRespuesta): CambioDeEstado {
  return {
    estadoAnterior: cambio.estado_anterior,
    estadoNuevo: cambio.estado_nuevo,
    motivo: cambio.motivo,
    fechaEfectiva: cambio.fecha_efectiva,
    registradoEn: cambio.registrado_en,
  };
}
