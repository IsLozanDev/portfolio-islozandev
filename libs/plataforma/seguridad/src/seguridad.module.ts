import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { REGISTRO_ACCESO, type RegistroAcceso } from './application/ports/registro-acceso.port.js';
import { VERIFICADOR_TOKEN, type VerificadorToken } from './application/ports/verificador-token.port.js';
import { AutenticacionGuard } from './interface/autenticacion.guard.js';
import { MfaGuard } from './interface/mfa.guard.js';
import { MFA_MAX_EDAD_SEG, SesionController } from './interface/sesion.controller.js';
import type { DataSource } from 'typeorm';
import { SupabaseJwksVerificador } from './infrastructure/supabase/supabase-jwks.verificador.js';
import { RegistroAccesoTypeorm } from './infrastructure/typeorm/registro-acceso.typeorm.js';

export interface SeguridadOpciones {
  supabaseUrl: string;
  mfaMaxEdadSeg: number;
  /** El mismo DataSource que recibe KernelInfraModule. */
  dataSource: DataSource;
  /** Solo pruebas. */
  jwksUrl?: string;
  /** Solo pruebas. */
  enfriamientoMs?: number;
}

@Module({})
export class SeguridadModule {
  static register(op: SeguridadOpciones): DynamicModule {
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
        // APP_GUARD se ejecuta en el orden de registro: primero autenticación, luego MFA.
        {
          provide: APP_GUARD,
          useFactory: (r: Reflector, v: VerificadorToken, a: RegistroAcceso) => new AutenticacionGuard(r, v, a),
          inject: [Reflector, VERIFICADOR_TOKEN, REGISTRO_ACCESO],
        },
        { provide: APP_GUARD, useFactory: (r: Reflector) => new MfaGuard(r, op.mfaMaxEdadSeg), inject: [Reflector] },
      ],
      exports: [VERIFICADOR_TOKEN],
    };
  }
}
