// TR-FE: emisor electrónico por empresa con sus secretos en la bóveda y aviso de vencimiento del certificado (spec 49). Solo este archivo es público.
export { ComprobantesModule, type ComprobantesOpciones, type ComprobantesWorkerOpciones } from './comprobantes.module.js';
export { AvisarCertificadosPorVencer, type ResultadoAvisos } from './application/avisar-certificados-por-vencer.js';
export { BYTES_MAXIMOS_CERTIFICADO } from './application/cargar-certificado.js';
export { ENTIDADES_FE } from './infrastructure/typeorm/entidades.js';
export { ESQUEMAS_FE, registrarEsquemasFe } from './infrastructure/event-schemas.js';
export { EVENTOS_FE, type CertificadoPorVencer, type EmisorConfigurado } from './domain/eventos-fe.js';
export { PARAMETRO_DIAS_AVISO_CERTIFICADO, PERMISOS_FE } from './domain/permisos-fe.js';
export { ESTADOS_EMISOR, type EstadoEmisor } from './domain/estado-emisor.js';
export { REGIMENES_IGV, type RegimenIgv } from './domain/regimen-igv.js';
export {
  ActorRequeridoFeError,
  ArchivoCertificadoInvalidoError,
  CertificadoNoAceptadoError,
  CertificadoNoVigenteError,
  CertificadoOtroRucError,
  CertificadoSinRucError,
  CertificadoVencidoError,
  ClaveCertificadoIncorrectaError,
  DatosEmisorInvalidosError,
  EmisorNoEncontradoError,
  EmpresaInactivaError,
  EmpresaNoEncontradaError,
  ProveedorFeInvalidoError,
  VersionObsoletaEmisorError,
} from './domain/errores.js';
