import { HttpErrorResponse } from '@angular/common/http';
import type { ErrorAdmin } from './error-admin';

export const CODIGO_LOGO_INVALIDO = 'LOGO_INVALIDO';
export const MOTIVOS_LOGO_INVALIDO = ['NO_ENCONTRADO', 'NO_DISPONIBLE', 'CATEGORIA', 'OTRA_ENTIDAD'] as const;
export type MotivoLogoInvalido = (typeof MOTIVOS_LOGO_INVALIDO)[number];

/** Fila de `GET /v1/org/empresas` y de `GET /v1/org/empresas/:id` tal cual (spec 17a, 17c y 17d). */
export interface FilaEmpresaRespuesta {
  id: string;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  direccion_fiscal: string | null;
  ubigeo: string | null;
  /** E.164. */
  telefono: string | null;
  correo: string | null;
  sitio_web: string | null;
  logo_archivo_id: string | null;
  activo: boolean;
  version: number;
}

export interface EmpresaRegistradaRespuesta {
  empresa_id: string;
  sucursal_principal_id: string;
  advertencias: string[];
}

export interface Empresa {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  ubigeo: string | null;
  telefono: string | null;
  correo: string | null;
  sitioWeb: string | null;
  logoArchivoId: string | null;
  activo: boolean;
  /** Bloqueo optimista: viaja en el `PUT` (TR-RNF-008). */
  version: number;
}

/** Lo que se edita de una empresa; el RUC solo se escribe en el alta. */
export interface DatosEmpresa {
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  ubigeo: string | null;
  /** E.164. */
  telefono: string | null;
  correo: string | null;
  sitioWeb: string | null;
}

/** El logo solo se asigna al editar: ARC necesita el id de la empresa para subirlo. null lo quita. */
export interface DatosEdicionEmpresa extends DatosEmpresa {
  logoArchivoId: string | null;
}

export interface EmpresaRegistrada {
  empresaId: string;
  sucursalPrincipalId: string;
  /** TR-RN-019: contribuyente no apto según el padrón; la empresa quedó registrada igual (spec 28b). */
  advertencias: string[];
}

export interface PaginaOrganizacion {
  pagina: number;
  tamano: number;
}

export function filaAEmpresa(respuesta: FilaEmpresaRespuesta): Empresa {
  return {
    id: respuesta.id,
    ruc: respuesta.ruc,
    razonSocial: respuesta.razon_social,
    nombreComercial: respuesta.nombre_comercial,
    direccionFiscal: respuesta.direccion_fiscal,
    ubigeo: respuesta.ubigeo,
    telefono: respuesta.telefono,
    correo: respuesta.correo,
    sitioWeb: respuesta.sitio_web,
    logoArchivoId: respuesta.logo_archivo_id,
    activo: respuesta.activo,
    version: respuesta.version,
  };
}

export function cuerpoDatosEmpresa(datos: DatosEmpresa) {
  return {
    razon_social: datos.razonSocial,
    nombre_comercial: datos.nombreComercial,
    direccion_fiscal: datos.direccionFiscal,
    ubigeo: datos.ubigeo,
    telefono: datos.telefono,
    correo: datos.correo,
    sitio_web: datos.sitioWeb,
  };
}

export function cuerpoEdicionEmpresa(datos: DatosEdicionEmpresa) {
  return { ...cuerpoDatosEmpresa(datos), logo_archivo_id: datos.logoArchivoId };
}

/** El `motivo` que la API suma a `400 LOGO_INVALIDO`; null en cualquier otro error. */
export function motivoDeLogoInvalido(error: ErrorAdmin): MotivoLogoInvalido | null {
  if (error.codigo !== CODIGO_LOGO_INVALIDO || !(error.cause instanceof HttpErrorResponse)) return null;
  const motivo: unknown = (error.cause.error as { motivo?: unknown } | null)?.motivo;
  return MOTIVOS_LOGO_INVALIDO.find((conocido) => conocido === motivo) ?? null;
}
