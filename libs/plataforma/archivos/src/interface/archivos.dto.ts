import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CargaSolicitada,
  EstadoArchivo,
  UrlDescarga,
  VersionesArchivo,
  VersionListada,
  VersionSolicitada,
} from '../application/ports/archivo.port.js';
import type { CargaFirmada } from '../application/ports/almacen-archivos.js';
import {
  ESTADOS_ARCHIVO,
  ESTADOS_VERSION,
  MOTIVOS_RECHAZO,
  MOTIVOS_RECHAZO_VERSION,
  type CodigoEstadoArchivo,
  type CodigoEstadoVersion,
  type MotivoRechazo,
  type MotivoRechazoVersion,
} from '../domain/archivo.js';
import { CODIGOS_CATEGORIA, type CategoriaArchivo } from '../domain/categoria.js';

export class CategoriaDto {
  @ApiProperty({ enum: CODIGOS_CATEGORIA, example: 'DOCUMENTO' })
  codigo!: string;

  @ApiProperty({ type: [String], example: ['application/pdf', 'image/jpeg'] })
  mimes_permitidos!: string[];

  @ApiProperty({ example: 26214400 })
  tamano_max_bytes!: number;
}

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

export class SolicitarVersionDto {
  @ApiProperty({ example: 1310720, description: 'Bytes que se van a subir. El análisis rechaza la versión si el tamaño real difiere.' })
  tamano!: number;

  @ApiProperty({
    example: 'application/pdf',
    description: 'Debe ser uno de los MIME de la categoría; puede ser distinto del de la versión anterior',
  })
  mime!: string;
}

export class MarcarVigenteDto {
  @ApiProperty({ example: 2, minimum: 1, description: 'Número de una versión DISPONIBLE del archivo' })
  version!: number;
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

export class VersionSolicitadaDto {
  @ApiProperty({ format: 'uuid' })
  archivo_id!: string;

  @ApiProperty({ example: 3, description: 'Número de la versión nueva, PENDIENTE_CARGA hasta que se confirme la subida' })
  numero!: number;

  @ApiProperty({ type: CargaFirmadaDto })
  carga!: CargaFirmadaDto;
}

export class VersionDto {
  @ApiProperty({ example: 2 })
  numero!: number;

  @ApiProperty({ enum: ESTADOS_VERSION })
  estado!: CodigoEstadoVersion;

  @ApiProperty({ description: 'Si es la que entrega la descarga por defecto' })
  vigente!: boolean;

  @ApiPropertyOptional({ description: 'SHA-256 en hexadecimal, después del análisis' })
  hash_sha256?: string;

  @ApiPropertyOptional({ description: 'Tamaño real, después del análisis' })
  bytes?: number;

  @ApiPropertyOptional({ description: 'Tipo real, después del análisis' })
  mime_real?: string;

  @ApiProperty({ format: 'uuid' })
  subido_por!: string;

  @ApiProperty({ format: 'date-time' })
  subido_en!: string;
}

export class VersionesArchivoDto {
  @ApiProperty({ format: 'uuid' })
  archivo_id!: string;

  @ApiPropertyOptional({ description: 'Solo en un archivo DISPONIBLE' })
  version_vigente?: number;

  @ApiProperty({ type: [VersionDto], description: 'Por número. Los intentos rechazados no figuran' })
  versiones!: VersionDto[];
}

class VersionEnCursoDto {
  @ApiProperty({ example: 3 })
  numero!: number;

  @ApiProperty({ enum: ['PENDIENTE_CARGA', 'EN_ANALISIS'] })
  estado!: CodigoEstadoVersion;
}

class RechazoVersionDto {
  @ApiProperty({ enum: MOTIVOS_RECHAZO_VERSION })
  motivo!: MotivoRechazoVersion;

  @ApiPropertyOptional({ description: 'Solo con IDENTICA: la versión con el mismo contenido' })
  version_coincidente?: number;

  @ApiProperty({ example: 'El archivo es idéntico a la versión vigente' })
  mensaje!: string;
}

export class EstadoArchivoDto {
  @ApiProperty({ format: 'uuid' })
  archivo_id!: string;

  @ApiProperty({ enum: ESTADOS_ARCHIVO, description: 'El ciclo de la primera carga' })
  estado!: CodigoEstadoArchivo;

  @ApiPropertyOptional({ enum: MOTIVOS_RECHAZO, description: 'Solo en un archivo RECHAZADO' })
  motivo_rechazo?: MotivoRechazo;

