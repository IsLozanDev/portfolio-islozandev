import type { DatosRuc } from './datos-identidad.js';

const ESTADO_ACTIVO = 'ACTIVO';
const CONDICION_HABIDO = 'HABIDO';

export type AptitudFactura = { apto: true } | { apto: false; motivo: string };

/** TR-RN-019, TR-CA-118 y TR-CA-119: solo un RUC ACTIVO y HABIDO recibe factura. */
export function evaluarAptoFactura(datos: DatosRuc): AptitudFactura {
  if (datos.estado !== ESTADO_ACTIVO) return { apto: false, motivo: `Estado ${datos.estado}` };
  if (datos.condicion !== CONDICION_HABIDO) return { apto: false, motivo: `Condición ${datos.condicion}` };
  return { apto: true };
}
