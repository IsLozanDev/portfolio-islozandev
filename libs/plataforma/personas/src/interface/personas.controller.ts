import { Body, Controller, Get, HttpStatus, Inject, Param, Patch, Post, Query, Req, Res, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PRODUCTOS } from '@vitrina/plataforma/org';
import { Permiso, type ContextoAutorizado } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ActualizarDatosBasicos } from '../application/actualizar-datos-basicos.js';
import { AsignarRolPersona } from '../application/asignar-rol.js';
import { BuscarPersonaPorDocumento } from '../application/buscar-persona.js';
import { BuscarPersonas, TAMANO_PAGINA_PERSONAS } from '../application/buscar-personas.js';
import { ObtenerPersona } from '../application/obtener-persona.js';
import { RegistrarPersona } from '../application/registrar-persona.js';
import { PERMISOS_PER } from '../domain/permisos-per.js';
import { TIPOS_PERSONA } from '../domain/persona.js';
import { ROLES_PERSONA } from '../domain/rol-persona.js';
import {
  EsquemaPersonaId,
  LONGITUD_MAXIMA_NUMERO,
  LONGITUD_MAXIMA_TIPO,
  texto,
  textoOpcional,
  versionLeida,
} from './esquemas.js';
import {
  ActualizarDatosBasicosDto,
  AsignarRolDto,
  BusquedaDto,
  ErrorPersonaDto,
  ListadoPersonasDto,
  PersonaDetalleDto,
  RegistrarPersonaDto,
  RolAsignadoDto,
  busquedaDto,
  listadoPersonasDto,
  personaDetalleDto,
} from './personas.dto.js';
import { PersonasFiltro, validar } from './personas.http.js';

const LONGITUD_MAXIMA_CONSULTA = 100;
const PRIMERA_PAGINA = 1;
const EsquemaListado = z.object({
  q: texto(LONGITUD_MAXIMA_CONSULTA).optional(),
  tipo_persona: z.enum(TIPOS_PERSONA).optional(),
  producto: z.enum(PRODUCTOS).optional(),
  rol: z.enum(ROLES_PERSONA).optional(),
  pagina: z.coerce.number().int().min(PRIMERA_PAGINA).default(PRIMERA_PAGINA),
  tamano: z.coerce.number().int().min(1).max(TAMANO_PAGINA_PERSONAS.maximo).default(TAMANO_PAGINA_PERSONAS.porDefecto),
});
const EsquemaBusqueda = z.object({ tipo: texto(LONGITUD_MAXIMA_TIPO), numero: texto(LONGITUD_MAXIMA_NUMERO) });
const EsquemaRegistro = z.object({
  tipo_persona: z.enum(TIPOS_PERSONA),
  tipo_documento: texto(LONGITUD_MAXIMA_TIPO),
  numero_documento: texto(LONGITUD_MAXIMA_NUMERO),
  nombres: textoOpcional,
  apellido_paterno: textoOpcional,
  apellido_materno: textoOpcional,
  razon_social: textoOpcional,
  celular: texto(LONGITUD_MAXIMA_NUMERO),
  correo: textoOpcional,
});
const EsquemaRol = z.object({ producto_codigo: z.enum(PRODUCTOS), rol: z.enum(ROLES_PERSONA) });
/** Estricto: enviar el documento o el tipo de persona da 400 en vez de ignorarse en silencio. */
const EsquemaDatosBasicos = z.strictObject({
  version: versionLeida,
  nombres: textoOpcional,
  apellido_paterno: textoOpcional,
  apellido_materno: textoOpcional,
  razon_social: textoOpcional,
});

interface SolicitudAutorizada {
  /** Lo deja PermisoGuard con los permisos efectivos del usuario. */
  contexto?: ContextoAutorizado;
}

interface RespuestaConEstado {
  status(codigo: number): unknown;
}

