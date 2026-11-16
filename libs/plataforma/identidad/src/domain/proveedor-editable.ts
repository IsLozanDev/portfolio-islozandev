import type { TipoConsultable } from './datos-identidad.js';
import { UltimoProveedorActivoError } from './errores.js';

/** Fila de idn.proveedor tal como la edita el operador. */
export interface ProveedorEditable {
  codigo: string;
  tiposDoc: readonly TipoConsultable[];
  prioridad: number;
  ttlDias: number;
  timeoutMs: number;
  activo: boolean;
  version: number;
}

export interface CambiosProveedor {
  prioridad?: number;
  ttlDias?: number;
  timeoutMs?: number;
  activo?: boolean;
}

/** Rangos de los CHECK de idn.proveedor (prioridad smallint); el DTO los valida antes de llegar aquí. */
export const RANGOS_PROVEEDOR = {
  prioridad: { minimo: 1, maximo: 32_767 },
  ttlDias: { minimo: 1, maximo: 365 },
  timeoutMs: { minimo: 100, maximo: 10_000 },
} as const;

/** Aplica los cambios sin tocar la versión; `demas` son los otros proveedores. */
export function aplicarCambiosProveedor(
  proveedor: ProveedorEditable,
  cambios: CambiosProveedor,
  demas: readonly ProveedorEditable[],
): ProveedorEditable {
  const actualizado = { ...proveedor, ...sinIndefinidos(cambios) };
  if (proveedor.activo && !actualizado.activo) exigirRespaldoActivo(proveedor, demas);
  return actualizado;
}

function exigirRespaldoActivo(proveedor: ProveedorEditable, demas: readonly ProveedorEditable[]): void {
  const tipoSinRespaldo = proveedor.tiposDoc.find(
    (tipo) => !demas.some((otro) => otro.activo && otro.tiposDoc.includes(tipo)),
  );
  if (tipoSinRespaldo) throw new UltimoProveedorActivoError(tipoSinRespaldo);
}

function sinIndefinidos(cambios: CambiosProveedor): CambiosProveedor {
  return Object.fromEntries(Object.entries(cambios).filter(([, valor]) => valor !== undefined));
}
