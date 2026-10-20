/** Datos del contribuyente según el padrón SUNAT (TR-IDN, R2). */
export interface DatosPadron {
  razonSocial: string;
  estado: string;
  condicion: string;
}

export interface PadronRucPort {
  /** null si el padrón no tiene datos o no está disponible: la razón social viene del comando. */
  consultar(ruc: string): Promise<DatosPadron | null>;
}
