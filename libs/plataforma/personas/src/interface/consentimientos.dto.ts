import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DecisionPorFinalidad, TextoPublicado } from '../application/consentimientos/vista-consentimiento.js';
import type { DecisionRegistrada } from '../application/ports/consentimiento.port.js';
import { CANALES, DECISIONES, FINALIDADES, type Canal, type Decision, type Finalidad } from '../domain/consentimiento.js';
import { MOTIVOS_EVIDENCIA_INVALIDA, type MotivoEvidenciaInvalida } from '../domain/errores.js';
import { LONGITUD_MAXIMA_TEXTO_LEGAL, LONGITUD_MINIMA_TEXTO_LEGAL } from '../domain/texto-finalidad.js';

export const MAXIMO_DECISIONES_POR_LOTE = FINALIDADES.length;

const ACCION_EXPRESA =
  'Debe ser verdadero por una acción del titular: la casilla nunca viene marcada por defecto. Ausente o falso → 422 ACCION_EXPRESA_REQUERIDA y no se guarda nada del lote';

export class DecisionEntradaDto {
  @ApiProperty({ enum: FINALIDADES })
  finalidad!: Finalidad;

  @ApiProperty({ enum: DECISIONES, description: 'Sin valor por defecto: si falta → 422 DATOS_INVALIDOS' })
  decision!: Decision;

  @ApiProperty({ example: '2026-03', description: 'La versión vigente del texto de esa finalidad' })
  version_texto!: string;

  @ApiProperty({ example: true, description: ACCION_EXPRESA })
  accion_expresa!: boolean;
}

export class RegistrarConsentimientosDto {
  @ApiProperty({ enum: CANALES })
  canal!: Canal;

  @ApiPropertyOptional({ format: 'uuid', description: 'Archivo del tenant, DISPONIBLE y de categoría EVIDENCIA' })
  evidencia_archivo_id?: string;

  @ApiProperty({ type: [DecisionEntradaDto], minItems: 1, maxItems: MAXIMO_DECISIONES_POR_LOTE, description: 'Una por finalidad; todo o nada' })
  decisiones!: DecisionEntradaDto[];
}

export class RevocarConsentimientoDto {
  @ApiProperty({ enum: CANALES })
  canal!: Canal;
}

export class PublicarTextoDto {
  @ApiProperty({ enum: FINALIDADES })
  finalidad!: Finalidad;

  @ApiProperty({ example: '2026-03', pattern: '^[A-Za-z0-9._-]{1,20}$' })
  version!: string;

  @ApiProperty({ minLength: LONGITUD_MINIMA_TEXTO_LEGAL, maxLength: LONGITUD_MAXIMA_TEXTO_LEGAL, description: 'Texto legal; publicado no se edita' })
  texto!: string;
}

export class DecisionRegistradaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: FINALIDADES })
  finalidad!: Finalidad;

  @ApiProperty({ enum: DECISIONES })
  decision!: Decision;

  @ApiProperty()
  version_texto!: string;

  @ApiProperty({ enum: CANALES })
  canal!: Canal;

  @ApiPropertyOptional({ format: 'uuid' })
  evidencia_archivo_id?: string;

  @ApiProperty({ format: 'uuid' })
  registrado_por!: string;

  @ApiProperty({ format: 'date-time' })
  registrado_en!: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Solo en un ACEPTA revocado' })
  revocado_en?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  revocado_por?: string;

  @ApiPropertyOptional({ enum: CANALES })
  canal_revocacion?: Canal;
}

export class DecisionPorFinalidadDto {
  @ApiProperty({ enum: FINALIDADES })
  finalidad!: Finalidad;

  @ApiProperty({ type: DecisionRegistradaDto, nullable: true, description: 'La decisión más reciente; null si nunca decidió' })
  decision!: DecisionRegistradaDto | null;
}

export class ConsentimientosPersonaDto {
  @ApiProperty({ format: 'uuid' })
  persona_id!: string;

  @ApiPropertyOptional({ type: [DecisionPorFinalidadDto], description: 'Sin ?historial=true: las cinco finalidades' })
  vigentes?: DecisionPorFinalidadDto[];

  @ApiPropertyOptional({ type: [DecisionRegistradaDto], description: 'Con ?historial=true: todas, de la más reciente a la más antigua' })
  historial?: DecisionRegistradaDto[];
}

export class DecisionesRegistradasDto {
  @ApiProperty({ format: 'uuid' })
  persona_id!: string;

  @ApiProperty({ type: [DecisionRegistradaDto] })
  decisiones!: DecisionRegistradaDto[];
}

export class TextoPublicadoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: FINALIDADES })
  finalidad!: Finalidad;

  @ApiProperty()
  version!: string;

  @ApiProperty()
  texto!: string;

  @ApiProperty({ format: 'uuid' })
  publicado_por!: string;

  @ApiProperty({ format: 'date-time' })
  publicado_en!: string;
}

export class ErrorConsentimientoDto {
  @ApiProperty({ example: 'VERSION_TEXTO_NO_VIGENTE' })
  codigo!: string;

  @ApiProperty()
  mensaje!: string;

  @ApiPropertyOptional({ enum: FINALIDADES, description: 'En VERSION_TEXTO_NO_VIGENTE, TEXTO_NO_PUBLICADO y FINALIDAD_REPETIDA' })
  finalidad?: Finalidad;

  @ApiPropertyOptional({ description: 'Solo en VERSION_TEXTO_NO_VIGENTE: la versión vigente del texto' })
  version_vigente?: string;

  @ApiPropertyOptional({ enum: MOTIVOS_EVIDENCIA_INVALIDA, description: 'Solo en EVIDENCIA_INVALIDA' })
  motivo?: MotivoEvidenciaInvalida;
}

export function decisionRegistradaDto(decision: DecisionRegistrada): DecisionRegistradaDto {
  return {
    id: decision.id,
    finalidad: decision.finalidad,
    decision: decision.decision,
    version_texto: decision.versionTexto,
    canal: decision.canal,
    ...(decision.evidenciaArchivoId ? { evidencia_archivo_id: decision.evidenciaArchivoId } : {}),
    registrado_por: decision.registradoPor,
    registrado_en: decision.registradoEn.toISOString(),
    ...(decision.revocadoEn
      ? { revocado_en: decision.revocadoEn.toISOString(), revocado_por: decision.revocadoPor, canal_revocacion: decision.canalRevocacion }
      : {}),
  };
}

export function decisionPorFinalidadDto({ finalidad, decision }: DecisionPorFinalidad): DecisionPorFinalidadDto {
  return { finalidad, decision: decision ? decisionRegistradaDto(decision) : null };
}

export function textoPublicadoDto(texto: TextoPublicado): TextoPublicadoDto {
  return {
    id: texto.id,
    finalidad: texto.finalidad,
    version: texto.version,
    texto: texto.texto,
    publicado_por: texto.publicadoPor,
    publicado_en: texto.publicadoEn.toISOString(),
  };
}
