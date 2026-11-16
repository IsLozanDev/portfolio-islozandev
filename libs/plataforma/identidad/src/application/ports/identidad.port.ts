import type { TipoDocumento, ValidezDocumento } from '@vitrina/shared/util';
import type { DatosDni, DatosRuc, TipoConsultable } from '../../domain/datos-identidad.js';
import type { MotivoConsulta } from '../../domain/motivo-consulta.js';

export const IDENTIDAD = Symbol('IdentidadPort');

export interface ConsultaDocumento {
  tipo: TipoConsultable;
  numero: string;
  motivo: MotivoConsulta;
  productoCodigo?: string;
}

export type FuenteRespuesta = 'CACHE' | 'PROVEEDOR';

interface RespuestaBase {
  fuente: FuenteRespuesta;
  proveedor: string;
  consultadoEn: Date;
}

export type RespuestaConsulta =
  | (RespuestaBase & { tipo: 'DNI'; datos: DatosDni })
  | (RespuestaBase & { tipo: 'RUC'; datos: DatosRuc; aptoFactura: boolean; motivoNoApto?: string });

/**
 * TR-RF-044 a 046. Para consumidores en proceso. El tenant y el usuario salen del TenantContext.
 * `consultar` lanza DocumentoInvalidoError, DocumentoNoEncontradoError o ProveedorNoDisponibleError.
 */
export interface IdentidadPort {
  validar(tipo: TipoDocumento, numero: string): ValidezDocumento;
  consultar(consulta: ConsultaDocumento): Promise<RespuestaConsulta>;
}
