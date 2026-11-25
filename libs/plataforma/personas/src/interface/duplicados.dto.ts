import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ComparacionPar } from '../application/duplicados/comparar-par.js';
import type { PaginaDuplicados, ParCandidato } from '../application/ports/consulta-duplicados.js';
import { MOTIVOS_DUPLICADO, type MotivoDuplicado } from '../domain/duplicados.js';
import { CAMPOS_POR_TIPO_PERSONA, ORIGENES_CAMPO, type OrigenCampo } from '../domain/fusion.js';
import { PersonaDetalleDto, PersonaListadaDto, personaDetalleDto, personaListadaDto } from './personas.dto.js';

const CODIGOS_BLOQUEO = ['MISMA_PERSONA', 'PERSONA_FUSIONADA', 'TIPO_PERSONA_DISTINTO', 'DOCUMENTOS_DISTINTOS'];
const CAMPOS_NATURAL = CAMPOS_POR_TIPO_PERSONA.NATURAL.join(', ');

class PersonaDelParDto extends PersonaListadaDto {}

export class ParCandidatoDto {
  @ApiProperty({ type: PersonaDelParDto, description: 'La de id menor; `coincidencia` siempre nula' })
  persona_a!: PersonaDelParDto;

  @ApiProperty({ type: PersonaDelParDto })
  persona_b!: PersonaDelParDto;

  @ApiProperty({ example: 60, description: 'El mayor de los motivos: 100, 80 o 60' })
  puntaje!: number;

  @ApiProperty({ enum: MOTIVOS_DUPLICADO, isArray: true })
  motivos!: MotivoDuplicado[];
}

export class PaginaDuplicadosDto {
  @ApiProperty({ type: [ParCandidatoDto] })
  items!: ParCandidatoDto[];

  @ApiProperty({ description: 'Pares desde el puntaje mínimo, sin paginar' })
  total!: number;

  @ApiProperty({ minimum: 1 })
  pagina!: number;

  @ApiProperty({ minimum: 1 })
  tamano!: number;
}

export class ComparacionParDto {
  @ApiProperty({ type: PersonaDetalleDto, description: 'La de id menor, con su `version` para fusionar' })
  persona_a!: PersonaDetalleDto;

  @ApiProperty({ type: PersonaDetalleDto })
  persona_b!: PersonaDetalleDto;

  @ApiProperty({ description: '0 si el par no cumple ninguna regla' })
  puntaje!: number;

  @ApiProperty({ enum: MOTIVOS_DUPLICADO, isArray: true })
  motivos!: MotivoDuplicado[];

  @ApiProperty()
  descartado!: boolean;

  @ApiProperty({ enum: CODIGOS_BLOQUEO, nullable: true, description: 'Lo que respondería la fusión; nulo si se puede fusionar' })
  bloqueo!: string | null;
}

export class ParPersonasDto {
  @ApiProperty({ format: 'uuid' })
  persona_a_id!: string;

  @ApiProperty({ format: 'uuid', description: 'En cualquier orden: (a, b) y (b, a) son el mismo par' })
  persona_b_id!: string;
}

class DatosBasicosElegidosDto {
  @ApiPropertyOptional({ enum: ORIGENES_CAMPO })
  nombres?: OrigenCampo;

  @ApiPropertyOptional({ enum: ORIGENES_CAMPO })
  apellido_paterno?: OrigenCampo;

  @ApiPropertyOptional({ enum: ORIGENES_CAMPO })
  apellido_materno?: OrigenCampo;

  @ApiPropertyOptional({ enum: ORIGENES_CAMPO, description: 'Solo en JURIDICA' })
  razon_social?: OrigenCampo;
}

class PrincipalesElegidosDto {
  @ApiPropertyOptional({ format: 'uuid' })
  CELULAR?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  FIJO?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  CORREO?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  WHATSAPP?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Dirección principal' })
  DIRECCION?: string;
}

class CamposElegidosDto {
  @ApiProperty({ type: DatosBasicosElegidosDto, description: `De qué ficha sale cada dato; NATURAL: ${CAMPOS_NATURAL}. Lo que falta, de la conservada` })
  datos_basicos!: DatosBasicosElegidosDto;

  @ApiProperty({ type: PrincipalesElegidosDto, description: 'Contacto o dirección principal de cada tipo, de cualquiera de las dos fichas' })
  principales!: PrincipalesElegidosDto;
}

export class FusionarPersonasDto {
  @ApiProperty({ format: 'uuid' })
  persona_conservada_id!: string;

  @ApiProperty({ format: 'uuid', description: 'Queda inactiva como alias de la conservada' })
  persona_absorbida_id!: string;

  @ApiProperty({ minimum: 0, description: 'Versión de la conservada que se leyó en la comparación' })
  version_conservada!: number;

  @ApiProperty({ minimum: 0, description: 'Versión de la absorbida que se leyó en la comparación' })
  version_absorbida!: number;

  @ApiProperty({ type: CamposElegidosDto })
  campos_elegidos!: CamposElegidosDto;

  @ApiProperty({ minLength: 5, maxLength: 300, description: 'Recortado; queda en la auditoría' })
  motivo!: string;
}

function parCandidatoDto(par: ParCandidato): ParCandidatoDto {
  return {
    persona_a: personaListadaDto({ ...par.personaA, coincidencia: null }),
    persona_b: personaListadaDto({ ...par.personaB, coincidencia: null }),
    puntaje: par.puntaje,
    motivos: par.motivos,
  };
}

export function paginaDuplicadosDto(paginaDuplicados: PaginaDuplicados, pagina: number, tamano: number): PaginaDuplicadosDto {
  return { items: paginaDuplicados.items.map(parCandidatoDto), total: paginaDuplicados.total, pagina, tamano };
}

export function comparacionParDto(comparacion: ComparacionPar): ComparacionParDto {
  return {
    persona_a: personaDetalleDto(comparacion.personaA),
    persona_b: personaDetalleDto(comparacion.personaB),
    puntaje: comparacion.puntaje,
    motivos: comparacion.motivos,
    descartado: comparacion.descartado,
    bloqueo: comparacion.bloqueo,
  };
}
