import { HttpException, Logger, type ExecutionContext } from '@nestjs/common';
import { MfaRequeridaError } from '../domain/errores.js';
import type { Principal } from '../domain/principal.js';

interface Solicitud {
  method: string;
  path: string;
}

interface Respuesta {
  setHeader(nombre: string, valor: string): void;
}

const logger = new Logger('Seguridad');

export interface Rechazo {
  estado: 400 | 401 | 403 | 503;
  cuerpo: { codigo: string } & Record<string, unknown>;
  wwwAuthenticate?: string;
  motivo: string;
  usuarioId?: string;
}

/** Escribe el log del rechazo (sin token ni correo, RNF-026) y devuelve la excepción a lanzar. */
export function rechazar(ctx: ExecutionContext, r: Rechazo): HttpException {
  const http = ctx.switchToHttp();
  const req = http.getRequest<Solicitud>();
  if (r.wwwAuthenticate) http.getResponse<Respuesta>().setHeader('WWW-Authenticate', r.wwwAuthenticate);
  logger.warn({
    evento: 'auth.rechazo',
    codigo: r.cuerpo.codigo,
    motivo: r.motivo,
    ruta: req.path,
    metodo: req.method,
    ...(r.usuarioId ? { usuario_id: r.usuarioId } : {}),
  });
  return new HttpException(r.cuerpo, r.estado);
}

export const TOKEN_INVALIDO = { estado: 401, cuerpo: { codigo: 'TOKEN_INVALIDO' }, wwwAuthenticate: 'Bearer error="invalid_token"' } as const;

/** 401 step-up de TR-RF-017, el mismo para `@RequiereMfa` y para un `@Permiso` sensible. */
export function rechazoMfa(principal: Principal, maxEdadSeg: number): Rechazo {
  const e = new MfaRequeridaError(maxEdadSeg);
  return {
    estado: 401,
    cuerpo: { codigo: e.code, max_edad: maxEdadSeg },
    // RFC 9470 (step-up authentication challenge).
    wwwAuthenticate: `Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=${maxEdadSeg}`,
    motivo: principal.aal === 'aal2' ? 'mfa_vencido' : 'aal1',
    usuarioId: principal.usuarioId,
  };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cabecera como texto: repetida llega como arreglo y se trata como inválida. */
export function cabecera(req: { headers: Record<string, string | string[] | undefined> }, nombre: string): string | undefined {
  const valor = req.headers[nombre];
  return Array.isArray(valor) ? '' : valor;
}
