export const TAMANO_MAXIMO_JSON_BYTES = 64 * 1024;

export interface ContenidoTruncado {
  _truncado: true;
  bytes: number;
}

/** Un JSON de más de 64 KB se guarda como `{ _truncado, bytes }`: la auditoría no carga documentos enteros. */
export function limitarTamano(valor: unknown): unknown {
  const json = JSON.stringify(valor);
  if (json === undefined) return valor;
  const bytes = new TextEncoder().encode(json).length;
  return bytes > TAMANO_MAXIMO_JSON_BYTES ? ({ _truncado: true, bytes } satisfies ContenidoTruncado) : valor;
}
