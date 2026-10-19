import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { VERIFICADOR_TOKEN } from './application/ports/verificador-token.port.js';
import { CACHE_PERMISOS, PERMISOS_REPOSITORIO, type CachePermisos, type PermisosRepositorio } from './application/ports/permisos.port.js';
import { ResolverPermisosUseCase } from './application/resolver-permisos.use-case.js';
import { SupabaseJwksVerificador, type OpcionesSupabase } from './infrastructure/supabase-jwks.verificador.js';
import { AutenticacionGuard } from './interface/autenticacion.guard.js';
import { PermisoGuard } from './interface/permiso.guard.js';

export interface OpcionesSeguridad {
  supabase: OpcionesSupabase;
  repositorio: () => PermisosRepositorio;
  cache: () => CachePermisos;
}

/** Cableado con useFactory: el dominio y la aplicación no conocen NestJS ni Supabase. */
@Module({})
export class SeguridadModule {
  static registrar(op: OpcionesSeguridad): DynamicModule {
    return {
      module: SeguridadModule,
      global: true,
      providers: [
        { provide: VERIFICADOR_TOKEN, useFactory: () => new SupabaseJwksVerificador(op.supabase) },
        { provide: PERMISOS_REPOSITORIO, useFactory: op.repositorio },
        { provide: CACHE_PERMISOS, useFactory: op.cache },
        { provide: ResolverPermisosUseCase, useFactory: (r: PermisosRepositorio, c: CachePermisos) => new ResolverPermisosUseCase(r, c), inject: [PERMISOS_REPOSITORIO, CACHE_PERMISOS] },
        // Orden: primero autenticación, luego autorización.
        { provide: APP_GUARD, useClass: AutenticacionGuard },
        { provide: APP_GUARD, useFactory: (rf: Reflector, rs: ResolverPermisosUseCase) => new PermisoGuard(rf, rs), inject: [Reflector, ResolverPermisosUseCase] },
      ],
      exports: [ResolverPermisosUseCase, CACHE_PERMISOS],
    };
  }
}
