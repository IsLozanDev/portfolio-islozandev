import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRODUCTOS, type ProductoCodigo } from '@vitrina/plataforma/org';
import type { MotivoInvalidez } from '@vitrina/shared/util';
import type { AvisoPrellenado, Prellenado, ResultadoBusqueda } from '../application/buscar-persona.js';
import type { ListadoPersonas } from '../application/buscar-personas.js';
import type { Coincidencia, PersonaListada } from '../application/ports/consulta-personas.js';
import type { PersonaDetalle, PersonaResumen } from '../application/ports/persona.port.js';
import { TIPOS_CONTACTO, type TipoContacto } from '../domain/contacto.js';
import { denominacionVisible, type DenominacionPersona } from '../domain/denominacion.js';
import { TIPOS_DOCUMENTO_PERSONA, type TipoDocumentoPersona } from '../domain/documento-identidad.js';
import { TIPOS_PERSONA, type TipoPersona } from '../domain/persona.js';
import { ROLES_PERSONA, type RolPersona } from '../domain/rol-persona.js';
import { DireccionDto, direccionDto } from './direcciones.dto.js';

const MOTIVOS_INVALIDEZ: MotivoInvalidez[] = ['LONGITUD', 'PREFIJO', 'DIGITO_VERIFICADOR', 'CARACTERES'];
const AVISOS_PRELLENADO: AvisoPrellenado[] = ['IDENTIDAD_NO_DISPONIBLE', 'CUOTA_AGOTADA', 'NO_ENCONTRADO_EN_IDENTIDAD'];
const COINCIDENCIAS: Coincidencia[] = ['DOCUMENTO', 'CONTACTO', 'NOMBRE'];

class DenominacionDto {
  @ApiProperty({ type: String, nullable: true, example: 'Juana' })
  nombres!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Quispe' })
  apellido_paterno!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Mamani' })
  apellido_materno!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Solo en personas jurídicas' })
  razon_social!: string | null;
}

export class PersonaDto extends DenominacionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TIPOS_PERSONA })
  tipo_persona!: TipoPersona;

  @ApiProperty({ enum: TIPOS_DOCUMENTO_PERSONA })
  tipo_documento!: TipoDocumentoPersona;

  @ApiProperty({ example: '45781236' })
  numero_documento!: string;

  @ApiProperty()
  activo!: boolean;
}

export class RolDto {
  @ApiProperty({ enum: PRODUCTOS })
  producto_codigo!: ProductoCodigo;

  @ApiProperty({ enum: ROLES_PERSONA })
  rol!: RolPersona;

  @ApiProperty({ format: 'date', description: 'Fecha de Lima' })
  desde!: string;

  @ApiProperty({ type: String, format: 'date', nullable: true, description: 'Nula mientras el rol está vigente' })
  hasta!: string | null;
}

export class ContactoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TIPOS_CONTACTO })
  tipo!: TipoContacto;

  @ApiProperty({ example: '987654321' })
  valor!: string;

  @ApiProperty()
  principal!: boolean;
}

export class PersonaDetalleDto extends PersonaDto {
  @ApiProperty({ minimum: 1, description: 'Versión de la persona: se envía al editar o borrar' })
  version!: number;

  @ApiProperty({ type: [RolDto] })
  roles!: RolDto[];

  @ApiProperty({ type: [ContactoDto] })
  contactos!: ContactoDto[];

  @ApiProperty({ type: [DireccionDto] })
  direcciones!: DireccionDto[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Id de la absorbida que se pidió y resolvió a esta conservada (spec 39); nulo si se pidió esta persona',
  })
  resuelta_desde!: string | null;

  @ApiProperty({ type: [String], description: 'Ids de las personas absorbidas en esta' })
  alias!: string[];
}

export class ActualizarDatosBasicosDto {
  @ApiProperty({ minimum: 0, description: 'Versión de la persona que se leyó' })
  version!: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100, description: 'Solo en NATURAL; no admite vacío' })
  nombres?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60, description: 'Solo en NATURAL; no admite vacío' })
  apellido_paterno?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60, description: 'Solo en NATURAL; nulo lo borra' })
  apellido_materno?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200, description: 'Solo en JURIDICA; no admite vacío' })
  razon_social?: string | null;
}

export class PrellenadoDto extends DenominacionDto {}

export class BusquedaDto {
  @ApiProperty()
  encontrada!: boolean;

  @ApiPropertyOptional({ type: PersonaDto, description: 'Solo si `encontrada` es verdadero' })
  persona?: PersonaDto;

  @ApiPropertyOptional({
    type: PrellenadoDto,
    nullable: true,
    description: 'Solo si no se encontró. Sugerencia editable de TR-IDN para DNI y RUC; nula si no hay datos',
  })
  prellenado?: PrellenadoDto | null;

  @ApiPropertyOptional({ enum: AVISOS_PRELLENADO, description: 'Por qué no hubo prellenado: seguir con registro manual' })
  aviso?: AvisoPrellenado;
}

export class RegistrarPersonaDto {
  @ApiProperty({ enum: TIPOS_PERSONA })
  tipo_persona!: TipoPersona;

  @ApiProperty({ enum: TIPOS_DOCUMENTO_PERSONA })
  tipo_documento!: string;

  @ApiProperty({ example: '45781236' })
  numero_documento!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100, description: 'Obligatorio en NATURAL' })
  nombres?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60, description: 'Obligatorio en NATURAL' })
  apellido_paterno?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60 })
  apellido_materno?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200, description: 'Obligatorio en JURIDICA (RUC 20)' })
  razon_social?: string | null;

  @ApiProperty({ example: '987654321', description: 'Celular principal: 9 dígitos, inicia con 9' })
  celular!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'juana@vitrina.pe', description: 'Correo principal' })
  correo?: string | null;
}

