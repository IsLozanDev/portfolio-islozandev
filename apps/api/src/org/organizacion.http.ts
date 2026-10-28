import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotFoundError } from '@vitrina/plataforma/kernel';
import { TIPOS_UNIDAD, type EmpresaListada, type Listado, type Pagina, type SucursalListada, type UnidadListada } from '@vitrina/plataforma/org';
import { z } from 'zod';

export const TAMANO_PAGINA_DEFECTO = 20;
export const TAMANO_PAGINA_MAXIMO = 100;
/** Default de la columna org.sucursal.zona_horaria. */
const ZONA_HORARIA_DEFECTO = 'America/Lima';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUC = /^\d{11}$/;
/** Los query params llegan como texto. */
const BOOLEANOS_TEXTO = ['true', 'false'] as const;

// Cotas de entrada iguales a las columnas de db/01a_org.sql. El formato fino lo valida el dominio, con sus mensajes.
const LONGITUD = { razonSocial: 200, nombre: 150, direccion: 250, ubigeo: 6, codigo: 20, establecimiento: 4, telefono: 30, zonaHoraria: 40 } as const;

const uuid = z.string().regex(UUID);
const textoOpcional = (maximo: number) => z.string().max(maximo).nullish();
const version = z.number().int().nonnegative();
const booleanoTexto = z.enum(BOOLEANOS_TEXTO).optional();

export const EsquemaPagina = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(TAMANO_PAGINA_MAXIMO).default(TAMANO_PAGINA_DEFECTO),
});

export const EsquemaListarActivos = EsquemaPagina.extend({ activo: booleanoTexto });

export const EsquemaListarUnidades = EsquemaListarActivos.extend({
  empresa_id: uuid.optional(),
  sucursal_id: uuid.optional(),
  tipo: z.enum(TIPOS_UNIDAD).optional(),
});

const datosEmpresa = {
  razon_social: z.string().min(1).max(LONGITUD.razonSocial),
  nombre_comercial: textoOpcional(LONGITUD.nombre),
  direccion_fiscal: textoOpcional(LONGITUD.direccion),
  ubigeo: textoOpcional(LONGITUD.ubigeo),
};

export const EsquemaRegistrarEmpresa = z.object({ ruc: z.string().regex(RUC), ...datosEmpresa });
export const EsquemaEditarEmpresa = z.object({ version, ...datosEmpresa });

const datosSucursal = {
  codigo: z.string().min(1).max(LONGITUD.codigo),
  nombre: z.string().min(1).max(LONGITUD.nombre),
  codigo_establecimiento_sunat: textoOpcional(LONGITUD.establecimiento),
  direccion: textoOpcional(LONGITUD.direccion),
  ubigeo: textoOpcional(LONGITUD.ubigeo),
  telefono: textoOpcional(LONGITUD.telefono),
  zona_horaria: z.string().min(1).max(LONGITUD.zonaHoraria).default(ZONA_HORARIA_DEFECTO),
};

export const EsquemaRegistrarSucursal = z.object(datosSucursal);
export const EsquemaEditarSucursal = z.object({ version, activo: z.boolean().optional(), ...datosSucursal });

const datosUnidad = {
  codigo: z.string().min(1).max(LONGITUD.codigo),
  nombre: z.string().min(1).max(LONGITUD.nombre),
  padre_id: uuid.nullish(),
  atributos: z.record(z.string(), z.unknown()).default({}),
};

export const EsquemaRegistrarUnidad = z.object({
  empresa_id: uuid,
  sucursal_id: uuid.nullish(),
  tipo: z.enum(TIPOS_UNIDAD),
  ...datosUnidad,
});
export const EsquemaEditarUnidad = z.object({ version, activo: z.boolean().optional(), ...datosUnidad });

/** `'true'` / `'false'` del query string, o sin filtro. */
export function activoDe(texto: (typeof BOOLEANOS_TEXTO)[number] | undefined): boolean | undefined {
  return texto === undefined ? undefined : texto === 'true';
}

