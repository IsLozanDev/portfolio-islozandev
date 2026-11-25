import { Body, Controller, Get, Headers, HttpStatus, Inject, Param, Post, Res, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { ConsultarComprobante } from '../application/consultar-comprobante.js';
import { EmitirComprobanteAuditado } from '../application/emitir-comprobante-auditado.js';
import type { EmitirComprobanteComando } from '../application/ports/comprobante.port.js';
import {
  LARGO_MAXIMO_CORREO_ADQUIRENTE,
  LARGO_MAXIMO_NOMBRE_ADQUIRENTE,
  LARGO_MAXIMO_NUMERO_DOCUMENTO,
  LARGO_MAXIMO_TIPO_DOCUMENTO,
} from '../domain/comprobante/adquirente.js';
import { FORMAS_PAGO, MODOS_ENVIO, MONEDAS, TIPOS_COMPROBANTE } from '../domain/comprobante/tipo-comprobante.js';
import { PERMISOS_FE } from '../domain/permisos-fe.js';
import { ComprobanteDetalleDto, ComprobanteEmitidoDto, EmitirComprobanteDto, comprobanteDetalleDto, comprobanteEmitidoDto } from './comprobantes.dto.js';
import { ErrorFeDto } from './emisores.dto.js';
import { ComprobantesFiltro, validar } from './emisores.http.js';

/** Cotas de entrada, iguales a las columnas de fe.comprobante y sus líneas; el contenido lo valida el dominio. */
const LINEAS_MAXIMAS = 500;
const CUOTAS_MAXIMAS = 60;
const LARGO_MAXIMO_CODIGO = 30;
const LARGO_MAXIMO_DESCRIPCION = 500;
const LARGO_MAXIMO_UNIDAD = 3;
const LARGO_AFECTACION = 2;
const LARGO_MAXIMO_SERIE = 4;
const LARGO_MAXIMO_PRODUCTO = 10;
const LARGO_MAXIMO_ORIGEN = 100;
const CABECERA_IDEMPOTENCIA = 'idempotency-key';

const monto = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const unitario = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/);
const texto = (largoMaximo: number) => z.string().trim().min(1).max(largoMaximo);

const EsquemaEmision = z.object({
  tipo: z.enum(TIPOS_COMPROBANTE),
  empresa_id: z.uuid(),
  sucursal_id: z.uuid(),
  serie: z.string().length(LARGO_MAXIMO_SERIE).optional(),
  moneda: z.enum(MONEDAS),
  forma_pago: z.enum(FORMAS_PAGO),
  cuotas: z.array(z.object({ monto, fecha_vencimiento: z.iso.date() })).max(CUOTAS_MAXIMAS).optional(),
  adquirente: z
    .object({
      tipo_documento: texto(LARGO_MAXIMO_TIPO_DOCUMENTO),
      numero: texto(LARGO_MAXIMO_NUMERO_DOCUMENTO),
      nombre: texto(LARGO_MAXIMO_NOMBRE_ADQUIRENTE),
      correo: z.email().max(LARGO_MAXIMO_CORREO_ADQUIRENTE).optional(),
      persona_id: z.uuid().optional(),
    })
    .optional(),
  lineas: z
    .array(
      z.object({
        codigo: texto(LARGO_MAXIMO_CODIGO).optional(),
        descripcion: texto(LARGO_MAXIMO_DESCRIPCION),
        unidad: texto(LARGO_MAXIMO_UNIDAD),
        cantidad: unitario.refine((valor) => Number(valor) > 0),
        valor_unitario: unitario,
        afectacion_igv: z.string().length(LARGO_AFECTACION),
      }),
    )
    .min(1)
    .max(LINEAS_MAXIMAS),
  total_esperado: monto.optional(),
  modo_envio: z.enum(MODOS_ENVIO).optional(),
  origen: z.object({ producto: texto(LARGO_MAXIMO_PRODUCTO), id: texto(LARGO_MAXIMO_ORIGEN) }).optional(),
});
const EsquemaClave = z.uuid();
const EsquemaId = z.object({ id: z.uuid() });

type CuerpoEmision = z.infer<typeof EsquemaEmision>;

interface RespuestaConEstado {
  status(codigo: number): unknown;
}

function comandoDe(cuerpo: CuerpoEmision, claveIdempotencia: string): EmitirComprobanteComando {
  const { adquirente } = cuerpo;
  return {
    tipo: cuerpo.tipo,
    empresaId: cuerpo.empresa_id,
    sucursalId: cuerpo.sucursal_id,
    serie: cuerpo.serie,
    moneda: cuerpo.moneda,
    formaPago: cuerpo.forma_pago,
    cuotas: cuerpo.cuotas?.map((cuota) => ({ monto: cuota.monto, fechaVencimiento: cuota.fecha_vencimiento })),
    adquirente: adquirente && {
      tipoDocumento: adquirente.tipo_documento,
      numero: adquirente.numero,
      nombre: adquirente.nombre,
      correo: adquirente.correo,
      personaId: adquirente.persona_id,
    },
    lineas: cuerpo.lineas.map((linea) => ({
      codigo: linea.codigo,
      descripcion: linea.descripcion,
      unidad: linea.unidad,
      cantidad: linea.cantidad,
      valorUnitario: linea.valor_unitario,
      afectacionIgv: linea.afectacion_igv,
    })),
    totalEsperado: cuerpo.total_esperado,
    modoEnvio: cuerpo.modo_envio,
    origen: cuerpo.origen,
    claveIdempotencia,
  };
}

