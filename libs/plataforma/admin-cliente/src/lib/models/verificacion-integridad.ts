export type MotivoRotura = 'HASH' | 'ENLACE' | 'HUECO' | 'TRUNCADA';
export type EstadoVerificacion = 'OK' | 'ROTA';
export type ModoVerificacion = 'INCREMENTAL' | 'COMPLETA';

export interface VerificacionIntegridadRespuesta {
  id: string;
  modo: ModoVerificacion;
  desde_numero: string;
  hasta_numero: string;
  filas: number;
  estado: EstadoVerificacion;
  numero_roto: string | null;
  motivo: MotivoRotura | null;
  iniciada_en: string;
  terminada_en: string;
}

/** Último resultado de la verificación diaria de la cadena del tenant (spec 20b, TR-RNF-112). */
export interface VerificacionIntegridad {
  estado: EstadoVerificacion;
  modo: ModoVerificacion;
  /** Último número verificado sin falla: el largo de la cadena sana. */
  hastaNumero: string;
  numeroRoto: string | null;
  motivo: MotivoRotura | null;
  terminadaEn: Date;
}

/** Lo que pinta la franja de la lista; `oculta` cuando el dato no es del actor (403) o la consulta falla. */
export type EstadoFranja =
  | { tipo: 'cargando' }
  | { tipo: 'oculta' }
  | { tipo: 'sin-verificar' }
  | { tipo: 'verificada'; verificacion: VerificacionIntegridad };

export function aVerificacionIntegridad(respuesta: VerificacionIntegridadRespuesta): VerificacionIntegridad {
  return {
    estado: respuesta.estado,
    modo: respuesta.modo,
    hastaNumero: respuesta.hasta_numero,
    numeroRoto: respuesta.numero_roto,
    motivo: respuesta.motivo,
    terminadaEn: new Date(respuesta.terminada_en),
  };
}
