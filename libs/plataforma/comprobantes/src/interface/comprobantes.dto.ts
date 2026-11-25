import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ComprobanteEmitido } from '../application/ports/comprobante.port.js';
import type { VistaComprobante } from '../application/vista-comprobante.js';
import { ESTADOS_COMPROBANTE, FORMAS_PAGO, MODOS_ENVIO, MONEDAS, TIPOS_COMPROBANTE } from '../domain/comprobante/tipo-comprobante.js';
import { REGIMENES_IGV } from '../domain/regimen-igv.js';

const MONTO = { type: String, pattern: '^\\d{1,12}(\\.\\d{1,2})?$' } as const;
const UNITARIO = { type: String, pattern: '^\\d{1,10}(\\.\\d{1,4})?$' } as const;

class CuotaDto {
  @ApiProperty({ ...MONTO, example: '59.00' })
  monto!: string;

  @ApiProperty({ format: 'date', example: '2026-12-24', description: 'Posterior a la fecha de emisión' })
  fecha_vencimiento!: string;
}

class AdquirenteDto {
  @ApiProperty({ example: 'RUC', maxLength: 10, description: 'Código interno de TIPO_DOC_IDENTIDAD: RUC, DNI, CE, PASAPORTE, DOC_0…' })
  tipo_documento!: string;

  @ApiProperty({ example: '20512345671', maxLength: 15 })
  numero!: string;

  @ApiProperty({ example: 'CLIENTE EJEMPLO SAC', maxLength: 200 })
  nombre!: string;

  @ApiPropertyOptional({ format: 'email', maxLength: 254 })
  correo?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Persona de TR-PER; no se valida en este spec' })
  persona_id?: string;
}

class LineaDto {
  @ApiPropertyOptional({ maxLength: 30, example: 'SKU-001' })
  codigo?: string;

  @ApiProperty({ maxLength: 500, example: 'Menú ejecutivo' })
  descripcion!: string;

  @ApiProperty({ maxLength: 3, example: 'NIU', description: 'UNIDAD_MEDIDA (cat. 03)' })
  unidad!: string;

  @ApiProperty({ ...UNITARIO, example: '2', description: 'Mayor que cero' })
  cantidad!: string;

  @ApiProperty({ ...UNITARIO, example: '30.00', description: 'Sin IGV' })
  valor_unitario!: string;

  @ApiProperty({ example: '10', description: 'AFECTACION_IGV (cat. 07): 10 gravado, 20 exonerado, 30 inafecto (operaciones onerosas)' })
  afectacion_igv!: string;
}

class OrigenDto {
  @ApiProperty({ maxLength: 10, example: 'SAZON' })
  producto!: string;

  @ApiProperty({ maxLength: 100, example: 'venta-8812' })
  id!: string;
}

export class EmitirComprobanteDto {
  @ApiProperty({ enum: TIPOS_COMPROBANTE, example: 'FACTURA' })
  tipo!: string;

  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiProperty({ format: 'uuid' })
  sucursal_id!: string;

  @ApiPropertyOptional({ example: 'F001', description: 'Sin serie, la única activa del tipo en la sucursal; si hay varias, 422 SERIE_AMBIGUA' })
  serie?: string;

  @ApiProperty({ enum: MONEDAS, example: 'PEN' })
  moneda!: string;

  @ApiProperty({ enum: FORMAS_PAGO, example: 'CONTADO' })
  forma_pago!: string;

  @ApiPropertyOptional({ type: [CuotaDto], description: 'Obligatorias al crédito; deben sumar el total' })
  cuotas?: CuotaDto[];

  @ApiPropertyOptional({ type: AdquirenteDto, description: 'Obligatorio en factura (RUC). Sin él, la boleta va a CLIENTES VARIOS hasta el umbral' })
  adquirente?: AdquirenteDto;

  @ApiProperty({ type: [LineaDto], minItems: 1 })
  lineas!: LineaDto[];

  @ApiPropertyOptional({ ...MONTO, example: '118.00', description: 'Si difiere del calculado en más de S/ 0,01, 422 TOTAL_NO_COINCIDE' })
  total_esperado?: string;

  @ApiPropertyOptional({ enum: MODOS_ENVIO, default: 'INDIVIDUAL' })
  modo_envio?: string;

  @ApiPropertyOptional({ type: OrigenDto })
  origen?: OrigenDto;
}

class TotalesDto {
  @ApiProperty({ example: '100.00' })
  gravado!: string;

  @ApiProperty({ example: '0.00' })
  exonerado!: string;

  @ApiProperty({ example: '0.00' })
  inafecto!: string;

  @ApiProperty({ example: '18.00' })
  igv!: string;

  @ApiProperty({ example: '118.00' })
  total!: string;
}

class AdvertenciaDto {
  @ApiProperty({ example: 'RUC_NO_HABIDO', enum: ['RUC_NO_ACTIVO', 'RUC_NO_HABIDO'] })
  codigo!: string;

  @ApiProperty({ example: 'El RUC del adquirente tiene condición NO HABIDO' })
  mensaje!: string;
}

class ComprobanteBaseDto {
  @ApiProperty({ format: 'uuid' })
  comprobante_id!: string;

