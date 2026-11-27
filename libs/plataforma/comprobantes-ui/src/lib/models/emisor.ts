import type { AmbienteEmisor, EstadoEmisor, EstadoPrueba } from './estado-emisor';

/** Los mismos que el CHECK de fe.emisor.regimen_igv. */
export const REGIMENES_IGV = ['GENERAL', 'REDUCIDO_RESTAURANTES'] as const;
export type RegimenIgv = (typeof REGIMENES_IGV)[number];

export const ETIQUETAS_REGIMEN_IGV: Record<RegimenIgv, string> = {
  GENERAL: 'General',
  REDUCIDO_RESTAURANTES: 'Reducido para restaurantes',
};

export interface CertificadoEmisor {
  ruc: string;
  /** Instante ISO. */
  venceEn: string;
  huellaSha256: string;
}

export interface PruebaEmisor {
  estado: EstadoPrueba;
  numero: number;
  solicitadaEn: string;
  resultadoEn: string | null;
  codigo: string | null;
  descripcion: string | null;
}

/** El emisor sin secretos: la API nunca devuelve las claves. */
export interface Emisor {
  emisorId: string;
  empresaId: string;
  proveedor: string;
  ambiente: AmbienteEmisor;
  estado: EstadoEmisor;
  regimenIgv: RegimenIgv;
  leyendaPie: string | null;
  usuarioProveedor: string | null;
  tieneCredencial: boolean;
  certificado: CertificadoEmisor | null;
  urlProveedor: string | null;
  prueba: PruebaEmisor | null;
  produccionHabilitadaEn: string | null;
  version: number;
}

export interface ResumenEmisor {
  estado: EstadoEmisor;
  proveedor: string;
  ambiente: AmbienteEmisor;
  certificadoVenceEn: string | null;
  pruebaEstado: EstadoPrueba | null;
}

export interface EmpresaConEmisor {
  empresaId: string;
  ruc: string;
  razonSocial: string;
  /** null: la empresa aún no configura su emisor. */
  emisor: ResumenEmisor | null;
}

export interface EmisorRespuesta {
  emisor_id: string;
  empresa_id: string;
  proveedor: string;
  ambiente: AmbienteEmisor;
  estado: EstadoEmisor;
  regimen_igv: RegimenIgv;
  leyenda_pie: string | null;
  usuario_proveedor: string | null;
  tiene_credencial: boolean;
  certificado: { ruc: string; vence_en: string; huella_sha256: string } | null;
  url_proveedor: string | null;
  prueba: {
    estado: EstadoPrueba;
    numero: number;
    solicitada_en: string;
    resultado_en: string | null;
    codigo: string | null;
    descripcion: string | null;
  } | null;
  produccion_habilitada_en: string | null;
  version: number;
}

export interface EmpresaConEmisorRespuesta {
  empresa_id: string;
  ruc: string;
  razon_social: string;
  emisor: {
    estado: EstadoEmisor;
    proveedor: string;
    ambiente: AmbienteEmisor;
    certificado_vence_en: string | null;
    prueba_estado: EstadoPrueba | null;
  } | null;
}

/** Cuerpo del `PUT /v1/fe/emisores/{empresaId}`: `clave` solo si se escribió; `version` si el emisor ya existe. */
export interface CargaConfigurarEmisor {
  proveedor: string;
  usuario_proveedor: string;
  clave?: string;
  regimen_igv: RegimenIgv;
  leyenda_pie: string | null;
  url_proveedor?: string | null;
  version?: number;
}

export function aEmisor(respuesta: EmisorRespuesta): Emisor {
  return {
    emisorId: respuesta.emisor_id,
    empresaId: respuesta.empresa_id,
    proveedor: respuesta.proveedor,
    ambiente: respuesta.ambiente,
    estado: respuesta.estado,
    regimenIgv: respuesta.regimen_igv,
    leyendaPie: respuesta.leyenda_pie,
    usuarioProveedor: respuesta.usuario_proveedor,
    tieneCredencial: respuesta.tiene_credencial,
    certificado: respuesta.certificado && {
      ruc: respuesta.certificado.ruc,
      venceEn: respuesta.certificado.vence_en,
      huellaSha256: respuesta.certificado.huella_sha256,
    },
    urlProveedor: respuesta.url_proveedor,
    prueba: respuesta.prueba && {
      estado: respuesta.prueba.estado,
      numero: respuesta.prueba.numero,
      solicitadaEn: respuesta.prueba.solicitada_en,
      resultadoEn: respuesta.prueba.resultado_en,
      codigo: respuesta.prueba.codigo,
      descripcion: respuesta.prueba.descripcion,
    },
    produccionHabilitadaEn: respuesta.produccion_habilitada_en,
    version: respuesta.version,
  };
}

export function aEmpresaConEmisor(respuesta: EmpresaConEmisorRespuesta): EmpresaConEmisor {
  return {
    empresaId: respuesta.empresa_id,
    ruc: respuesta.ruc,
    razonSocial: respuesta.razon_social,
    emisor: respuesta.emisor && {
      estado: respuesta.emisor.estado,
      proveedor: respuesta.emisor.proveedor,
      ambiente: respuesta.emisor.ambiente,
      certificadoVenceEn: respuesta.emisor.certificado_vence_en,
      pruebaEstado: respuesta.emisor.prueba_estado,
    },
  };
}
