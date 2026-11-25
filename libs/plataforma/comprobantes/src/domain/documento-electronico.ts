import { fechaCalendarioDe, type FechaCalendario } from '@vitrina/plataforma/org';
import { monto } from './comprobante/dinero.js';
import { CODIGO_SUNAT_POR_TIPO, type CodigoTipoComprobante, type FormaPago, type Moneda } from './comprobante/tipo-comprobante.js';
import { horaEnLima } from './hora-lima.js';
import { montoEnLetras } from './monto-en-letras.js';

export type TipoDocumentoElectronico = CodigoTipoComprobante;

/** Cat. 51: venta interna. */
export const TIPO_OPERACION_VENTA_INTERNA = '0101';
/** Anexo SUNAT del domicilio fiscal. */
export const CODIGO_ESTABLECIMIENTO_DOMICILIO_FISCAL = '0000';
/** Cat. 06: documento 0 (sin RUC), el de «Clientes varios». */
export const TIPO_DOCUMENTO_SUNAT_SIN_DOCUMENTO = '0';

export interface EmisorDocumento {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  domicilioFiscal: string;
  /** 6 dígitos. */
  ubigeo: string;
  /** Anexo SUNAT de la sucursal; «0000» el domicilio fiscal. */
  codigoEstablecimiento: string;
}

/** `tipoDocumento` es el código SUNAT del cat. 06, no el interno de TR-CAT. */
export interface AdquirenteDocumento {
  tipoDocumento: string;
  numero: string;
  nombre: string;
}

export interface LineaDocumento {
  orden: number;
  codigo: string | null;
  descripcion: string;
  /** Cat. 03. */
  unidad: string;
  /** Escala 4. */
  cantidad: string;
  /** Sin IGV, escala 4. */
  valorUnitario: string;
  /** Con IGV, escala 4. */
  precioUnitario: string;
  /** Cat. 07. */
  afectacionIgv: string;
  /** Escala 2. */
  valorVenta: string;
  /** Escala 2. */
  igv: string;
}

export interface CuotaDocumento {
  numero: number;
  monto: string;
  fechaVencimiento: FechaCalendario;
}

export interface TotalesDocumento {
  gravado: string;
  exonerado: string;
  inafecto: string;
  igv: string;
  total: string;
}

/** Factura o boleta lista para UBL o para un PSE. Montos como texto decimal: el UBL exige el importe exacto. */
export interface DocumentoElectronico {
  tipo: TipoDocumentoElectronico;
  serie: string;
  numero: number;
  fechaEmision: FechaCalendario;
  /** `HH:mm:ss` en America/Lima. */
  horaEmision: string;
  tipoOperacion: typeof TIPO_OPERACION_VENTA_INTERNA;
  moneda: Moneda;
  emisor: EmisorDocumento;
  adquirente: AdquirenteDocumento;
  formaPago: FormaPago;
  cuotas: CuotaDocumento[];
  /** «0.1800». */
  tasaIgv: string;
  lineas: LineaDocumento[];
  totales: TotalesDocumento;
  montoEnLetras: string;
}

const MONEDA_PRUEBA: Moneda = 'PEN';
const TASA_IGV_PRUEBA = '0.1800';
const TOTAL_PRUEBA = '1.00';
/** S/ 1.00 con IGV del 18 % incluido: valor de venta 0.85 e IGV 0.15, que suman el total exacto. */
const VALOR_VENTA_PRUEBA = '0.85';
const IGV_PRUEBA = '0.15';
const CERO = '0.00';
const CANTIDAD_PRUEBA = '1.0000';
const VALOR_UNITARIO_PRUEBA = '0.8500';
const PRECIO_UNITARIO_PRUEBA = '1.0000';
const UNIDAD_SERVICIO = 'ZZ';
const AFECTACION_GRAVADO_ONEROSO = '10';
const DESCRIPCION_PRUEBA = 'PRUEBA DE CONEXION CON EL PSE';
const ADQUIRENTE_CLIENTES_VARIOS: AdquirenteDocumento = { tipoDocumento: TIPO_DOCUMENTO_SUNAT_SIN_DOCUMENTO, numero: '0', nombre: 'CLIENTES VARIOS' };

/** Boleta de S/ 1.00 a «Clientes varios», gravada, para la prueba en beta del emisor (spec 50). */
export function boletaDePrueba(emisor: EmisorDocumento, serie: string, numero: number, instante: Date): DocumentoElectronico {
  return {
    tipo: CODIGO_SUNAT_POR_TIPO.BOLETA,
    serie,
    numero,
    fechaEmision: fechaCalendarioDe(instante),
    horaEmision: horaEnLima(instante),
    tipoOperacion: TIPO_OPERACION_VENTA_INTERNA,
    moneda: MONEDA_PRUEBA,
    emisor,
    adquirente: ADQUIRENTE_CLIENTES_VARIOS,
    formaPago: 'CONTADO',
    cuotas: [],
    tasaIgv: TASA_IGV_PRUEBA,
    lineas: [
      {
        orden: 1,
        codigo: null,
        descripcion: DESCRIPCION_PRUEBA,
        unidad: UNIDAD_SERVICIO,
        cantidad: CANTIDAD_PRUEBA,
        valorUnitario: VALOR_UNITARIO_PRUEBA,
        precioUnitario: PRECIO_UNITARIO_PRUEBA,
        afectacionIgv: AFECTACION_GRAVADO_ONEROSO,
        valorVenta: VALOR_VENTA_PRUEBA,
        igv: IGV_PRUEBA,
      },
    ],
    totales: { gravado: VALOR_VENTA_PRUEBA, exonerado: CERO, inafecto: CERO, igv: IGV_PRUEBA, total: TOTAL_PRUEBA },
    montoEnLetras: montoEnLetras(monto(TOTAL_PRUEBA, 'total'), MONEDA_PRUEBA),
  };
}
