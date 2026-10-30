/** Fila de `GET /v1/org/empresas` y de `GET /v1/org/empresas/:id` tal cual (spec 17a y 17c). */
export interface FilaEmpresaRespuesta {
  id: string;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  direccion_fiscal: string | null;
  ubigeo: string | null;
  activo: boolean;
  version: number;
}

export interface EmpresaRegistradaRespuesta {
  empresa_id: string;
  sucursal_principal_id: string;
}

export interface Empresa {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  ubigeo: string | null;
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
}

export interface EmpresaRegistrada {
  empresaId: string;
  sucursalPrincipalId: string;
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
  };
}
