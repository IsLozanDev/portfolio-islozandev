import { HttpException, Logger, type ExecutionContext } from '@nestjs/common';

interface Solicitud {
  method: string;
  path: string;
}

interface Respuesta {
  setHeader(nombre: string, valor: string): void;
}

const logger = new Logger('Seguridad');

export interface Rechazo {
  estado: 401 | 503;
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
