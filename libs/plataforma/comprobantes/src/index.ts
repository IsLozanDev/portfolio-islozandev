// TR-FE: emisor electrónico por empresa con sus secretos en la bóveda y aviso de vencimiento del certificado (spec 49),
// prueba en beta con el PSE y paso a producción (spec 50). Solo este archivo es público.
export {
  ComprobantesModule,
  type ComprobantesOpciones,
  type ComprobantesPruebasOpciones,
  type ComprobantesWorkerOpciones,
} from './comprobantes.module.js';
export { AvisarCertificadosPorVencer, type ResultadoAvisos } from './application/avisar-certificados-por-vencer.js';
export { EjecutarPruebaEmisor, ErrorTecnicoPseError } from './application/ejecutar-prueba-emisor.js';
export type { IntentoPrueba, TrabajoPruebaFe } from './application/ports/cola-pruebas-fe.js';
export { INTENTOS_PRUEBA_FE, NOMBRE_COLA_PRUEBAS_FE } from './infrastructure/bullmq/cola-pruebas.js';
export { camposEntornoFe, type EntornoFe } from './interface/entorno-fe.js';
export { BYTES_MAXIMOS_CERTIFICADO } from './application/cargar-certificado.js';
export { ENTIDADES_FE } from './infrastructure/typeorm/entidades.js';
export { ESQUEMAS_FE, registrarEsquemasFe } from './infrastructure/event-schemas.js';
export {
  EVENTOS_FE,
  type CambioEstadoEmisor,
  type CertificadoPorVencer,
  type EmisorConfigurado,
  type PruebaSolicitada,
} from './domain/eventos-fe.js';
export { PARAMETRO_DIAS_AVISO_CERTIFICADO, PERMISOS_FE } from './domain/permisos-fe.js';
export { ESTADOS_EMISOR, ESTADOS_PRUEBA, type EstadoEmisor, type EstadoPrueba } from './domain/estado-emisor.js';
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
  EmisorEnProduccionError,
  EmisorNoEncontradoError,
  EmpresaInactivaError,
  EmpresaNoEncontradaError,
  EstadoEmisorInvalidoError,
  ProduccionNoPermitidaError,
  ProveedorFeInvalidoError,
  ProveedorSimuladoEnProduccionError,
  PruebaBetaRequeridaError,
  PruebaEnCursoError,
  UrlProveedorNoPermitidaError,
  VersionObsoletaEmisorError,
} from './domain/errores.js';
