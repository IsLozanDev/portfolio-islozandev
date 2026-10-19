import { createRemoteJWKSet, jwtVerify, errors, type JWTPayload } from 'jose';
import type { VerificadorToken } from '../application/ports/verificador-token.port.js';
import type { Principal, TipoUsuario } from '../domain/principal.js';
import { TokenInvalidoError } from '../domain/errores.js';

export interface OpcionesSupabase {
  /** https://<ref>.supabase.co/auth/v1  (claim iss) */
  emisor: string;
  /** 'authenticated' */
  audiencia?: string;
  /** Tolerancia de reloj en segundos */
  toleranciaReloj?: number;
  /** Para pruebas: URL alternativa de las llaves */
  jwksUrl?: string;
}

const TIPOS: readonly TipoUsuario[] = ['INTERNO', 'EXTERNO', 'SOPORTE'];

/**
 * Verifica tokens de Supabase Auth firmados con llaves asimétricas (ES256/RS256)
 * contra el JWKS público del proyecto. No llama a Supabase en cada solicitud:
 * jose guarda las llaves en memoria y las vuelve a pedir si aparece un kid nuevo.
 */
export class SupabaseJwksVerificador implements VerificadorToken {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly op: OpcionesSupabase) {
    const url = new URL(op.jwksUrl ?? `${op.emisor.replace(/\/$/, '')}/.well-known/jwks.json`);
    // cacheMaxAge 10 min: alineado con la caché del JWKS en Supabase; permite rotar llaves.
    this.jwks = createRemoteJWKSet(url, { cacheMaxAge: 10 * 60_000, cooldownDuration: 30_000 });
  }

  async verificar(token: string): Promise<Principal> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.op.emisor,
        audience: this.op.audiencia ?? 'authenticated',
        algorithms: ['ES256', 'RS256'],     // nunca HS256 ni none
        clockTolerance: this.op.toleranciaReloj ?? 5,
        requiredClaims: ['sub', 'exp', 'iat', 'session_id', 'aal'],
      }));
    } catch (e) {
      const motivo = e instanceof errors.JWTExpired ? 'expirado'
        : e instanceof errors.JWTClaimValidationFailed ? `claim ${e.claim}`
        : e instanceof errors.JOSEAlgNotAllowed ? 'algoritmo no permitido'
        : e instanceof errors.JWSSignatureVerificationFailed ? 'firma'
        : 'formato';
      throw new TokenInvalidoError(motivo);
    }
    if (payload['role'] !== 'authenticated' || payload['is_anonymous'] === true) {
      throw new TokenInvalidoError('rol');
    }
    const tipo = payload['tipo_usuario'];
    const aal = payload['aal'];
    return {
      usuarioId: String(payload.sub),
      tenantId: typeof payload['tenant_id'] === 'string' ? payload['tenant_id'] : null,
      tipo: TIPOS.includes(tipo as TipoUsuario) ? (tipo as TipoUsuario) : 'EXTERNO',
      aal: aal === 'aal2' ? 'aal2' : 'aal1',
      sesionId: String(payload['session_id']),
      email: typeof payload['email'] === 'string' ? payload['email'] : null,
    };
  }
}
