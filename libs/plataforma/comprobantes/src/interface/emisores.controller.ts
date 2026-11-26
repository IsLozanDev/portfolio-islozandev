import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Res, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { BYTES_MAXIMOS_CERTIFICADO, CargarCertificado } from '../application/cargar-certificado.js';
import { ConfigurarEmisor } from '../application/configurar-emisor.js';
import { ConsultarEmisor } from '../application/consultar-emisor.js';
import { HabilitarProduccion } from '../application/habilitar-produccion.js';
import { ListarEmisores } from '../application/listar-emisores.js';
import { SolicitarPruebaEmisor } from '../application/solicitar-prueba-emisor.js';
import { LARGO_MAXIMO_LEYENDA, LARGO_MAXIMO_PROVEEDOR, LARGO_MAXIMO_URL, LARGO_MAXIMO_USUARIO } from '../domain/emisor.js';
import { PERMISOS_FE } from '../domain/permisos-fe.js';
import { REGIMENES_IGV } from '../domain/regimen-igv.js';
import { CargarCertificadoDto, ConfigurarEmisorDto, EmisorDto, EmpresaConEmisorDto, ErrorFeDto, emisorDto, empresaConEmisorDto } from './emisores.dto.js';
import { CertificadoGrandeFiltro, ComprobantesFiltro, solicitudInvalida, validar } from './emisores.http.js';

/** Cotas de entrada: el formato real de cada campo lo valida el dominio, con su código de error. */
const LARGO_MAXIMO_CLAVE = 200;
const CAMPO_ARCHIVO = 'archivo';
/** En memoria y sin `dest`: el .pfx nunca toca el disco. Un archivo y un campo de texto (la clave). */
const LIMITES_MULTIPART = { fileSize: BYTES_MAXIMOS_CERTIFICADO, files: 1, fields: 1 };

const EsquemaEmpresa = z.object({ empresaId: z.uuid() });
const EsquemaConfigurar = z.object({
  proveedor: z.string().min(1).max(LARGO_MAXIMO_PROVEEDOR),
  usuario_proveedor: z.string().min(1).max(LARGO_MAXIMO_USUARIO),
  clave: z.string().min(1).max(LARGO_MAXIMO_CLAVE).optional(),
  regimen_igv: z.enum(REGIMENES_IGV),
  leyenda_pie: z.string().max(LARGO_MAXIMO_LEYENDA).nullable().optional(),
  url_proveedor: z.string().min(1).max(LARGO_MAXIMO_URL).nullable().optional(),
  version: z.number().int().positive().optional(),
});
const EsquemaCertificado = z.object({ clave: z.string().min(1).max(LARGO_MAXIMO_CLAVE) });

/** Lo que deja multer en memoria. */
interface ArchivoSubido {
  buffer: Buffer;
}

interface RespuestaConEstado {
  status(codigo: number): unknown;
}

const PASO_SENSIBLE = 'TOKEN_INVALIDO o MFA_REQUERIDA: `plat.fe.configurar` es sensible y exige aal2 (TR-RN-009)';
const EMPRESA_O_EMISOR = 'EMPRESA_NO_ENCONTRADA (también si es de otro tenant) o EMISOR_NO_ENCONTRADO';
const PARAMETRO_EMPRESA = { name: 'empresaId', format: 'uuid' } as const;
const EMISOR_DE_OTRO_TENANT = 'EMISOR_NO_ENCONTRADO, también si la empresa es de otro tenant';

/** TR-RF-052: el emisor electrónico de cada empresa, su prueba en beta y su paso a producción. Ninguna respuesta lleva claves, token ni el .pfx. */
@ApiTags('facturacion-electronica')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@UseFilters(ComprobantesFiltro, CertificadoGrandeFiltro)
@Controller('fe/emisores')
export class EmisoresController {
  constructor(
    @Inject(ConsultarEmisor) private readonly consultarEmisor: ConsultarEmisor,
    @Inject(ConfigurarEmisor) private readonly configurarEmisor: ConfigurarEmisor,
    @Inject(CargarCertificado) private readonly cargarCertificado: CargarCertificado,
    @Inject(SolicitarPruebaEmisor) private readonly solicitarPruebaEmisor: SolicitarPruebaEmisor,
    @Inject(HabilitarProduccion) private readonly habilitarProduccion: HabilitarProduccion,
    @Inject(ListarEmisores) private readonly listarEmisores: ListarEmisores,
  ) {}

