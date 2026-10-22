import { Logger, Module, type DynamicModule, type OnModuleDestroy } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { TENANT_CONTEXT, TypeOrmUnitOfWork, UNIT_OF_WORK } from '@vitrina/plataforma/kernel-infra';
import { CACHE_PERMISOS, PERMISOS_REPOSITORIO, type CachePermisos, type PermisosRepositorio } from './application/ports/permisos.port.js';
import { REGISTRO_ACCESO, type RegistroAcceso } from './application/ports/registro-acceso.port.js';
import { VERIFICADOR_TOKEN, type VerificadorToken } from './application/ports/verificador-token.port.js';
import { AutenticacionGuard } from './interface/autenticacion.guard.js';
import { MfaGuard } from './interface/mfa.guard.js';
import { MFA_MAX_EDAD_SEG, SesionController } from './interface/sesion.controller.js';
import type { DataSource } from 'typeorm';
import { SupabaseJwksVerificador } from './infrastructure/supabase/supabase-jwks.verificador.js';
import { RegistroAccesoTypeorm } from './infrastructure/typeorm/registro-acceso.typeorm.js';
import { ResolverPermisos } from './application/resolver-permisos.js';
import { CachePermisosRedis, crearClienteRedis } from './infrastructure/redis/cache-permisos.redis.js';
import { PermisosSqlRepositorio } from './infrastructure/typeorm/permisos.sql.repositorio.js';

const CLIENTE_REDIS = Symbol('CLIENTE_REDIS');

/** Cierra la conexión a Redis con la app (app.close() en pruebas y apagado). */
class CierreRedis implements OnModuleDestroy {
  constructor(private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

export interface SeguridadOpciones {
  supabaseUrl: string;
  mfaMaxEdadSeg: number;
  /** El mismo DataSource que recibe KernelInfraModule. */
  dataSource: DataSource;
  /** Caché de permisos efectivos (TR-RNF-101). Conecta con el primer uso. */
  redisUrl: string;
  /** Solo pruebas. */
  jwksUrl?: string;
  /** Solo pruebas. */
  enfriamientoMs?: number;
}

// Usa los tokens de KernelInfraModule (global), que la app debe importar.
@Module({})
export class SeguridadModule {
  static register(op: SeguridadOpciones): DynamicModule {
    const logger = new Logger('Seguridad');
    return {
      module: SeguridadModule,
      controllers: [SesionController],
      providers: [
        { provide: MFA_MAX_EDAD_SEG, useValue: op.mfaMaxEdadSeg },
        {
          provide: VERIFICADOR_TOKEN,
          useFactory: (): VerificadorToken =>
            new SupabaseJwksVerificador({
              emisor: `${op.supabaseUrl.replace(/\/$/, '')}/auth/v1`,
              jwksUrl: op.jwksUrl,
              enfriamientoMs: op.enfriamientoMs,
            }),
        },
        { provide: REGISTRO_ACCESO, useFactory: (): RegistroAcceso => new RegistroAccesoTypeorm(op.dataSource) },
        {
          provide: CLIENTE_REDIS,
          // Solo el nombre del error: el mensaje puede traer la URL con la clave (RNF-026).
          useFactory: (): Redis => crearClienteRedis(op.redisUrl, (e) => logger.warn({ evento: 'seg.redis.error', error: e.name })),
        },
        { provide: CierreRedis, useFactory: (r: Redis) => new CierreRedis(r), inject: [CLIENTE_REDIS] },
        { provide: CACHE_PERMISOS, useFactory: (r: Redis): CachePermisos => new CachePermisosRedis(r), inject: [CLIENTE_REDIS] },
        {
          provide: PERMISOS_REPOSITORIO,
          useFactory: (uow: TypeOrmUnitOfWork, ctx: TenantContext): PermisosRepositorio => new PermisosSqlRepositorio(uow, ctx),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
        },
        {
          provide: ResolverPermisos,
          useFactory: (uow: UnitOfWork, ctx: TenantContext, repo: PermisosRepositorio, cache: CachePermisos) =>
            new ResolverPermisos(uow, ctx, repo, cache, (mensaje, datos) => logger.warn({ mensaje, ...datos })),
          inject: [UNIT_OF_WORK, TENANT_CONTEXT, PERMISOS_REPOSITORIO, CACHE_PERMISOS],
        },
        // APP_GUARD se ejecuta en el orden de registro: primero autenticación, luego MFA.
        {
          provide: APP_GUARD,
          useFactory: (r: Reflector, v: VerificadorToken, a: RegistroAcceso) => new AutenticacionGuard(r, v, a),
          inject: [Reflector, VERIFICADOR_TOKEN, REGISTRO_ACCESO],
        },
        { provide: APP_GUARD, useFactory: (r: Reflector) => new MfaGuard(r, op.mfaMaxEdadSeg), inject: [Reflector] },
      ],
      exports: [VERIFICADOR_TOKEN, ResolverPermisos],
    };
  }
}