  @ApiProperty({ example: 'F001' })
  serie!: string;

  @ApiProperty({ example: 100 })
  numero!: number;

  @ApiProperty({ example: 'F001-00000100' })
  numero_formateado!: string;

  @ApiProperty({ enum: ESTADOS_COMPROBANTE, example: 'PENDIENTE_ENVIO' })
  estado!: string;

  @ApiProperty({ type: TotalesDto })
  totales!: TotalesDto;

  @ApiProperty({ type: [AdvertenciaDto], description: 'TR-RN-019: el RUC no ACTIVO o NO HABIDO no impide emitir' })
  advertencias!: AdvertenciaDto[];
}

export class ComprobanteEmitidoDto extends ComprobanteBaseDto {
  @ApiProperty({ description: 'true si la Idempotency-Key ya se había usado con el mismo contenido (HTTP 200)' })
  repetido!: boolean;
}

class LineaDetalleDto extends LineaDto {
  @ApiProperty({ example: 1 })
  orden!: number;

  @ApiProperty({ example: '60.00' })
  valor_venta!: string;

  @ApiProperty({ example: '10.80' })
  igv!: string;

  @ApiProperty({ example: '35.4000', description: 'Con IGV' })
  precio_unitario!: string;
}

class CuotaDetalleDto extends CuotaDto {
  @ApiProperty({ example: 1 })
  numero!: number;
}

export class ComprobanteDetalleDto extends ComprobanteBaseDto {
  @ApiProperty({ enum: TIPOS_COMPROBANTE })
  tipo!: string;

  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiProperty({ format: 'uuid' })
  sucursal_id!: string;

  @ApiProperty({ format: 'date' })
  fecha_emision!: string;

  @ApiProperty({ enum: MONEDAS })
  moneda!: string;

  @ApiProperty({ enum: FORMAS_PAGO })
  forma_pago!: string;

  @ApiProperty({ type: AdquirenteDto })
  adquirente!: AdquirenteDto;

  @ApiProperty({ enum: REGIMENES_IGV })
  regimen_igv!: string;

  @ApiProperty({ example: '0.1800', description: 'IGV + IPM aplicada, del catálogo TASA_IGV' })
  tasa_igv!: string;

  @ApiProperty({ enum: MODOS_ENVIO })
  modo_envio!: string;

  @ApiProperty({ type: OrigenDto, nullable: true })
  origen!: OrigenDto | null;

  @ApiProperty({ type: [LineaDetalleDto] })
  lineas!: LineaDetalleDto[];

  @ApiProperty({ type: [CuotaDetalleDto] })
  cuotas!: CuotaDetalleDto[];

  @ApiProperty({ format: 'date-time' })
  creado_en!: string;
}

export function comprobanteEmitidoDto(emitido: ComprobanteEmitido): ComprobanteEmitidoDto {
  return {
    comprobante_id: emitido.comprobanteId,
    serie: emitido.serie,
    numero: emitido.numero,
    numero_formateado: emitido.numeroFormateado,
    estado: emitido.estado,
    totales: { ...emitido.totales },
    advertencias: emitido.advertencias.map((advertencia) => ({ ...advertencia })),
    repetido: emitido.repetido,
  };
}

export function comprobanteDetalleDto(vista: VistaComprobante): ComprobanteDetalleDto {
  const { adquirente } = vista;
  return {
    comprobante_id: vista.comprobanteId,
    tipo: vista.tipo,
    empresa_id: vista.empresaId,
    sucursal_id: vista.sucursalId,
    serie: vista.serie,
    numero: vista.numero,
    numero_formateado: vista.numeroFormateado,
    fecha_emision: vista.fechaEmision,
    moneda: vista.moneda,
    forma_pago: vista.formaPago,
    adquirente: {
      tipo_documento: adquirente.tipoDocumento,
      numero: adquirente.numero,
      nombre: adquirente.nombre,
      ...(adquirente.correo !== null && { correo: adquirente.correo }),
      ...(adquirente.personaId !== null && { persona_id: adquirente.personaId }),
    },
    regimen_igv: vista.regimenIgv,
    tasa_igv: vista.tasaIgv,
    totales: { ...vista.totales },
    modo_envio: vista.modoEnvio,
    estado: vista.estado,
    advertencias: vista.advertencias.map((advertencia) => ({ ...advertencia })),
    origen: vista.origen && { ...vista.origen },
    lineas: vista.lineas.map((linea) => ({
      orden: linea.orden,
      ...(linea.codigo !== null && { codigo: linea.codigo }),
      descripcion: linea.descripcion,
      unidad: linea.unidad,
      cantidad: linea.cantidad,
      valor_unitario: linea.valorUnitario,
      afectacion_igv: linea.afectacionIgv,
      valor_venta: linea.valorVenta,
      igv: linea.igv,
      precio_unitario: linea.precioUnitario,
    })),
    cuotas: vista.cuotas.map((cuota) => ({ numero: cuota.numero, monto: cuota.monto, fecha_vencimiento: cuota.fechaVencimiento })),
    creado_en: vista.creadoEn.toISOString(),
  };
}