export function paginaDe(consulta: z.infer<typeof EsquemaPagina>): Pagina {
  return { pagina: consulta.pagina, tamano: consulta.tamano };
}

/** Un id que no es UUID no puede existir: 404 sin llegar al caso de uso. */
export function exigirUuid(id: string, mensaje: string): string {
  if (!UUID.test(id)) throw new NotFoundError(mensaje);
  return id;
}

export class EmpresaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '20512345671' })
  ruc!: string;

  @ApiProperty({ example: 'Sabores del Sur SAC' })
  razon_social!: string;

  @ApiProperty({ nullable: true })
  nombre_comercial!: string | null;

  @ApiProperty({ nullable: true })
  direccion_fiscal!: string | null;

  @ApiProperty({ nullable: true, example: '040101' })
  ubigeo!: string | null;

  @ApiProperty()
  activo!: boolean;

  @ApiProperty({ description: 'Se envía en el PUT; si cambió, la edición responde 409 VERSION_OBSOLETA' })
  version!: number;
}

export class SucursalDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiProperty({ example: 'CAYMA' })
  codigo!: string;

  @ApiProperty({ example: 'Cayma' })
  nombre!: string;

  @ApiProperty({ nullable: true, example: '0002', description: '0000 solo en la principal (TR-RN-003)' })
  codigo_establecimiento_sunat!: string | null;

  @ApiProperty({ nullable: true })
  direccion!: string | null;

  @ApiProperty({ nullable: true })
  ubigeo!: string | null;

  @ApiProperty({ nullable: true })
  telefono!: string | null;

  @ApiProperty({ example: ZONA_HORARIA_DEFECTO })
  zona_horaria!: string;

  @ApiProperty()
  es_principal!: boolean;

  @ApiProperty()
  activo!: boolean;

  @ApiProperty()
  version!: number;
}

export class UnidadDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Nulo solo en ALMACEN de empresa (TR-RN-004)' })
  sucursal_id!: string | null;

  @ApiProperty({ enum: TIPOS_UNIDAD })
  tipo!: string;

  @ApiProperty({ example: 'CAJA-01' })
  codigo!: string;

  @ApiProperty({ example: 'Caja 1' })
  nombre!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  padre_id!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  atributos!: Record<string, unknown>;

  @ApiProperty()
  activo!: boolean;

  @ApiProperty()
  version!: number;
}

export class ListadoEmpresasDto {
  @ApiProperty({ type: [EmpresaDto] })
  items!: EmpresaDto[];

  @ApiProperty()
  total!: number;
}

export class ListadoSucursalesDto {
  @ApiProperty({ type: [SucursalDto] })
  items!: SucursalDto[];

  @ApiProperty()
  total!: number;
}

export class ListadoUnidadesDto {
  @ApiProperty({ type: [UnidadDto] })
  items!: UnidadDto[];

  @ApiProperty()
  total!: number;
}

export class RegistrarEmpresaDto {
  @ApiProperty({ example: '20512345671', description: '11 dígitos con dígito verificador de SUNAT' })
  ruc!: string;

  @ApiProperty({ example: 'Sabores del Sur SAC' })
  razon_social!: string;

  @ApiPropertyOptional({ nullable: true })
  nombre_comercial?: string | null;

  @ApiPropertyOptional({ nullable: true })
  direccion_fiscal?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '040101' })
  ubigeo?: string | null;
}

export class EditarEmpresaDto {
  @ApiProperty({ description: 'La que devolvió la lista' })
  version!: number;

  @ApiProperty()
  razon_social!: string;

  @ApiPropertyOptional({ nullable: true })
  nombre_comercial?: string | null;

  @ApiPropertyOptional({ nullable: true })
  direccion_fiscal?: string | null;

