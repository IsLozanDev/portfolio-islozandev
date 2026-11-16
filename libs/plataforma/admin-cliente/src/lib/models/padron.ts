/** Spec 28b: sin este permiso el formulario de empresa no prellena la razón social. */
export const PERMISO_CONSULTAR_IDENTIDAD = 'plat.identidad.consultar';

/** Respuesta RUC de `GET /v1/identidad/RUC/:ruc` (spec 28), solo los campos que usa el formulario. */
export interface RucPadronRespuesta {
  razon_social: string;
  estado: string;
  condicion: string;
  apto_factura: boolean;
  motivo_no_apto?: string;
}

export interface DatosPadronRuc {
  razonSocial: string;
  estado: string;
  condicion: string;
  /** TR-RN-019: ACTIVO y HABIDO. */
  aptoFactura: boolean;
  motivoNoApto: string | null;
}

export function aDatosPadronRuc(respuesta: RucPadronRespuesta): DatosPadronRuc {
  return {
    razonSocial: respuesta.razon_social,
    estado: respuesta.estado,
    condicion: respuesta.condicion,
    aptoFactura: respuesta.apto_factura,
    motivoNoApto: respuesta.motivo_no_apto ?? null,
  };
}
