export interface DiasAvisoCertificado {
  /** `plat.fe.dias_aviso_certificado` del tenant del contexto. */
  delTenant(): Promise<number>;
}
