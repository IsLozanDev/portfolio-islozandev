import { validarRuc } from '@vitrina/shared/util';
import { CuotasInvalidasError, FacturaRequiereRucError } from '../errores.js';
import { TIPO_DOCUMENTO_RUC, type Adquirente } from './adquirente.js';
import { Decimal, ESCALA_MONTO } from './dinero.js';
import type { FormaPago } from './tipo-comprobante.js';

export interface Cuota {
  numero: number;
  monto: Decimal;
  /** `YYYY-MM-DD`. */
  fechaVencimiento: string;
}

export interface Advertencia {
  codigo: string;
  mensaje: string;
}

/** Lo que FE necesita del padrón SUNAT; `DatosPadron` de ORG lo cumple. */
export interface SituacionContribuyente {
  estado: string;
  condicion: string;
}

const ESTADO_ACTIVO = 'ACTIVO';
const CONDICION_NO_HABIDO = 'NO HABIDO';
export const ADVERTENCIAS_PADRON = { rucNoActivo: 'RUC_NO_ACTIVO', rucNoHabido: 'RUC_NO_HABIDO' } as const;

/** TR-CA-137: la factura exige un adquirente con RUC válido (prefijo y dígito verificador de SUNAT). */
export function exigirAdquirenteDeFactura(adquirente: Adquirente | null): Adquirente {
  if (!adquirente || adquirente.tipoDocumento !== TIPO_DOCUMENTO_RUC || !validarRuc(adquirente.numero)) {
    throw new FacturaRequiereRucError();
  }
  return adquirente;
}

/** Crédito: al menos una cuota, que sumen el total y venzan después de la emisión. Contado: sin cuotas. */
export function exigirCuotas(formaPago: FormaPago, cuotas: readonly Cuota[], total: Decimal, fechaEmision: string): void {
  if (formaPago === 'CONTADO') {
    if (cuotas.length > 0) throw new CuotasInvalidasError('Una venta al contado no lleva cuotas');
    return;
  }
  if (cuotas.length === 0) throw new CuotasInvalidasError('Una venta al crédito exige al menos una cuota');
  const suma = cuotas.reduce((acumulado, cuota) => acumulado.sumar(cuota.monto), Decimal.cero(ESCALA_MONTO));
  if (suma.compararCon(total) !== 0) {
    throw new CuotasInvalidasError(`Las cuotas suman ${suma.aTexto()} y el total es ${total.aTexto()}`);
  }
  if (cuotas.some((cuota) => cuota.fechaVencimiento <= fechaEmision)) {
    throw new CuotasInvalidasError('Cada cuota debe vencer después de la fecha de emisión');
  }
}

/** TR-RN-019: se emite igual; padrón sin datos o caído → sin advertencias. */
export function advertenciasDelPadron(situacion: SituacionContribuyente | null): Advertencia[] {
  if (situacion === null) return [];
  const advertencias: Advertencia[] = [];
  if (situacion.estado !== ESTADO_ACTIVO) {
    advertencias.push({ codigo: ADVERTENCIAS_PADRON.rucNoActivo, mensaje: `El RUC del adquirente está en estado ${situacion.estado}` });
  }
  if (situacion.condicion === CONDICION_NO_HABIDO) {
    advertencias.push({ codigo: ADVERTENCIAS_PADRON.rucNoHabido, mensaje: 'El RUC del adquirente tiene condición NO HABIDO' });
  }
  return advertencias;
}
