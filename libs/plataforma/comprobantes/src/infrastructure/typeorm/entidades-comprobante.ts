import { EntitySchema } from 'typeorm';

// Mapeo ORM de fe.comprobante y sus líneas y cuotas (01u_fe_comprobante). Sin synchronize. Los numeric viajan como
// texto (node-pg) y se pasan a Decimal en el mapeo: nunca por number.

export interface FilaComprobante {
  id: string;
  tenantId: string;
  empresaId: string;
  sucursalId: string;
  emisorId: string;
  tipo: string;
  serie: string;
  /** bigint: node-pg lo devuelve como string. */
  numero: string;
  /** `date`: texto `YYYY-MM-DD`. */
  fechaEmision: string;
  moneda: string;
  formaPago: string;
  adquirenteTipoDoc: string;
  adquirenteNumero: string;
  adquirenteNombre: string;
  adquirenteCorreo: string | null;
  adquirentePersonaId: string | null;
  regimenIgv: string;
  tasaIgv: string;
  totalGravado: string;
  totalExonerado: string;
  totalInafecto: string;
  igv: string;
  total: string;
  modoEnvio: string;
  estado: string;
  advertencias: { codigo: string; mensaje: string }[];
  origenProducto: string | null;
  origenId: string | null;
  claveIdempotencia: string;
  huellaSolicitud: string;
  version: number;
  creadoPor: string | null;
  creadoEn: Date;
  modificadoEn: Date | null;
}

export interface FilaLineaComprobante {
  comprobanteId: string;
  tenantId: string;
  orden: number;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: string;
  valorUnitario: string;
  afectacionIgv: string;
  valorVenta: string;
  igv: string;
  precioUnitario: string;
}

export interface FilaCuotaComprobante {
  comprobanteId: string;
  tenantId: string;
  numero: number;
  monto: string;
  fechaVencimiento: string;
}

const MONTO = { type: 'numeric', precision: 14, scale: 2 } as const;
const UNITARIO = { type: 'numeric', precision: 14, scale: 4 } as const;

export const ComprobanteEntidad = new EntitySchema<FilaComprobante>({
  name: 'ComprobanteFe',
  schema: 'fe',
  tableName: 'comprobante',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    empresaId: { name: 'empresa_id', type: 'uuid' },
    sucursalId: { name: 'sucursal_id', type: 'uuid' },
    emisorId: { name: 'emisor_id', type: 'uuid' },
    tipo: { type: 'char', length: 2 },
    serie: { type: 'char', length: 4 },
    numero: { type: 'bigint' },
    fechaEmision: { name: 'fecha_emision', type: 'date' },
    moneda: { type: 'char', length: 3 },
    formaPago: { name: 'forma_pago', type: 'varchar', length: 7 },
    adquirenteTipoDoc: { name: 'adquirente_tipo_doc', type: 'varchar', length: 10 },
    adquirenteNumero: { name: 'adquirente_numero', type: 'varchar', length: 15 },
    adquirenteNombre: { name: 'adquirente_nombre', type: 'varchar', length: 200 },
    adquirenteCorreo: { name: 'adquirente_correo', type: 'varchar', length: 254, nullable: true },
    adquirentePersonaId: { name: 'adquirente_persona_id', type: 'uuid', nullable: true },
    regimenIgv: { name: 'regimen_igv', type: 'varchar', length: 24 },
    tasaIgv: { name: 'tasa_igv', type: 'numeric', precision: 5, scale: 4 },
    totalGravado: { name: 'total_gravado', ...MONTO },
    totalExonerado: { name: 'total_exonerado', ...MONTO },
    totalInafecto: { name: 'total_inafecto', ...MONTO },
    igv: MONTO,
    total: MONTO,
    modoEnvio: { name: 'modo_envio', type: 'varchar', length: 10 },
    estado: { type: 'varchar', length: 26 },
    advertencias: { type: 'jsonb' },
    origenProducto: { name: 'origen_producto', type: 'varchar', length: 10, nullable: true },
    origenId: { name: 'origen_id', type: 'varchar', length: 100, nullable: true },
    claveIdempotencia: { name: 'clave_idempotencia', type: 'uuid' },
    huellaSolicitud: { name: 'huella_solicitud', type: 'varchar', length: 64 },
    version: { type: 'integer' },
    creadoPor: { name: 'creado_por', type: 'uuid', nullable: true },
    creadoEn: { name: 'creado_en', type: 'timestamptz' },
    modificadoEn: { name: 'modificado_en', type: 'timestamptz', nullable: true },
  },
});

export const LineaComprobanteEntidad = new EntitySchema<FilaLineaComprobante>({
  name: 'LineaComprobanteFe',
  schema: 'fe',
  tableName: 'comprobante_linea',
  columns: {
    comprobanteId: { name: 'comprobante_id', type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    orden: { type: 'smallint', primary: true },
    codigo: { type: 'varchar', length: 30, nullable: true },
    descripcion: { type: 'varchar', length: 500 },
    unidad: { type: 'varchar', length: 3 },
    cantidad: UNITARIO,
    valorUnitario: { name: 'valor_unitario', ...UNITARIO },
    afectacionIgv: { name: 'afectacion_igv', type: 'char', length: 2 },
    valorVenta: { name: 'valor_venta', ...MONTO },
    igv: MONTO,
    precioUnitario: { name: 'precio_unitario', ...UNITARIO },
  },
});

export const CuotaComprobanteEntidad = new EntitySchema<FilaCuotaComprobante>({
  name: 'CuotaComprobanteFe',
  schema: 'fe',
  tableName: 'comprobante_cuota',
  columns: {
    comprobanteId: { name: 'comprobante_id', type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    numero: { type: 'smallint', primary: true },
    monto: MONTO,
    fechaVencimiento: { name: 'fecha_vencimiento', type: 'date' },
  },
});
