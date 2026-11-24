import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { VistaEmisor } from '../application/vista-emisor.js';
import { AMBIENTES_EMISOR, ESTADOS_EMISOR, ESTADOS_PRUEBA } from '../domain/estado-emisor.js';
import { REGIMENES_IGV } from '../domain/regimen-igv.js';

export class ConfigurarEmisorDto {
  @ApiProperty({ example: 'SIMULADO', maxLength: 40, description: 'Código de un ítem vigente del catálogo PROVEEDOR_FE' })
  proveedor!: string;

  @ApiProperty({ example: 'MODDATOS', minLength: 1, maxLength: 100 })
  usuario_proveedor!: string;

  @ApiPropertyOptional({
    format: 'password',
    writeOnly: true,
    maxLength: 200,
    description: 'Clave del proveedor. Va a la bóveda y nunca vuelve; sin ella se conserva la guardada',
  })
  clave?: string;

  @ApiProperty({ enum: REGIMENES_IGV, example: 'GENERAL' })
  regimen_igv!: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true, example: 'Representación impresa de la factura electrónica' })
  leyenda_pie?: string | null;

  @ApiPropertyOptional({
    maxLength: 255,
    nullable: true,
    example: 'https://api.nubefact.com/api/v1/48239908-7ae7-4353-824d-071765d4',
    description:
      'Ruta del proveedor. Obligatoria si el proveedor declara dominios permitidos: https, de uno de ellos, sin credenciales ni otro puerto. ' +
      'Ausente es null. En producción no se puede cambiar',
  })
  url_proveedor?: string | null;

  @ApiPropertyOptional({ example: 1, minimum: 1, description: 'Obligatoria si el emisor ya existe (bloqueo optimista)' })
  version?: number;
}

export class CargarCertificadoDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Certificado PKCS#12 (.pfx o .p12), hasta 50 KB' })
  archivo!: unknown;

  @ApiProperty({ format: 'password', writeOnly: true, minLength: 1, maxLength: 200, description: 'Clave del .pfx; va a la bóveda y nunca vuelve' })
  clave!: string;
}

class CertificadoEmisorDto {
  @ApiProperty({ example: '20601234561' })
  ruc!: string;

  @ApiProperty({ format: 'date-time' })
  vence_en!: string;

  @ApiProperty({ example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', description: 'SHA-256 del DER del certificado' })
  huella_sha256!: string;
}

class PruebaEmisorDto {
  @ApiProperty({ enum: ESTADOS_PRUEBA, description: 'EN_PROCESO hasta que el worker registra el resultado del PSE' })
  estado!: string;

  @ApiProperty({ example: 1, description: 'Correlativo de prueba del emisor: el número de la boleta de prueba' })
  numero!: number;

  @ApiProperty({ format: 'date-time' })
  solicitada_en!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resultado_en!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '0', description: 'Código del PSE o de SUNAT' })
  codigo!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'La Boleta numero B001-1, ha sido aceptada' })
  descripcion!: string | null;
}

/** Sin campos para la clave del proveedor ni la del certificado, ni los ids de la bóveda. */
export class EmisorDto {
  @ApiProperty({ format: 'uuid' })
  emisor_id!: string;

  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiProperty({ example: 'SIMULADO' })
  proveedor!: string;

  @ApiProperty({ enum: AMBIENTES_EMISOR })
  ambiente!: string;

  @ApiProperty({ enum: ESTADOS_EMISOR, description: 'VERIFICADO tras una prueba en beta aceptada; PRODUCCION tras habilitarla' })
  estado!: string;

  @ApiProperty({ enum: REGIMENES_IGV })
  regimen_igv!: string;

  @ApiProperty({ type: String, nullable: true })
  leyenda_pie!: string | null;

  @ApiProperty({ type: String, nullable: true })
  usuario_proveedor!: string | null;

  @ApiProperty({ description: 'La clave del proveedor está guardada en la bóveda' })
  tiene_credencial!: boolean;

  @ApiProperty({ type: CertificadoEmisorDto, nullable: true })
  certificado!: CertificadoEmisorDto | null;

  @ApiProperty({ type: String, nullable: true, description: 'Ruta del proveedor; el token está en la bóveda' })
  url_proveedor!: string | null;

  @ApiProperty({ type: PruebaEmisorDto, nullable: true, description: 'La última prueba en beta' })
  prueba!: PruebaEmisorDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  produccion_habilitada_en!: string | null;

  @ApiProperty({ example: 2 })
  version!: number;
}

export class ErrorFeDto {
  @ApiProperty({ example: 'CERTIFICADO_OTRO_RUC' })
  codigo!: string;

  @ApiProperty({ example: 'El certificado no corresponde al RUC de la empresa' })
  mensaje!: string;
}

export function emisorDto(vista: VistaEmisor): EmisorDto {
  return {
    emisor_id: vista.emisorId,
    empresa_id: vista.empresaId,
    proveedor: vista.proveedor,
    ambiente: vista.ambiente,
    estado: vista.estado,
    regimen_igv: vista.regimenIgv,
    leyenda_pie: vista.leyendaPie,
    usuario_proveedor: vista.usuarioProveedor,
    tiene_credencial: vista.tieneCredencial,
    certificado: vista.certificado && {
      ruc: vista.certificado.ruc,
      vence_en: vista.certificado.venceEn.toISOString(),
      huella_sha256: vista.certificado.huellaSha256,
    },
    url_proveedor: vista.urlProveedor,
    prueba: vista.prueba && {
      estado: vista.prueba.estado,
      numero: vista.prueba.numero,
      solicitada_en: vista.prueba.solicitadaEn.toISOString(),
      resultado_en: vista.prueba.resultadoEn?.toISOString() ?? null,
      codigo: vista.prueba.codigo,
      descripcion: vista.prueba.descripcion,
    },
    produccion_habilitada_en: vista.produccionHabilitadaEn?.toISOString() ?? null,
    version: vista.version,
  };
}