/** TR-RF-039, 040 y la edición de datos básicos de TR-RF-041. */
@ApiTags('personas')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (campos faltantes, demasiado largos o fuera de lista)' })
@UseFilters(PersonasFiltro)
@Controller('personas')
export class PersonasController {
  constructor(
    @Inject(BuscarPersonas) private readonly buscarPersonas: BuscarPersonas,
    @Inject(BuscarPersonaPorDocumento) private readonly buscarPorDocumento: BuscarPersonaPorDocumento,
    @Inject(RegistrarPersona) private readonly registrarPersona: RegistrarPersona,
    @Inject(ObtenerPersona) private readonly obtenerPersona: ObtenerPersona,
    @Inject(AsignarRolPersona) private readonly asignarRolPersona: AsignarRolPersona,
    @Inject(ActualizarDatosBasicos) private readonly actualizarDatosBasicos: ActualizarDatosBasicos,
  ) {}

  @Get()
  @Permiso(PERMISOS_PER.leer)
  @ApiQuery({ name: 'q', required: false, description: 'Nombre o razón social (sin tildes, tolerante a errores y fonético), documento o celular por prefijo, o correo' })
  @ApiQuery({ name: 'tipo_persona', required: false, enum: TIPOS_PERSONA })
  @ApiQuery({ name: 'producto', required: false, enum: PRODUCTOS, description: 'Con un rol vigente en ese producto' })
  @ApiQuery({ name: 'rol', required: false, enum: ROLES_PERSONA, description: 'Con ese rol vigente' })
  @ApiQuery({ name: 'pagina', required: false, example: PRIMERA_PAGINA, description: 'Desde 1' })
  @ApiQuery({ name: 'tamano', required: false, example: TAMANO_PAGINA_PERSONAS.porDefecto, description: `De 1 a ${TAMANO_PAGINA_PERSONAS.maximo}` })
  @ApiOkResponse({ type: ListadoPersonasDto, description: 'Por relevancia y luego por apellidos o razón social; sin `q`, por denominación' })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: 'CONSULTA_MUY_CORTA: menos de 3 letras o de 4 dígitos' })
  async listar(@Query() consulta: unknown): Promise<ListadoPersonasDto> {
    const { q, tipo_persona: tipoPersona, producto, rol, pagina, tamano } = validar(EsquemaListado, consulta);
    return listadoPersonasDto(await this.buscarPersonas.ejecutar({ q, tipoPersona, producto, rol, pagina, tamano }));
  }

  @Get('busqueda')
  @Permiso(PERMISOS_PER.leer)
  @ApiQuery({ name: 'tipo', example: 'DNI', description: 'DNI, CE, RUC o PASAPORTE' })
  @ApiQuery({ name: 'numero', example: '45781236' })
  @ApiOkResponse({
    type: BusquedaDto,
    description:
      'La persona del tenant o, si no existe, el prellenado de TR-IDN (solo DNI y RUC, y solo con plat.persona.registrar). ' +
      'Un fallo de TR-IDN llega como `aviso`, nunca como error. Los apellidos se separan por el primer espacio: revisar los compuestos.',
  })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: 'DOCUMENTO_INVALIDO (con motivo) o TIPO_DOCUMENTO_NO_ADMITIDO' })
  async buscar(@Query() consulta: unknown, @Req() solicitud: SolicitudAutorizada): Promise<BusquedaDto> {
    const { tipo, numero } = validar(EsquemaBusqueda, consulta);
    const puedePrellenar = solicitud.contexto?.permisos.includes(PERMISOS_PER.registrar) ?? false;
    return busquedaDto(await this.buscarPorDocumento.ejecutar({ tipo, numero, puedePrellenar }));
  }

  @Post()
  @Permiso(PERMISOS_PER.registrar)
  @ApiBody({ type: RegistrarPersonaDto })
  @ApiCreatedResponse({ type: PersonaDetalleDto, description: 'La persona con su celular y su correo principales' })
  @ApiUnprocessableEntityResponse({
    type: ErrorPersonaDto,
    description: 'DOCUMENTO_INVALIDO, TIPO_DOCUMENTO_NO_ADMITIDO, TIPO_PERSONA_INCOHERENTE, CONTACTO_INVALIDO o validation_error (nombres)',
  })
  @ApiConflictResponse({ type: ErrorPersonaDto, description: 'PERSONA_DUPLICADA, con el `persona_id` existente' })
  async registrar(@Body() cuerpo: unknown): Promise<PersonaDetalleDto> {
    const datos = validar(EsquemaRegistro, cuerpo);
    const persona = await this.registrarPersona.ejecutar({
      tipoPersona: datos.tipo_persona,
      tipoDocumento: datos.tipo_documento,
      numeroDocumento: datos.numero_documento,
      nombres: datos.nombres,
      apellidoPaterno: datos.apellido_paterno,
      apellidoMaterno: datos.apellido_materno,
      razonSocial: datos.razon_social,
      celular: datos.celular,
      correo: datos.correo,
    });
    return personaDetalleDto(persona);
  }

  @Get(':id')
  @Permiso(PERMISOS_PER.leer)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PersonaDetalleDto })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: 'NO_ENCONTRADA, también si es de otro tenant' })
  async obtener(@Param() parametros: unknown): Promise<PersonaDetalleDto> {
    const { id } = validar(EsquemaPersonaId, parametros);
    return personaDetalleDto(await this.obtenerPersona.ejecutar(id));
  }

  @Patch(':id')
  @Permiso(PERMISOS_PER.editar)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ActualizarDatosBasicosDto })
  @ApiOkResponse({
    type: PersonaDetalleDto,
    description: 'La persona con su versión nueva; si nada cambió, la misma versión. El documento y el tipo de persona no se editan',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorPersonaDto,
    description: 'TIPO_PERSONA_INCOHERENTE (razón social en NATURAL o nombres en JURIDICA) o validation_error (nombres)',
  })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: 'NO_ENCONTRADA, también si es de otro tenant' })
  @ApiConflictResponse({ type: ErrorPersonaDto, description: 'VERSION_OBSOLETA, o conflict si otra operación cambió la persona' })
  async actualizar(@Param() parametros: unknown, @Body() cuerpo: unknown): Promise<PersonaDetalleDto> {
    const { id } = validar(EsquemaPersonaId, parametros);
    const datos = validar(EsquemaDatosBasicos, cuerpo);
    const persona = await this.actualizarDatosBasicos.ejecutar({
      personaId: id,
      version: datos.version,
      nombres: datos.nombres,
      apellidoPaterno: datos.apellido_paterno,
      apellidoMaterno: datos.apellido_materno,
      razonSocial: datos.razon_social,
    });
    return personaDetalleDto(persona);
  }

  @Post(':id/roles')
  @Permiso(PERMISOS_PER.rol)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AsignarRolDto })
  @ApiCreatedResponse({ type: RolAsignadoDto, description: 'Rol asignado desde hoy (Lima)' })
  @ApiOkResponse({ type: RolAsignadoDto, description: 'El rol ya estaba vigente: sin cambios' })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: 'PRODUCTO_NO_SUSCRITO' })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: 'NO_ENCONTRADA, también si es de otro tenant' })
  @ApiConflictResponse({ type: ErrorPersonaDto, description: 'conflict: otra operación cambió la persona' })
  async asignarRol(
    @Param() parametros: unknown,
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) respuesta: RespuestaConEstado,
  ): Promise<RolAsignadoDto> {
    const { id } = validar(EsquemaPersonaId, parametros);
    const { producto_codigo: productoCodigo, rol } = validar(EsquemaRol, cuerpo);
    const resultado = await this.asignarRolPersona.ejecutar({ personaId: id, productoCodigo, rol });
    respuesta.status(resultado.asignado ? HttpStatus.CREATED : HttpStatus.OK);
    return resultado;
  }
}