  @ApiPropertyOptional({ nullable: true })
  ubigeo?: string | null;
}

export class EmpresaRegistradaDto {
  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiProperty({ format: 'uuid', description: 'Sucursal principal, establecimiento 0000' })
  sucursal_principal_id!: string;
}

export class RegistrarSucursalDto {
  @ApiProperty({ example: 'CAYMA' })
  codigo!: string;

  @ApiProperty({ example: 'Cayma' })
  nombre!: string;

  @ApiPropertyOptional({ nullable: true, example: '0002' })
  codigo_establecimiento_sunat?: string | null;

  @ApiPropertyOptional({ nullable: true })
  direccion?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '040103' })
  ubigeo?: string | null;

  @ApiPropertyOptional({ nullable: true })
  telefono?: string | null;

  @ApiPropertyOptional({ default: ZONA_HORARIA_DEFECTO, description: 'Zona IANA' })
  zona_horaria?: string;
}

export class EditarSucursalDto extends RegistrarSucursalDto {
  @ApiProperty({ description: 'La que devolvió la lista' })
  version!: number;

  @ApiPropertyOptional({ description: 'true reactiva (exige cupo del plan), false inactiva; sin valor no cambia' })
  activo?: boolean;
}

export class SucursalRegistradaDto {
  @ApiProperty({ format: 'uuid' })
  sucursal_id!: string;
}

export class RegistrarUnidadDto {
  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Obligatoria salvo en ALMACEN (TR-RN-004)' })
  sucursal_id?: string | null;

  @ApiProperty({ enum: TIPOS_UNIDAD })
  tipo!: string;

  @ApiProperty({ example: 'CAJA-01' })
  codigo!: string;

  @ApiProperty({ example: 'Caja 1' })
  nombre!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'De la misma empresa' })
  padre_id?: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, default: {} })
  atributos?: Record<string, unknown>;
}

export class EditarUnidadDto {
  @ApiProperty({ description: 'La que devolvió la lista' })
  version!: number;

  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  nombre!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  padre_id?: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, default: {} })
  atributos?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'true reactiva, false inactiva; sin valor no cambia' })
  activo?: boolean;
}

export class UnidadRegistradaDto {
  @ApiProperty({ format: 'uuid' })
  unidad_id!: string;
}

export function listadoDto<T, D>(listado: Listado<T>, mapear: (item: T) => D): { items: D[]; total: number } {
  return { items: listado.items.map(mapear), total: listado.total };
}

export function empresaDto(empresa: EmpresaListada): EmpresaDto {
  return {
    id: empresa.id,
    ruc: empresa.ruc,
    razon_social: empresa.razonSocial,
    nombre_comercial: empresa.nombreComercial,
    direccion_fiscal: empresa.direccionFiscal,
    ubigeo: empresa.ubigeo,
    activo: empresa.activo,
    version: empresa.version,
  };
}

export function sucursalDto(sucursal: SucursalListada): SucursalDto {
  return {
    id: sucursal.id,
    empresa_id: sucursal.empresaId,
    codigo: sucursal.codigo,
    nombre: sucursal.nombre,
    codigo_establecimiento_sunat: sucursal.codigoEstablecimientoSunat,
    direccion: sucursal.direccion,
    ubigeo: sucursal.ubigeo,
    telefono: sucursal.telefono,
    zona_horaria: sucursal.zonaHoraria,
    es_principal: sucursal.esPrincipal,
    activo: sucursal.activo,
    version: sucursal.version,
  };
}

export function unidadDto(unidad: UnidadListada): UnidadDto {
  return {
    id: unidad.id,
    empresa_id: unidad.empresaId,
    sucursal_id: unidad.sucursalId,
    tipo: unidad.tipo,
    codigo: unidad.codigo,
    nombre: unidad.nombre,
    padre_id: unidad.padreId,
    atributos: unidad.atributos,
    activo: unidad.activo,
    version: unidad.version,
  };
}
