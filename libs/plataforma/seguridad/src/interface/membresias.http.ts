import { Catch, HttpException, Inject, Injectable, type ArgumentsHost, type CanActivate, type ExceptionFilter, type ExecutionContext } from '@nestjs/common';
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { z } from 'zod';
import { IdentidadNoDisponibleError, InvitacionExpiradaError, MfaRequeridaError } from '../domain/errores.js';
import { UUID } from './respuestas.js';

interface Respuesta {
  status(code: number): { json(body: unknown): unknown };
  setHeader(nombre: string, valor: string): void;
}

const ESTADOS: ReadonlyArray<readonly [abstract new (...args: never[]) => DomainError, number]> = [
  [InvitacionExpiradaError, 410],
  [IdentidadNoDisponibleError, 503],
  [ValidationError, 400],
  [NotFoundError, 404],
  [ConflictError, 409],
  [ForbiddenError, 403],
];

/**
 * Errores de dominio de las rutas de membresías como `{ codigo, mensaje }`, igual que los guards
 * de seg (decisión del spec 08). Lo que no es de dominio sigue al filtro global.
 */
@Catch(DomainError)
export class MembresiasFiltro implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Respuesta>();
    if (error instanceof MfaRequeridaError) {
      // Mismo step-up que PermisoGuard (RFC 9470): invitar con un rol sensible.
      res.setHeader('WWW-Authenticate', `Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=${error.maxEdadSeg}`);
      res.status(401).json({ codigo: error.code, max_edad: error.maxEdadSeg });
      return;
    }
    const estado = ESTADOS.find(([tipo]) => error instanceof tipo)?.[1] ?? 500;
    res.status(estado).json({ codigo: error.code, mensaje: error.message });
  }
}

/** 400 con las rutas de los campos inválidos; nunca los valores (pueden traer el correo). */
export function validar<T>(esquema: z.ZodType<T>, valor: unknown): T {
  const r = esquema.safeParse(valor);
  if (!r.success) {
    throw new HttpException({ codigo: 'SOLICITUD_INVALIDA', errores: [...new Set(r.error.issues.map((i) => i.path.join('.') || '(cuerpo)'))] }, 400);
  }
  return r.data;
}

/** Un id que no es UUID no puede existir en el tenant: mismo 404 que uno de otro tenant. */
export function exigirUuid(id: string, recurso: string): string {
  if (!UUID.test(id)) throw new HttpException({ codigo: 'NO_ENCONTRADO', mensaje: `${recurso} no existe` }, 404);
  return id;
}

export const LIMITE_TASA = Symbol('LIMITE_TASA');

export interface OpcionesLimiteTasa {
  /** Peticiones por ventana, por IP y por ruta. */
  limite: number;
  ventanaMs: number;
}

interface Ventana {
  inicio: number;
  usadas: number;
}

/**
 * TR-RNF-015 en las rutas de aceptar invitación: ventana fija en memoria, por IP y por ruta.
 * Propio y no @nestjs/throttler: ese paquete es CommonJS y Jest no lo carga junto a NestJS 12
 * (ESM). Vale para una instancia; con varias, el contador pasa a Redis (spec 21).
 */
@Injectable()
export class LimiteTasaGuard implements CanActivate {
  private readonly ventanas = new Map<string, Ventana>();

  constructor(@Inject(LIMITE_TASA) private readonly op: OpcionesLimiteTasa) {}

  canActivate(ctx: ExecutionContext): boolean {
    const http = ctx.switchToHttp();
    const req = http.getRequest<{ ip?: string; method: string; route?: { path?: string } }>();
    // La ruta como patrón (/:token), nunca la URL: el token no entra en la clave.
    const clave = `${req.ip ?? '-'} ${req.method} ${req.route?.path ?? ''}`;
    const ahora = Date.now();
    if (this.ventanas.size > 10_000) this.purgar(ahora);

    let v = this.ventanas.get(clave);
    if (!v || ahora - v.inicio >= this.op.ventanaMs) {
      v = { inicio: ahora, usadas: 0 };
      this.ventanas.set(clave, v);
    }
    v.usadas++;
    if (v.usadas <= this.op.limite) return true;

    const segundos = Math.max(1, Math.ceil((v.inicio + this.op.ventanaMs - ahora) / 1000));
    http.getResponse<{ setHeader(n: string, v: string): void }>().setHeader('Retry-After', String(segundos));
    throw new HttpException({ codigo: 'DEMASIADAS_SOLICITUDES' }, 429);
  }

  private purgar(ahora: number): void {
    for (const [clave, v] of this.ventanas) if (ahora - v.inicio >= this.op.ventanaMs) this.ventanas.delete(clave);
  }
}
