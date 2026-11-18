import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Query, Req, Res, UseFilters } from '@nestjs/common';
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
import { AsignarRolPersona } from '../application/asignar-rol.js';
import { BuscarPersonaPorDocumento } from '../application/buscar-persona.js';
import { ObtenerPersona } from '../application/obtener-persona.js';
import { RegistrarPersona } from '../application/registrar-persona.js';
import { PERMISOS_PER } from '../domain/permisos-per.js';
import { TIPOS_PERSONA } from '../domain/persona.js';
import { ROLES_PERSONA } from '../domain/rol-persona.js';
import {
  AsignarRolDto,
  BusquedaDto,
  ErrorPersonaDto,
  PersonaDetalleDto,
  RegistrarPersonaDto,
  RolAsignadoDto,
  busquedaDto,
  personaDetalleDto,
} from './personas.dto.js';
import { PersonasFiltro, validar } from './personas.http.js';

/** Cotas de entrada: el formato y las longitudes reales los valida el dominio, con su código de error. */
const LONGITUD_MAXIMA_TIPO = 20;
const LONGITUD_MAXIMA_NUMERO = 20;
const LONGITUD_MAXIMA_TEXTO = 300;

const texto = (maximo: number) => z.string().max(maximo);
const textoOpcional = texto(LONGITUD_MAXIMA_TEXTO).nullish();

const EsquemaBusqueda = z.object({ tipo: texto(LONGITUD_MAXIMA_TIPO), numero: texto(LONGITUD_MAXIMA_NUMERO) });
const EsquemaPersonaId = z.object({ id: z.uuid() });
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

interface SolicitudAutorizada {
  /** Lo deja PermisoGuard con los permisos efectivos del usuario. */
  contexto?: ContextoAutorizado;
}

interface RespuestaConEstado {
  status(codigo: number): unknown;
}

/** TR-RF-039 y 040. */
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
    @Inject(BuscarPersonaPorDocumento) private readonly buscarPorDocumento: BuscarPersonaPorDocumento,
    @Inject(RegistrarPersona) private readonly registrarPersona: RegistrarPersona,
    @Inject(ObtenerPersona) private readonly obtenerPersona: ObtenerPersona,
    @Inject(AsignarRolPersona) private readonly asignarRolPersona: AsignarRolPersona,
  ) {}

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
