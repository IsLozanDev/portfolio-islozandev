import { Comprobante, prepararEmision, type DatosEmision } from '../../src/domain/comprobante/comprobante.js';
import { Decimal, ESCALA_TASA, ESCALA_UNITARIO, monto } from '../../src/domain/comprobante/dinero.js';
import type { EntradaLinea, GrupoAfectacion } from '../../src/domain/comprobante/linea-comprobante.js';
import type { DatosEmisor } from '../../src/domain/emisor-documento.js';

/** TR-CA-136: F001 en 99, factura a RUC con dos líneas de S/ 100,00 de valor de venta. */
export const RUC_ADQUIRENTE = '20512345671';
export const FECHA = '2026-11-24';
export const EMPRESA: DatosEmisor = {
  ruc: '20601234561',
  razonSocial: 'RESTAURANTE EL SAZON SAC',
  nombreComercial: 'EL SAZON',
  domicilioFiscal: 'AV. LARCO 123, MIRAFLORES',
  ubigeo: '150122',
};
export const ESTABLECIMIENTO = '0001';
const AFECTACION_POR_GRUPO: Record<GrupoAfectacion, string> = { GRAVADO: '10', EXONERADO: '20', INAFECTO: '30' };

export function linea(cantidad: string, valorUnitario: string, grupo: GrupoAfectacion = 'GRAVADO'): EntradaLinea {
  return {
    codigo: 'P-1',
    descripcion: 'Lomo saltado',
    unidad: 'NIU',
    cantidad: Decimal.desdeTexto(cantidad, ESCALA_UNITARIO, 'cantidad'),
    valorUnitario: Decimal.desdeTexto(valorUnitario, ESCALA_UNITARIO, 'valorUnitario'),
    afectacionIgv: AFECTACION_POR_GRUPO[grupo],
    grupo,
  };
}

export function comprobante(cambios: Partial<DatosEmision> = {}, numero = 100): Comprobante {
  const datos: DatosEmision = {
    id: '0193f3a0-0000-7000-8000-0000000000c1',
    tenantId: 't',
    empresaId: 'e',
    sucursalId: 's',
    emisorId: 'em',
    tipo: 'FACTURA',
    serie: 'F001',
    fechaEmision: FECHA,
    moneda: 'PEN',
    formaPago: 'CONTADO',
    cuotas: [],
    adquirente: { tipoDocumento: 'RUC', numero: RUC_ADQUIRENTE, nombre: 'CLIENTE SAC', correo: null, personaId: null },
    lineas: [linea('1', '60'), linea('4', '10')],
    totalEsperado: null,
    modoEnvio: 'INDIVIDUAL',
    origen: null,
    claveIdempotencia: 'clave',
    huellaSolicitud: 'a'.repeat(64),
    advertencias: [],
    regimenIgv: 'GENERAL',
    tasaIgv: Decimal.desdeTexto('0.18', ESCALA_TASA, 'tasa'),
    umbralBoleta: monto('700', 'umbral'),
    creadoPor: null,
    creadoEn: new Date(`${FECHA}T15:04:05Z`),
    ...cambios,
  };
  return Comprobante.emitir(prepararEmision(datos), numero);
}
