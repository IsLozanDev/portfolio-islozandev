import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

const SEPARADOR_ORIGENES = ',';
const ENCABEZADOS_PERMITIDOS = ['Authorization', 'Content-Type', 'X-Sucursal-Id'];
const METODOS_PERMITIDOS = ['GET', 'POST', 'PUT', 'DELETE'];

/**
 * `ORIGENES_PERMITIDOS`: orígenes exactos separados por coma (U-06). Vacío o ausente: sin CORS, como con el proxy `/v1`.
 * Sin credenciales: el token viaja en `Authorization`, no en una cookie.
 */
export function opcionesCors(valor: string | undefined): CorsOptions | null {
  const origenes = (valor ?? '')
    .split(SEPARADOR_ORIGENES)
    .map((entrada) => entrada.trim())
    .filter((entrada) => entrada.length > 0);
  if (origenes.length === 0) return null;

  origenes.forEach(exigirOrigenExacto);
  return { origin: origenes, methods: METODOS_PERMITIDOS, allowedHeaders: ENCABEZADOS_PERMITIDOS, credentials: false };
}

function exigirOrigenExacto(entrada: string): void {
  if (origenDe(entrada) !== entrada) throw new Error(`ORIGENES_PERMITIDOS: «${entrada}» no es un origen (esquema://host[:puerto], sin ruta ni barra final)`);
}

function origenDe(entrada: string): string | null {
  try {
    return new URL(entrada).origin;
  } catch {
    return null;
  }
}
