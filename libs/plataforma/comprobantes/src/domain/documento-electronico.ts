import type { FechaCalendario } from '@vitrina/plataforma/org';

/** Catálogo 01 de SUNAT. El spec 51 suma la factura (01) y las notas. */
export const TIPO_BOLETA = '03';
export const MONEDA_SOLES = 'PEN';
/** Boleta a consumidor final sin documento (ventas menores). */
export const ADQUIRENTE_VARIOS = { tipoDocumento: '-', numero: '-', nombre: 'CLIENTES VARIOS' } as const;

export const TASA_IGV = 0.18;
const DECIMALES_MONTO = 2;
const TOTAL_PRUEBA = 1;
const CANTIDAD_PRUEBA = 1;
const DESCRIPCION_PRUEBA = 'PRUEBA DE CONEXION CON EL PSE';

export interface ItemDocumento {
  descripcion: string;
  cantidad: number;
  /** Sin IGV. */
  valorUnitario: number;
  igv: number;
  /** Con IGV. */
  total: number;
}

export interface TotalesDocumento {
  gravada: number;
  igv: number;
  total: number;
}

/** Comprobante de dominio mínimo (boleta) que el spec 51 amplía. Montos en soles con 2 decimales. */
export interface DocumentoElectronico {
  tipo: typeof TIPO_BOLETA;
  serie: string;
  numero: number;
  fechaEmision: FechaCalendario;
  emisorRuc: string;
  moneda: typeof MONEDA_SOLES;
  adquirente: typeof ADQUIRENTE_VARIOS;
  items: ItemDocumento[];
  totales: TotalesDocumento;
}

export function redondearMonto(monto: number): number {
  const factor = 10 ** DECIMALES_MONTO;
  return Math.round((monto + Number.EPSILON) * factor) / factor;
}

/** S/ 1.00 con IGV del 18 % incluido: IGV 0.15 y gravada 0.85, que suman el total exacto. */
export function boletaDePrueba(emisorRuc: string, serie: string, numero: number, fecha: FechaCalendario): DocumentoElectronico {
  const igv = redondearMonto(TOTAL_PRUEBA - TOTAL_PRUEBA / (1 + TASA_IGV));
  const gravada = redondearMonto(TOTAL_PRUEBA - igv);
  return {
    tipo: TIPO_BOLETA,
    serie,
    numero,
    fechaEmision: fecha,
    emisorRuc,
    moneda: MONEDA_SOLES,
    adquirente: ADQUIRENTE_VARIOS,
    items: [{ descripcion: DESCRIPCION_PRUEBA, cantidad: CANTIDAD_PRUEBA, valorUnitario: gravada, igv, total: TOTAL_PRUEBA }],
    totales: { gravada, igv, total: TOTAL_PRUEBA },
  };
}
