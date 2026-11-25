import { createHash } from 'node:crypto';

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === 'object';
}

/** JSON con las claves ordenadas: el mismo contenido da el mismo texto sin importar el orden de las propiedades. */
function textoCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(textoCanonico).join(',')}]`;
  if (esObjeto(valor)) {
    const pares = Object.keys(valor)
      .sort()
      .map((clave) => `${JSON.stringify(clave)}:${textoCanonico(valor[clave])}`);
    return `{${pares.join(',')}}`;
  }
  return JSON.stringify(valor);
}

/**
 * SHA-256 (hex) de la solicitud ya normalizada (montos con su escala, opcionales en null, solo valores JSON):
 * distingue el reintento legítimo («misma clave, mismo contenido») del error del llamador («otro contenido»).
 */
export function huellaDeSolicitud(solicitudNormalizada: unknown): string {
  return createHash('sha256').update(textoCanonico(solicitudNormalizada)).digest('hex');
}
