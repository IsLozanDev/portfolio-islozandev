export interface Proveedor {
  codigo: string;
  tiposDoc: string[];
  prioridad: number;
  ttlDias: number;
  timeoutMs: number;
  activo: boolean;
  version: number;
}

export type CambiosProveedor = Partial<Pick<Proveedor, 'prioridad' | 'ttlDias' | 'timeoutMs' | 'activo'>> & { version: number };

/** Copia de `RANGOS_PROVEEDOR` de `identidad` para validar el formulario; el back sigue siendo la barrera. */
export const RANGOS_PROVEEDOR = {
  prioridad: { minimo: 1 },
  ttlDias: { minimo: 1, maximo: 365 },
  timeoutMs: { minimo: 100, maximo: 10_000 },
} as const;

/** Sin credenciales: la API no las devuelve (regla 9). */
export interface ProveedorRespuesta {
  codigo: string;
  tipos_doc: string[];
  prioridad: number;
  ttl_dias: number;
  timeout_ms: number;
  activo: boolean;
  version: number;
}

export interface CuerpoCambiosProveedor {
  prioridad?: number;
  ttl_dias?: number;
  timeout_ms?: number;
  activo?: boolean;
  version: number;
}

export function aProveedor(respuesta: ProveedorRespuesta): Proveedor {
  return {
    codigo: respuesta.codigo,
    tiposDoc: [...respuesta.tipos_doc],
    prioridad: respuesta.prioridad,
    ttlDias: respuesta.ttl_dias,
    timeoutMs: respuesta.timeout_ms,
    activo: respuesta.activo,
    version: respuesta.version,
  };
}

/** Body del `PATCH`: solo los campos presentes, para que el evento refleje lo que tocó el operador. */
export function aCuerpoCambiosProveedor(cambios: CambiosProveedor): CuerpoCambiosProveedor {
  const cuerpo: CuerpoCambiosProveedor = { version: cambios.version };
  if (cambios.prioridad !== undefined) cuerpo.prioridad = cambios.prioridad;
  if (cambios.ttlDias !== undefined) cuerpo.ttl_dias = cambios.ttlDias;
  if (cambios.timeoutMs !== undefined) cuerpo.timeout_ms = cambios.timeoutMs;
  if (cambios.activo !== undefined) cuerpo.activo = cambios.activo;
  return cuerpo;
}