  @Get()
  @Permiso(PERMISOS_FE.consultar)
  @ApiOkResponse({
    type: EmpresaConEmisorDto,
    isArray: true,
    description: 'Las empresas activas del tenant por razón social, con el resumen de su emisor o null',
  })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
  async listar(): Promise<EmpresaConEmisorDto[]> {
    return (await this.listarEmisores.ejecutar()).map(empresaConEmisorDto);
  }

  @Get(':empresaId')
  @ApiParam(PARAMETRO_EMPRESA)
  @Permiso(PERMISOS_FE.consultar)
  @ApiOkResponse({ type: EmisorDto, description: 'El emisor sin secretos' })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (empresaId no es uuid)' })
  @ApiNotFoundResponse({ type: ErrorFeDto, description: 'EMISOR_NO_ENCONTRADO, también si la empresa es de otro tenant' })
  async consultar(@Param() parametros: unknown): Promise<EmisorDto> {
    const { empresaId } = validar(EsquemaEmpresa, parametros);
    return emisorDto(await this.consultarEmisor.ejecutar(empresaId));
  }

  @Put(':empresaId')
  @ApiParam(PARAMETRO_EMPRESA)
  @Permiso(PERMISOS_FE.configurar)
  @ApiBody({ type: ConfigurarEmisorDto })
  @ApiOkResponse({ type: EmisorDto, description: 'Emisor actualizado' })
  @ApiCreatedResponse({ type: EmisorDto, description: 'Emisor creado en BORRADOR o CONFIGURADO' })
  @ApiUnauthorizedResponse({ description: PASO_SENSIBLE })
  @ApiBadRequestResponse({
    type: ErrorFeDto,
    description:
      'SOLICITUD_INVALIDA, PROVEEDOR_FE_INVALIDO (también SIMULADO con FE_SIMULADO_PERMITIDO=false), DATOS_EMISOR_INVALIDOS o ' +
      'URL_PROVEEDOR_NO_PERMITIDA (falta, no es https, tiene credenciales u otro puerto, o su dominio no está permitido)',
  })
  @ApiNotFoundResponse({ type: ErrorFeDto, description: 'EMPRESA_NO_ENCONTRADA, también si es de otro tenant' })
  @ApiConflictResponse({
    type: ErrorFeDto,
    description: 'VERSION_OBSOLETA (falta la versión o cambió), EMPRESA_INACTIVA o EMISOR_EN_PRODUCCION (cambio de proveedor o URL)',
  })
  @ApiServiceUnavailableResponse({ type: ErrorFeDto, description: 'BOVEDA_NO_CONFIGURADA: el servidor no tiene claves maestras' })
  async configurar(
    @Param() parametros: unknown,
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) respuesta: RespuestaConEstado,
  ): Promise<EmisorDto> {
    const { empresaId } = validar(EsquemaEmpresa, parametros);
    const datos = validar(EsquemaConfigurar, cuerpo);
    const { vista, creado } = await this.configurarEmisor.ejecutar({
      empresaId,
      proveedor: datos.proveedor,
      usuarioProveedor: datos.usuario_proveedor,
      clave: datos.clave,
      regimenIgv: datos.regimen_igv,
      leyendaPie: datos.leyenda_pie,
      urlProveedor: datos.url_proveedor,
      version: datos.version,
    });
    respuesta.status(creado ? HttpStatus.CREATED : HttpStatus.OK);
    return emisorDto(vista);
  }

  @Post(':empresaId/certificado')
  @ApiParam(PARAMETRO_EMPRESA)
  @HttpCode(HttpStatus.OK)
  @Permiso(PERMISOS_FE.configurar)
  @UseInterceptors(FileInterceptor(CAMPO_ARCHIVO, { limits: LIMITES_MULTIPART }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CargarCertificadoDto })
  @ApiOkResponse({ type: EmisorDto, description: 'Certificado guardado en la bóveda; el emisor queda CONFIGURADO si está completo' })
  @ApiUnauthorizedResponse({ description: PASO_SENSIBLE })
  @ApiBadRequestResponse({
    type: ErrorFeDto,
    description: 'SOLICITUD_INVALIDA, ARCHIVO_CERTIFICADO_INVALIDO, CLAVE_CERTIFICADO_INCORRECTA o CERTIFICADO_SIN_RUC',
  })
  @ApiNotFoundResponse({ type: ErrorFeDto, description: EMPRESA_O_EMISOR })
  @ApiConflictResponse({ type: ErrorFeDto, description: 'VERSION_OBSOLETA (otra operación cambió el emisor) o EMPRESA_INACTIVA' })
  @ApiPayloadTooLargeResponse({ type: ErrorFeDto, description: 'ARCHIVO_DEMASIADO_GRANDE: más de 50 KB' })
  @ApiUnprocessableEntityResponse({ type: ErrorFeDto, description: 'CERTIFICADO_OTRO_RUC, CERTIFICADO_VENCIDO o CERTIFICADO_NO_VIGENTE' })
  @ApiServiceUnavailableResponse({ type: ErrorFeDto, description: 'BOVEDA_NO_CONFIGURADA: el servidor no tiene claves maestras' })
  async cargar(@Param() parametros: unknown, @UploadedFile() archivo: ArchivoSubido | undefined, @Body() cuerpo: unknown): Promise<EmisorDto> {
    const { empresaId } = validar(EsquemaEmpresa, parametros);
    const { clave } = validar(EsquemaCertificado, cuerpo);
    if (!archivo) throw solicitudInvalida([CAMPO_ARCHIVO]);
    return emisorDto(await this.cargarCertificado.ejecutar({ empresaId, pfx: new Uint8Array(archivo.buffer), clave }));
  }

  @Post(':empresaId/prueba')
  @ApiParam(PARAMETRO_EMPRESA)
  @HttpCode(HttpStatus.ACCEPTED)
  @Permiso(PERMISOS_FE.configurar)
  @ApiAcceptedResponse({
    type: EmisorDto,
    description: 'Prueba en beta solicitada (prueba.estado = EN_PROCESO); el worker la envía al PSE. Consultar con GET hasta que deje EN_PROCESO',
  })
  @ApiUnauthorizedResponse({ description: PASO_SENSIBLE })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (empresaId no es uuid)' })
  @ApiNotFoundResponse({ type: ErrorFeDto, description: EMISOR_DE_OTRO_TENANT })
  @ApiConflictResponse({
    type: ErrorFeDto,
    description: 'ESTADO_EMISOR_INVALIDO (no está CONFIGURADO ni VERIFICADO), PRUEBA_EN_CURSO (otra de menos de 10 min) o VERSION_OBSOLETA',
  })
  async solicitarPrueba(@Param() parametros: unknown): Promise<EmisorDto> {
    const { empresaId } = validar(EsquemaEmpresa, parametros);
    return emisorDto(await this.solicitarPruebaEmisor.ejecutar(empresaId));
  }

  @Post(':empresaId/produccion')
  @ApiParam(PARAMETRO_EMPRESA)
  @HttpCode(HttpStatus.OK)
  @Permiso(PERMISOS_FE.configurar)
  @ApiOkResponse({ type: EmisorDto, description: 'Emisor en PRODUCCION (estado y ambiente)' })
  @ApiUnauthorizedResponse({ description: PASO_SENSIBLE })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (empresaId no es uuid)' })
  @ApiNotFoundResponse({ type: ErrorFeDto, description: EMISOR_DE_OTRO_TENANT })
  @ApiConflictResponse({
    type: ErrorFeDto,
    description:
      'PRODUCCION_NO_PERMITIDA (FE_PRODUCCION_PERMITIDA=false), PROVEEDOR_SIMULADO_EN_PRODUCCION, ' +
      'PRUEBA_BETA_REQUERIDA (sin prueba aceptada en las últimas 24 h) o VERSION_OBSOLETA',
  })
  @ApiUnprocessableEntityResponse({ type: ErrorFeDto, description: 'CERTIFICADO_VENCIDO: el proveedor exige certificado y no hay uno vigente' })
  async pasarAProduccion(@Param() parametros: unknown): Promise<EmisorDto> {
    const { empresaId } = validar(EsquemaEmpresa, parametros);
    return emisorDto(await this.habilitarProduccion.ejecutar(empresaId));
  }
}
