// API pública de libs/plataforma/seguridad: lo único que otros módulos pueden importar.
export * from './domain/principal.js';
export * from './domain/errores.js';
export * from './application/ports/verificador-token.port.js';
export * from './application/ports/permisos.port.js';
export * from './application/resolver-permisos.use-case.js';
export * from './interface/decoradores.js';
export { SeguridadModule, type OpcionesSeguridad } from './seguridad.module.js';
export { CachePermisosRedis } from './infrastructure/cache-permisos.redis.js';
export { PermisosSqlRepositorio, type EjecutorSql } from './infrastructure/permisos.sql.repositorio.js';
