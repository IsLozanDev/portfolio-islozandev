import { LIMITE_PROVEEDOR, type ProveedorIngreso, type ResultadoIngreso, type SesionEmitida } from '../../application/ports/proveedor-ingreso.port.js';
import { ProveedorIngresoNoDisponibleError } from '../../domain/errores.js';
import type { EtapaIngreso, MotivoFalloIngreso } from '../../domain/intentos-ingreso.js';

const TIEMPO_MAXIMO_POR_DEFECTO_MS = 5_000;
const ESPERA_LIMITE_POR_DEFECTO_SEG = 60;
const HTTP_DEMASIADAS_PETICIONES = 429;
const HTTP_ERROR_SERVIDOR = 500;

/** `error_code` de GoTrue (apierrors/errorcode.go) que el spec 18b distingue. */
const MOTIVO_POR_CODIGO: Readonly<Record<string, MotivoFalloIngreso>> = {
  invalid_credentials: 'CREDENCIALES',
  user_not_found: 'CREDENCIALES',
  email_not_confirmed: 'CORREO_NO_CONFIRMADO',
  user_banned: 'USUARIO_SUSPENDIDO',
  mfa_verification_failed: 'CODIGO_MFA',
  mfa_challenge_expired: 'CODIGO_MFA',
  mfa_verification_rejected: 'CODIGO_MFA',
  mfa_factor_not_found: 'CODIGO_MFA',
};

/** Un 4xx que no está en la tabla cuenta como intento fallido de la etapa: nunca abre el paso. */
const MOTIVO_DESCONOCIDO: Readonly<Record<EtapaIngreso, MotivoFalloIngreso>> = { CLAVE: 'CREDENCIALES', MFA: 'CODIGO_MFA' };

interface RespuestaToken {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string };
}

interface RespuestaError {
  error_code?: string;
  code?: string | number;
}

type Respuesta = { ok: true; cuerpo: unknown } | { ok: false; resultado: ResultadoIngreso };

export interface OpcionesProveedorIngreso {
  tiempoMaximoMs?: number;
  fetchHttp?: typeof fetch;
}

/**
 * Supabase Auth por HTTP con la publishable key, como lo haría el navegador. `X-Forwarded-For` lleva la
 * IP del cliente para que los límites de GoTrue no se apliquen a la IP de la API (Riesgos del spec).
 */
export class ProveedorIngresoGotrue implements ProveedorIngreso {
  private readonly urlAuth: string;
  private readonly tiempoMaximoMs: number;
  private readonly fetchHttp: typeof fetch;

  constructor(
    supabaseUrl: string,
    private readonly publishableKey: string,
    opciones: OpcionesProveedorIngreso = {},
  ) {
    this.urlAuth = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
    this.tiempoMaximoMs = opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_POR_DEFECTO_MS;
    this.fetchHttp = opciones.fetchHttp ?? fetch;
  }

  async conClave(correo: string, clave: string, ip: string): Promise<ResultadoIngreso> {
    const respuesta = await this.enviar('/token?grant_type=password', { email: correo, password: clave }, ip, null, 'CLAVE');
    return respuesta.ok ? sesionDe(respuesta.cuerpo) : respuesta.resultado;
  }

  async verificarMfa(accessToken: string, factorId: string, codigo: string, ip: string): Promise<ResultadoIngreso> {
    const factor = encodeURIComponent(factorId);
    const desafio = await this.enviar(`/factors/${factor}/challenge`, {}, ip, accessToken, 'MFA');
    if (!desafio.ok) return desafio.resultado;
    const respuesta = await this.enviar(`/factors/${factor}/verify`, { challenge_id: idDesafio(desafio.cuerpo), code: codigo }, ip, accessToken, 'MFA');
    return respuesta.ok ? sesionDe(respuesta.cuerpo) : respuesta.resultado;
  }

  private async enviar(ruta: string, cuerpo: object, ip: string, accessToken: string | null, etapa: EtapaIngreso): Promise<Respuesta> {
    const respuesta = await this.llamar(ruta, cuerpo, ip, accessToken);
    if (respuesta.status === HTTP_DEMASIADAS_PETICIONES) return { ok: false, resultado: limiteDelProveedor(respuesta) };
    if (respuesta.status >= HTTP_ERROR_SERVIDOR) throw new ProveedorIngresoNoDisponibleError();
    const contenido = await leerJson(respuesta);
    if (respuesta.ok) return { ok: true, cuerpo: contenido };
    return { ok: false, resultado: { exito: false, motivo: motivoDe(contenido as RespuestaError, etapa) } };
  }

  private async llamar(ruta: string, cuerpo: object, ip: string, accessToken: string | null): Promise<Response> {
    const cabeceras: Record<string, string> = {
      apikey: this.publishableKey,
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
    };
    if (accessToken) cabeceras['Authorization'] = `Bearer ${accessToken}`;
    try {
      return await this.fetchHttp(this.urlAuth + ruta, {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(this.tiempoMaximoMs),
      });
    } catch {
      throw new ProveedorIngresoNoDisponibleError();
    }
  }
}

async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json();
  } catch {
    throw new ProveedorIngresoNoDisponibleError();
  }
}

function motivoDe(error: RespuestaError, etapa: EtapaIngreso): MotivoFalloIngreso {
  const codigo = error.error_code ?? (typeof error.code === 'string' ? error.code : undefined);
  return (codigo && MOTIVO_POR_CODIGO[codigo]) || MOTIVO_DESCONOCIDO[etapa];
}

function limiteDelProveedor(respuesta: Response): ResultadoIngreso {
  const segundos = Number(respuesta.headers.get('retry-after'));
  const reintentarEnSeg = Number.isInteger(segundos) && segundos > 0 ? segundos : ESPERA_LIMITE_POR_DEFECTO_SEG;
  return { exito: false, motivo: LIMITE_PROVEEDOR, reintentarEnSeg };
}

/** Un 200 sin tokens o sin usuario es una respuesta rota del proveedor, no un ingreso. */
function sesionDe(cuerpo: unknown): ResultadoIngreso {
  const token = cuerpo as RespuestaToken;
  if (!token.access_token || !token.refresh_token || !token.user?.id) throw new ProveedorIngresoNoDisponibleError();
  const sesion: SesionEmitida = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiraEn: token.expires_in ?? 0,
    tipoToken: 'bearer',
  };
  return { exito: true, sesion, usuarioId: token.user.id };
}

function idDesafio(cuerpo: unknown): string {
  const id = (cuerpo as { id?: unknown }).id;
  if (typeof id !== 'string') throw new ProveedorIngresoNoDisponibleError();
  return id;
}
