import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose';
import type { VerificadorToken } from '../../application/ports/verificador-token.port.js';
import { AutenticacionNoDisponibleError, TokenInvalidoError } from '../../domain/errores.js';
import type { EntradaAmr, Principal, TipoUsuario } from '../../domain/principal.js';

export interface OpcionesSupabase {
  /** `{SUPABASE_URL}/auth/v1` (claim iss). */
  emisor: string;
  audiencia?: string;
  toleranciaRelojSeg?: number;
  /** Solo pruebas: URL alternativa del JWKS. */
  jwksUrl?: string;
  /** Solo pruebas: espera mínima antes de volver a pedir el JWKS por un kid desconocido. */
  enfriamientoMs?: number;
}

const TIPOS: readonly TipoUsuario[] = ['INTERNO', 'EXTERNO', 'SOPORTE'];

/**
 * Verifica tokens de Supabase Auth (ES256) contra el JWKS público del proyecto.
 * jose guarda las llaves en memoria y solo vuelve a pedirlas si caducan o aparece un kid nuevo.
 */
export class SupabaseJwksVerificador implements VerificadorToken {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly op: OpcionesSupabase) {
    const url = new URL(op.jwksUrl ?? `${op.emisor.replace(/\/$/, '')}/.well-known/jwks.json`);
    this.jwks = createRemoteJWKSet(url, { cacheMaxAge: 10 * 60_000, cooldownDuration: op.enfriamientoMs ?? 30_000 });
  }

  async verificar(token: string): Promise<Principal> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.op.emisor,
        audience: this.op.audiencia ?? 'authenticated',
        algorithms: ['ES256'],
        clockTolerance: this.op.toleranciaRelojSeg ?? 5,
        requiredClaims: ['sub', 'exp', 'iat', 'session_id', 'aal'],
      }));
    } catch (e) {
      throw traducir(e);
    }
    if (payload['role'] !== 'authenticated' || payload['is_anonymous'] === true) {
      throw new TokenInvalidoError('rol');
    }
    const tipo = payload['tipo_usuario'];
    return {
      usuarioId: String(payload.sub),
      tenantId: typeof payload['tenant_id'] === 'string' ? payload['tenant_id'] : null,
      tipo: TIPOS.includes(tipo as TipoUsuario) ? (tipo as TipoUsuario) : 'EXTERNO',
      aal: payload['aal'] === 'aal2' ? 'aal2' : 'aal1',
      sesionId: String(payload['session_id']),
      amr: leerAmr(payload['amr']),
    };
  }
}

// Supabase puede emitir amr como cadenas sueltas: sin timestamp no sirven para la regla de MFA.
function leerAmr(valor: unknown): EntradaAmr[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter(
    (e): e is EntradaAmr => typeof e === 'object' && e !== null && typeof e.method === 'string' && typeof e.timestamp === 'number',
  );
}

function traducir(e: unknown): Error {
  if (e instanceof errors.JWTExpired) return new TokenInvalidoError('expirado');
  if (e instanceof errors.JWTClaimValidationFailed) return new TokenInvalidoError(`claim ${e.claim}`);
  if (e instanceof errors.JOSEAlgNotAllowed) return new TokenInvalidoError('algoritmo');
  if (e instanceof errors.JWSSignatureVerificationFailed) return new TokenInvalidoError('firma');
  if (e instanceof errors.JWKSNoMatchingKey) return new TokenInvalidoError('kid');
  // Caída, timeout o respuesta inválida del JWKS: un 401 haría que el cliente cierre la sesión.
  if (e instanceof errors.JWKSTimeout || e instanceof errors.JWKSInvalid) return new AutenticacionNoDisponibleError();
  if (e instanceof errors.JOSEError && e.code === 'ERR_JOSE_GENERIC') return new AutenticacionNoDisponibleError();
  if (!(e instanceof errors.JOSEError)) return new AutenticacionNoDisponibleError();
  return new TokenInvalidoError('formato');
}
