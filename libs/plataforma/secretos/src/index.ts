// TR-SEC: bóveda de secretos del tenant con cifrado por sobre y rotación sin interrupción (spec 41). Solo este archivo es público.
export { BOVEDA_SECRETOS, type BovedaSecretos } from './application/ports/boveda-secretos.js';
export { ReenvolverClaves, type ResultadoReenvoltura } from './application/reenvolver-claves.js';
export { BYTES_CLAVE, ClavesMaestras } from './domain/claves-maestras.js';
export { BYTES_MAXIMOS_VALOR } from './domain/valor-secreto.js';
export {
  BovedaNoConfiguradaError,
  ClaveMaestraDesconocidaError,
  ClaveMaestraInvalidaError,
  SecretoCorruptoError,
  SecretoModificadoError,
  SecretoNoEncontradoError,
  SecretoSinActorError,
  TipoSecretoInvalidoError,
  ValorSecretoInvalidoError,
} from './domain/errores.js';
export { ENTIDADES_SEC } from './infrastructure/typeorm/entidades.js';
export { camposEntornoSecretos, clavesMaestrasDe, exigirClaveMaestraEnProduccion } from './interface/entorno-secretos.js';
export { SecretosModule, type ReenvolturaOpciones, type SecretosOpciones } from './secretos.module.js';
