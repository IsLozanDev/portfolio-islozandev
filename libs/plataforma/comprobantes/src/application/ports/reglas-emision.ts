import type { Decimal } from '../../domain/comprobante/dinero.js';
import type { GrupoAfectacion } from '../../domain/comprobante/linea-comprobante.js';
import type { SituacionContribuyente } from '../../domain/comprobante/reglas-factura.js';
import type { RegimenIgv } from '../../domain/regimen-igv.js';

/** Catálogos SUNAT de TR-CAT vigentes hoy para el tenant del contexto. */
export interface CatalogosSunat {
  existeUnidad(codigo: string): Promise<boolean>;
  existeMoneda(codigo: string): Promise<boolean>;
  existeTipoDocumento(codigo: string): Promise<boolean>;
  /** null si el código no existe, no está vigente o no es una operación onerosa gravada, exonerada o inafecta. */
  grupoAfectacion(codigo: string): Promise<GrupoAfectacion | null>;
}

/**
 * Tasa de IGV del catálogo TASA_IGV vigente hoy en Lima, que es la fecha de emisión: CAT resuelve la vigencia
 * por fecha. TasaIgvNoVigenteError si el régimen no tiene tasa vigente.
 */
export interface TasaIgv {
  vigente(regimen: RegimenIgv): Promise<Decimal>;
}

/** TR-RN-018: el parámetro `plat.fe.boleta_monto_identificacion` resuelto por empresa y sucursal. */
export interface UmbralBoleta {
  valor(empresaId: string, sucursalId: string): Promise<Decimal>;
}

/** TR-RN-019: null si el padrón no tiene datos o no responde; nunca impide emitir. */
export interface PadronAdquirente {
  situacion(ruc: string): Promise<SituacionContribuyente | null>;
}

/** SucursalNoEncontradaError si la sucursal no es de la empresa (o es de otro tenant). */
export interface SucursalesEmisoras {
  exigirDeLaEmpresa(sucursalId: string, empresaId: string): Promise<void>;
  /** Anexo SUNAT de la sucursal; null si ORG no lo tiene. SucursalNoEncontradaError si no existe. */
  codigoEstablecimiento(sucursalId: string): Promise<string | null>;
}