const EJEMPLO_FACTURA = {
  tipo: 'FACTURA',
  empresa_id: '0195f0a2-6c1e-7b3a-9d4e-1a2b3c4d5e6f',
  sucursal_id: '0195f0a2-6c1e-7b3a-9d4e-1a2b3c4d5e70',
  moneda: 'PEN',
  forma_pago: 'CONTADO',
  adquirente: { tipo_documento: 'RUC', numero: '20512345671', nombre: 'CLIENTE EJEMPLO SAC' },
  lineas: [
    { descripcion: 'Servicio de catering', unidad: 'ZZ', cantidad: '1', valor_unitario: '60.00', afectacion_igv: '10' },
    { descripcion: 'Bebidas', unidad: 'NIU', cantidad: '4', valor_unitario: '10.00', afectacion_igv: '10' },
  ],
  total_esperado: '118.00',
};
const EJEMPLO_BOLETA = {
  tipo: 'BOLETA',
  empresa_id: '0195f0a2-6c1e-7b3a-9d4e-1a2b3c4d5e6f',
  sucursal_id: '0195f0a2-6c1e-7b3a-9d4e-1a2b3c4d5e70',
  moneda: 'PEN',
  forma_pago: 'CONTADO',
  lineas: [{ descripcion: 'Menú ejecutivo', unidad: 'NIU', cantidad: '1', valor_unitario: '38.56', afectacion_igv: '10' }],
};

/** TR-RF-053 y 054: boleta y factura para productos externos (los del monorepo usan COMPROBANTE_PORT en proceso). */
@ApiTags('facturacion-electronica')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiExtraModels(EmitirComprobanteDto)
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO (falta plat.fe.emitir) o SUCURSAL_NO_ASIGNADA' })
@UseFilters(ComprobantesFiltro)
@Controller('fe/comprobantes')
export class ComprobantesController {
  constructor(
    @Inject(EmitirComprobanteAuditado) private readonly emitirComprobante: EmitirComprobanteAuditado,
    @Inject(ConsultarComprobante) private readonly consultarComprobante: ConsultarComprobante,
  ) {}

  @Post()
  @Permiso(PERMISOS_FE.emitir)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'uuid. La misma clave con el mismo contenido devuelve el comprobante (200)' })
  @ApiBody({ type: EmitirComprobanteDto, examples: { factura: { value: EJEMPLO_FACTURA }, boleta: { value: EJEMPLO_BOLETA } } })
  @ApiCreatedResponse({ type: ComprobanteEmitidoDto, description: 'Numerado con SEQ y en PENDIENTE_ENVIO; el envío al PSE es asíncrono (spec 52)' })
  @ApiOkResponse({ type: ComprobanteEmitidoDto, description: 'repetido: la Idempotency-Key ya se usó con el mismo contenido; no consume otro número' })
  @ApiBadRequestResponse({
    type: ErrorFeDto,
    description: 'SOLICITUD_INVALIDA (cuerpo o Idempotency-Key ausente o sin formato uuid) o DATOS_COMPROBANTE_INVALIDOS',
  })
  @ApiNotFoundResponse({
    type: ErrorFeDto,
    description: 'EMISOR_NO_ENCONTRADO (empresa sin emisor o de otro tenant) o SUCURSAL_NO_ENCONTRADA (de otra empresa o tenant)',
  })
  @ApiConflictResponse({
    type: ErrorFeDto,
    description:
      'EMISOR_NO_HABILITADO (no está VERIFICADO ni en PRODUCCION), IDEMPOTENCIA_CONFLICTO (la clave ya se usó con otro contenido) ' +
      'o TASA_IGV_NO_VIGENTE (catálogo sin tasa para el régimen)',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorFeDto,
    description:
      'FACTURA_REQUIERE_RUC, BOLETA_REQUIERE_ADQUIRENTE (sobre el umbral sin documento y nombre), SERIE_NO_CORRESPONDE, ' +
      'SERIE_AMBIGUA («Indique la serie»), CODIGO_SUNAT_INVALIDO (con el campo), CUOTAS_INVALIDAS o TOTAL_NO_COINCIDE. Ninguno consume número',
  })
  async emitir(
    @Body() cuerpo: unknown,
    @Headers(CABECERA_IDEMPOTENCIA) clave: unknown,
    @Res({ passthrough: true }) respuesta: RespuestaConEstado,
  ): Promise<ComprobanteEmitidoDto> {
    const datos = validar(EsquemaEmision, cuerpo);
    const claveIdempotencia = validar(EsquemaClave, clave);
    const emitido = await this.emitirComprobante.ejecutar(comandoDe(datos, claveIdempotencia));
    respuesta.status(emitido.repetido ? HttpStatus.OK : HttpStatus.CREATED);
    return comprobanteEmitidoDto(emitido);
  }

  @Get(':id')
  @Permiso(PERMISOS_FE.emitir)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ComprobanteDetalleDto, description: 'Con líneas, cuotas y advertencias' })
  @ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (id no es uuid)' })
  @ApiNotFoundResponse({ type: ErrorFeDto, description: 'COMPROBANTE_NO_ENCONTRADO, también si es de otro tenant' })
  async consultar(@Param() parametros: unknown): Promise<ComprobanteDetalleDto> {
    const { id } = validar(EsquemaId, parametros);
    return comprobanteDetalleDto(await this.consultarComprobante.ejecutar(id));
  }
}
