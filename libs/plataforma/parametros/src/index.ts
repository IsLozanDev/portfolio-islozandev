// TR-CFG: parámetros jerárquicos (spec 09). Solo este archivo es público.
export { DefinicionInvalidaError, ParametroNoDefinidoError } from './domain/errores.js';
export { PERMISOS_CFG } from './domain/permisos-cfg.js';
export type { OrigenValor } from './domain/tipos.js';
export { PARAMETRO_PORT, type ContextoParametro, type ParametroPort } from './application/ports/parametro.port.js';
export { RegistrarDefiniciones, type EntradaDefiniciones } from './application/registrar-definiciones.js';
export type { RepositorioDefiniciones, ResumenDefiniciones } from './application/ports/repositorios.js';
export { DefinicionesRepositorioTypeOrm } from './infrastructure/typeorm/definiciones.repositorio.js';
export { ENTIDADES_CFG } from './infrastructure/typeorm/entidades.js';
export { ValidadorEsquemaAjv } from './infrastructure/ajv/validador-esquema.ajv.js';
export { ESQUEMAS_CFG, registrarEsquemasCfg } from './infrastructure/event-schemas.js';
export { ParametrosModule, type ParametrosOpciones } from './parametros.module.js';