  @ApiProperty({ enum: CODIGOS_CATEGORIA })
  categoria!: string;

  @ApiProperty({ example: 'contrato.pdf' })
  nombre_original!: string;

  @ApiPropertyOptional({ description: 'Tamaño real de la versión vigente, después del análisis' })
  bytes?: number;

  @ApiPropertyOptional({ description: 'SHA-256 en hexadecimal de la versión vigente, después del análisis' })
  hash_sha256?: string;

  @ApiPropertyOptional({ description: 'Solo en un archivo DISPONIBLE' })
  version_vigente?: number;

  @ApiPropertyOptional({ type: VersionEnCursoDto, description: 'La versión nueva que se está subiendo o analizando' })
  version_en_curso?: VersionEnCursoDto;

  @ApiPropertyOptional({ type: RechazoVersionDto, description: 'Si el último intento de versión se rechazó' })
  rechazo_version?: RechazoVersionDto;
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

  @ApiPropertyOptional({ enum: ESTADOS_ARCHIVO, description: 'Solo con ARCHIVO_NO_DISPONIBLE o VERSION_NO_DISPONIBLE' })
  estado?: CodigoEstadoArchivo;

  @ApiPropertyOptional({ description: 'Solo con VERSION_EN_CURSO: el número de la versión en curso' })
  numero?: number;
}

/** Sin `sensible`: es un detalle de auditoría que el front no necesita. */
export function categoriaDto(categoria: CategoriaArchivo): CategoriaDto {
  return { codigo: categoria.codigo, mimes_permitidos: [...categoria.mimesPermitidos], tamano_max_bytes: categoria.tamanoMaxBytes };
}

export function cargaSolicitadaDto(solicitada: CargaSolicitada): CargaSolicitadaDto {
  return { archivo_id: solicitada.archivoId, carga: cargaFirmadaDto(solicitada.carga) };
}

export function versionSolicitadaDto(solicitada: VersionSolicitada): VersionSolicitadaDto {
  return { archivo_id: solicitada.archivoId, numero: solicitada.numero, carga: cargaFirmadaDto(solicitada.carga) };
}

export function versionDto(version: VersionListada): VersionDto {
  return {
    numero: version.numero,
    estado: version.estado,
    vigente: version.vigente,
    ...(version.hashSha256 !== undefined && { hash_sha256: version.hashSha256 }),
    ...(version.bytes !== undefined && { bytes: version.bytes }),
    ...(version.mimeReal !== undefined && { mime_real: version.mimeReal }),
    subido_por: version.subidoPor,
    subido_en: version.subidoEn.toISOString(),
  };
}

export function versionesArchivoDto(versiones: VersionesArchivo): VersionesArchivoDto {
  return {
    archivo_id: versiones.archivoId,
    ...(versiones.versionVigente !== undefined && { version_vigente: versiones.versionVigente }),
    versiones: versiones.versiones.map(versionDto),
  };
}

export function estadoArchivoDto(estado: EstadoArchivo): EstadoArchivoDto {
  const { rechazoVersion } = estado;
  return {
    archivo_id: estado.archivoId,
    estado: estado.estado,
    ...(estado.motivoRechazo !== undefined && { motivo_rechazo: estado.motivoRechazo }),
    categoria: estado.categoria,
    nombre_original: estado.nombreOriginal,
    ...(estado.bytes !== undefined && { bytes: estado.bytes }),
    ...(estado.hashSha256 !== undefined && { hash_sha256: estado.hashSha256 }),
    ...(estado.versionVigente !== undefined && { version_vigente: estado.versionVigente }),
    ...(estado.versionEnCurso !== undefined && { version_en_curso: estado.versionEnCurso }),
    ...(rechazoVersion !== undefined && {
      rechazo_version: {
        motivo: rechazoVersion.motivo,
        ...(rechazoVersion.versionCoincidente !== undefined && { version_coincidente: rechazoVersion.versionCoincidente }),
        mensaje: rechazoVersion.mensaje,
      },
    }),
  };
}

export function urlDescargaDto(descarga: UrlDescarga): UrlDescargaDto {
  return { url: descarga.url, expira_en: descarga.expiraEn.toISOString() };
}

function cargaFirmadaDto(carga: CargaFirmada): CargaFirmadaDto {
  return { url: carga.url, token: carga.token, expira_en: carga.expiraEn.toISOString() };
}