export class AsignarRolDto {
  @ApiProperty({ enum: PRODUCTOS })
  producto_codigo!: ProductoCodigo;

  @ApiProperty({ enum: ROLES_PERSONA })
  rol!: RolPersona;
}

export class RolAsignadoDto {
  @ApiProperty({ description: 'Falso si la persona ya tenía vigente ese rol en el producto' })
  asignado!: boolean;
}

class RolVigenteDto {
  @ApiProperty({ enum: PRODUCTOS })
  producto_codigo!: ProductoCodigo;

  @ApiProperty({ enum: ROLES_PERSONA })
  rol!: RolPersona;
}

export class PersonaListadaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TIPOS_PERSONA })
  tipo_persona!: TipoPersona;

  @ApiProperty({ enum: TIPOS_DOCUMENTO_PERSONA })
  tipo_documento!: TipoDocumentoPersona;

  @ApiProperty({ example: '45781236' })
  numero_documento!: string;

  @ApiProperty({ example: 'Quispe Mamani, Juana', description: 'Natural: apellidos, nombres. Jurídica: la razón social' })
  denominacion!: string;

  @ApiProperty({ type: String, nullable: true, example: '987654321' })
  celular_principal!: string | null;

  @ApiProperty({ type: String, nullable: true })
  correo_principal!: string | null;

  @ApiProperty({ type: [RolVigenteDto], description: 'Roles vigentes' })
  roles!: RolVigenteDto[];

  @ApiProperty({ enum: COINCIDENCIAS, nullable: true, description: 'Por qué entró en el resultado; nula sin `q`' })
  coincidencia!: Coincidencia | null;
}

export class ListadoPersonasDto {
  @ApiProperty({ type: [PersonaListadaDto] })
  items!: PersonaListadaDto[];

  @ApiProperty({ description: 'Personas que cumplen la búsqueda y los filtros, sin paginar' })
  total!: number;

  @ApiProperty({ minimum: 1 })
  pagina!: number;

  @ApiProperty({ minimum: 1 })
  tamano!: number;
}

export class ProductoSuscritoDto {
  @ApiProperty({ enum: PRODUCTOS })
  producto_codigo!: ProductoCodigo;
}

export class ErrorPersonaDto {
  @ApiProperty({ example: 'PERSONA_DUPLICADA' })
  codigo!: string;

  @ApiProperty()
  mensaje!: string;

  @ApiPropertyOptional({ enum: MOTIVOS_INVALIDEZ, description: 'Solo en DOCUMENTO_INVALIDO' })
  motivo?: MotivoInvalidez;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo en PERSONA_DUPLICADA: la persona que ya tiene ese documento' })
  persona_id?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo en PERSONA_FUSIONADA: la conservada que hay que cargar' })
  persona_conservada_id?: string;
}

function denominacionDto(denominacion: DenominacionPersona): DenominacionDto {
  return {
    nombres: denominacion.nombres,
    apellido_paterno: denominacion.apellidoPaterno,
    apellido_materno: denominacion.apellidoMaterno,
    razon_social: denominacion.razonSocial,
  };
}

export function personaDto(persona: PersonaResumen): PersonaDto {
  return {
    id: persona.id,
    tipo_persona: persona.tipoPersona,
    tipo_documento: persona.tipoDocumento,
    numero_documento: persona.numeroDocumento,
    ...denominacionDto(persona),
    activo: persona.activo,
  };
}

export function personaDetalleDto(persona: PersonaDetalle): PersonaDetalleDto {
  return {
    ...personaDto(persona),
    version: persona.version,
    roles: persona.roles.map(({ productoCodigo, rol, desde, hasta }) => ({ producto_codigo: productoCodigo, rol, desde, hasta })),
    contactos: persona.contactos.map(({ id, tipo, valor, principal }) => ({ id, tipo, valor, principal })),
    direcciones: persona.direcciones.map(direccionDto),
    resuelta_desde: persona.resueltaDesde,
    alias: [...persona.alias],
  };
}

function prellenadoDto(prellenado: Prellenado | null): PrellenadoDto | null {
  return prellenado === null ? null : denominacionDto(prellenado);
}

export function busquedaDto(resultado: ResultadoBusqueda): BusquedaDto {
  if (resultado.encontrada) return { encontrada: true, persona: personaDto(resultado.persona) };
  const sinPersona = { encontrada: false, prellenado: prellenadoDto(resultado.prellenado) };
  return resultado.aviso === undefined ? sinPersona : { ...sinPersona, aviso: resultado.aviso };
}

export function personaListadaDto(persona: PersonaListada): PersonaListadaDto {
  return {
    id: persona.id,
    tipo_persona: persona.tipoPersona,
    tipo_documento: persona.tipoDocumento,
    numero_documento: persona.numeroDocumento,
    denominacion: denominacionVisible(persona),
    celular_principal: persona.celularPrincipal,
    correo_principal: persona.correoPrincipal,
    roles: persona.roles.map(({ productoCodigo, rol }) => ({ producto_codigo: productoCodigo, rol })),
    coincidencia: persona.coincidencia,
  };
}

export function listadoPersonasDto(listado: ListadoPersonas): ListadoPersonasDto {
  return { items: listado.items.map(personaListadaDto), total: listado.total, pagina: listado.pagina, tamano: listado.tamano };
}
