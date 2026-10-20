import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { REGISTRO_ACCESO, type RegistroAcceso } from './application/ports/registro-acceso.port.js';
import { VERIFICADOR_TOKEN, type VerificadorToken } from './application/ports/verificador-token.port.js';
import { AutenticacionGuard } from './interface/autenticacion.guard.js';
import { MfaGuard } from './interface/mfa.guard.js';
import { SupabaseJwksVerificador } from './infrastructure/supabase/supabase-jwks.verificador.js';

export interface SeguridadOpciones {
  supabaseUrl: string;
  mfaMaxEdadSeg: number;
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
      providers: [
        {
          provide: VERIFICADOR_TOKEN,
          useFactory: (): VerificadorToken =>
            new SupabaseJwksVerificador({
              emisor: `${op.supabaseUrl.replace(/\/$/, '')}/auth/v1`,
              jwksUrl: op.jwksUrl,
              enfriamientoMs: op.enfriamientoMs,
            }),
        },
        { provide: REGISTRO_ACCESO, useValue: { marcar: async () => undefined } satisfies RegistroAcceso },
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
