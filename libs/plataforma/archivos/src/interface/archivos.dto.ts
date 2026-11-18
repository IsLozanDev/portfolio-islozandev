import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CargaSolicitada, EstadoArchivo, UrlDescarga } from '../application/ports/archivo.port.js';
import { ESTADOS_ARCHIVO, MOTIVOS_RECHAZO, type CodigoEstadoArchivo, type MotivoRechazo } from '../domain/archivo.js';
import { CODIGOS_CATEGORIA } from '../domain/categoria.js';

export class SolicitarCargaDto {
  @ApiProperty({ enum: CODIGOS_CATEGORIA, example: 'DOCUMENTO' })
  categoria!: string;

  @ApiProperty({ example: 'contrato.pdf', minLength: 1, maxLength: 255 })
  nombre_original!: string;

  @ApiProperty({ example: 1258291, description: 'Bytes que se van a subir. El análisis rechaza el archivo si el tamaño real difiere.' })
  tamano!: number;

  @ApiProperty({ example: 'application/pdf', description: 'Debe ser uno de los MIME de la categoría' })
  mime!: string;

  @ApiProperty({ example: 'CONTRATO', pattern: '^[A-Z][A-Z0-9_]{1,39}$', description: 'Tipo de la entidad a la que se asocia el archivo' })
  entidad_tipo!: string;

  @ApiProperty({ example: 'C-000981', minLength: 1, maxLength: 80 })
  entidad_id!: string;
}

class CargaFirmadaDto {
  @ApiProperty({ description: 'URL de Storage para un solo objeto. Se sube con PUT y el Content-Type declarado; no reemplaza un objeto ya subido.' })
  url!: string;

  @ApiProperty()
  token!: string;

  @ApiProperty({ format: 'date-time', description: 'La URL de carga vale 2 horas' })
  expira_en!: string;
}

export class CargaSolicitadaDto {
  @ApiProperty({ format: 'uuid' })
  archivo_id!: string;

  @ApiProperty({ type: CargaFirmadaDto })
  carga!: CargaFirmadaDto;
}

export class EstadoArchivoDto {
  @ApiProperty({ format: 'uuid' })
  archivo_id!: string;

  @ApiProperty({ enum: ESTADOS_ARCHIVO })
  estado!: CodigoEstadoArchivo;

  @ApiPropertyOptional({ enum: MOTIVOS_RECHAZO, description: 'Solo en un archivo RECHAZADO' })
  motivo_rechazo?: MotivoRechazo;

  @ApiProperty({ enum: CODIGOS_CATEGORIA })
  categoria!: string;

  @ApiProperty({ example: 'contrato.pdf' })
  nombre_original!: string;

  @ApiPropertyOptional({ description: 'Tamaño real, después del análisis' })
  bytes?: number;

  @ApiPropertyOptional({ description: 'SHA-256 en hexadecimal, después del análisis' })
  hash_sha256?: string;
}

export class UrlDescargaDto {
  @ApiProperty({ description: 'URL firmada de Storage' })
  url!: string;

  @ApiProperty({ format: 'date-time' })
  expira_en!: string;
}

export class ErrorArchivoDto {
  @ApiProperty({ example: 'TAMANO_EXCEDIDO' })
  codigo!: string;

  @ApiProperty()
  mensaje!: string;

  @ApiPropertyOptional({ description: 'Solo con TAMANO_EXCEDIDO: el máximo de la categoría' })
  tamano_max_bytes?: number;

  @ApiPropertyOptional({ enum: ESTADOS_ARCHIVO, description: 'Solo con ARCHIVO_NO_DISPONIBLE' })
  estado?: CodigoEstadoArchivo;
}

export function cargaSolicitadaDto(solicitada: CargaSolicitada): CargaSolicitadaDto {
  const { url, token, expiraEn } = solicitada.carga;
  return { archivo_id: solicitada.archivoId, carga: { url, token, expira_en: expiraEn.toISOString() } };
}

export function estadoArchivoDto(estado: EstadoArchivo): EstadoArchivoDto {
  return {
    archivo_id: estado.archivoId,
    estado: estado.estado,
    ...(estado.motivoRechazo !== undefined && { motivo_rechazo: estado.motivoRechazo }),
    categoria: estado.categoria,
    nombre_original: estado.nombreOriginal,
    ...(estado.bytes !== undefined && { bytes: estado.bytes }),
    ...(estado.hashSha256 !== undefined && { hash_sha256: estado.hashSha256 }),
  };
}

export function urlDescargaDto(descarga: UrlDescarga): UrlDescargaDto {
  return { url: descarga.url, expira_en: descarga.expiraEn.toISOString() };
}
