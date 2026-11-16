import type { DatosDni, DatosRuc } from '../../domain/datos-identidad.js';
import type { ProveedorIdentidad } from '../../application/ports/proveedores.js';

export const CODIGO_DECOLECTA = 'DECOLECTA';
export const URL_BASE_DECOLECTA = 'https://api.decolecta.com';
const RUTA_DNI = '/v1/reniec/dni';
const RUTA_RUC = '/v1/sunat/ruc';
const ESTADO_OK = 200;
// 404 no está documentado; 422 es «ruc no valido». Los dos son «no existe», no una caída.
const ESTADOS_NO_ENCONTRADO = [404, 422];

const CAMPOS_DNI = ['first_name', 'first_last_name', 'second_last_name'] as const;
const CAMPOS_RUC = ['razon_social', 'estado', 'condicion', 'direccion', 'ubigeo'] as const;

/** Respuesta de /v1/reniec/dni. Solo los campos que se leen. */
type CuerpoDni = Record<(typeof CAMPOS_DNI)[number], string>;

/** Respuesta de /v1/sunat/ruc. Solo los campos que se leen. */
type CuerpoRuc = Record<(typeof CAMPOS_RUC)[number], string>;

export class RespuestaDecolectaError extends Error {
  constructor(readonly estadoHttp: number) {
    super(`Decolecta respondió ${estadoHttp}`);
  }
}

export class CuerpoDecolectaInvalidoError extends Error {
  constructor() {
    super('La respuesta de Decolecta no trae los campos esperados');
  }
}

export interface OpcionesDecolecta {
  token: string;
  urlBase?: string;
  /** Inyectable para las pruebas sobre respuestas grabadas. */
  fetch?: typeof fetch;
}

function tieneTextos<T extends string>(cuerpo: unknown, campos: readonly T[]): cuerpo is Record<T, string> {
  if (typeof cuerpo !== 'object' || cuerpo === null) return false;
  return campos.every((campo) => typeof (cuerpo as Record<string, unknown>)[campo] === 'string');
}

// Decolecta devuelve textos con espacios sobrantes (p. ej. "CAL. MORELLI NRO 181 INT. P-2 ").
function unirSinVacios(...partes: string[]): string {
  return partes
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '')
    .join(' ');
}

function mapearDni(cuerpo: CuerpoDni): DatosDni {
  return {
    nombres: cuerpo.first_name.trim(),
    apellidos: unirSinVacios(cuerpo.first_last_name, cuerpo.second_last_name),
  };
}

function mapearRuc(cuerpo: CuerpoRuc): DatosRuc {
  return {
    razonSocial: cuerpo.razon_social.trim(),
    estado: cuerpo.estado.trim(),
    condicion: cuerpo.condicion.trim(),
    direccionFiscal: cuerpo.direccion.trim(),
    ubigeo: cuerpo.ubigeo.trim(),
  };
}

/**
 * Decolecta (RENIEC y SUNAT). Ningún campo fuera de los mapeados sale del adaptador. 401, 403, 429, 5xx
 * y los errores de red se lanzan para que el respaldo pruebe el siguiente proveedor.
 */
export class ProveedorDecolecta implements ProveedorIdentidad {
  readonly codigo = CODIGO_DECOLECTA;
  private readonly token: string;
  private readonly urlBase: string;
  private readonly fetch: typeof fetch;

  constructor({ token, urlBase = URL_BASE_DECOLECTA, fetch: fetchInyectado = globalThis.fetch }: OpcionesDecolecta) {
    this.token = token;
    this.urlBase = urlBase;
    this.fetch = fetchInyectado;
  }

  async consultarDni(numero: string, señal: AbortSignal): Promise<DatosDni | null> {
    const cuerpo = await this.obtener(RUTA_DNI, numero, señal);
    if (cuerpo === null) return null;
    if (!tieneTextos(cuerpo, CAMPOS_DNI)) throw new CuerpoDecolectaInvalidoError();
    return mapearDni(cuerpo);
  }

  async consultarRuc(numero: string, señal: AbortSignal): Promise<DatosRuc | null> {
    const cuerpo = await this.obtener(RUTA_RUC, numero, señal);
    if (cuerpo === null) return null;
    if (!tieneTextos(cuerpo, CAMPOS_RUC)) throw new CuerpoDecolectaInvalidoError();
    return mapearRuc(cuerpo);
  }

  /** null si el documento no existe. */
  private async obtener(ruta: string, numero: string, señal: AbortSignal): Promise<unknown> {
    const url = new URL(ruta, this.urlBase);
    url.searchParams.set('numero', numero);
    const respuesta = await this.fetch(url, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
      signal: señal,
    });
    if (ESTADOS_NO_ENCONTRADO.includes(respuesta.status)) return null;
    if (respuesta.status !== ESTADO_OK) throw new RespuestaDecolectaError(respuesta.status);
    return respuesta.json();
  }
}
