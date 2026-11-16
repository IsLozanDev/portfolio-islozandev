import type { DatosDni, DatosRuc, DocumentoConDatos, TipoConsultable } from '../../domain/datos-identidad.js';

/** Un adaptador por proveedor externo (regla 10). `null` = el documento no existe. */
export interface ProveedorIdentidad {
  readonly codigo: string;
  consultarDni(numero: string, señal: AbortSignal): Promise<DatosDni | null>;
  consultarRuc(numero: string, señal: AbortSignal): Promise<DatosRuc | null>;
}

/** Fila activa de idn.proveedor. */
export interface ProveedorConfigurado {
  codigo: string;
  prioridad: number;
  ttlDias: number;
  timeoutMs: number;
}

export const CONFIGURACION_PROVEEDORES = Symbol('ConfiguracionProveedores');

export interface ConfiguracionProveedores {
  /** Proveedores activos para el tipo, de menor a mayor prioridad. */
  activosPara(tipo: TipoConsultable): Promise<ProveedorConfigurado[]>;
}

export type RespuestaProveedores =
  | { resultado: 'ENCONTRADO'; documento: DocumentoConDatos; proveedor: ProveedorConfigurado }
  | { resultado: 'NO_ENCONTRADO'; proveedor: ProveedorConfigurado }
  | { resultado: 'NO_DISPONIBLE' };

export const CONSULTOR_PROVEEDORES = Symbol('ConsultorProveedores');

/** Recorre los proveedores configurados con timeout, respaldo y circuit breaker. */
export interface ConsultorProveedores {
  consultar(tipo: TipoConsultable, numero: string, configurados: ProveedorConfigurado[]): Promise<RespuestaProveedores>;
}
