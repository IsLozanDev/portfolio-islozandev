import { Controller, HttpCode, HttpStatus, Inject, Logger, Post, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ApiHeader, ApiNoContentResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Publico } from '@vitrina/plataforma/seguridad';
import type { CabecerasWebhook } from '../application/ports/verificador-webhook.js';
import { ProcesarEventoProveedor } from '../application/procesar-evento-proveedor.js';
import { FirmaWebhookInvalidaError, ProveedorNoConfiguradoError } from '../domain/errores.js';

const EVENTO_FIRMA_INVALIDA = 'not.webhook.firma_invalida';
const CABECERAS_SVIX = ['svix-id', 'svix-timestamp', 'svix-signature'] as const;
const SIN_CUERPO = Buffer.alloc(0);

/** Lo que usa de la solicitud de Express con `rawBody: true` en NestFactory.create. */
interface SolicitudConCuerpoCrudo {
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Avisos de estado de Resend (TR-RF-079 en CORREO). Público: lo autentica la firma Svix, no un token. No es un
 * permiso asignable. Responde 204 tanto si cambió el estado como si el aviso se ignoró.
 */
@ApiTags('notificaciones')
@Controller('notificaciones/webhooks')
export class WebhooksController {
  private readonly logger = new Logger('Notificaciones');

  constructor(@Inject(ProcesarEventoProveedor) private readonly procesarEvento: ProcesarEventoProveedor) {}

  @Post('resend')
  @Publico()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Webhook de estados de correo de Resend, firmado con Svix' })
  @ApiHeader({ name: 'svix-id', required: true, description: 'Id del aviso' })
  @ApiHeader({ name: 'svix-timestamp', required: true, description: 'Segundos Unix; se rechaza con más de 5 min de diferencia' })
  @ApiHeader({ name: 'svix-signature', required: true, description: 'Firma HMAC del cuerpo crudo con RESEND_WEBHOOK_SECRET' })
  @ApiNoContentResponse({ description: 'Aviso procesado, repetido, fuera de orden o de un mensaje desconocido' })
  @ApiUnauthorizedResponse({ description: 'FIRMA_WEBHOOK_INVALIDA (TR-RNF-109)' })
  @ApiServiceUnavailableResponse({ description: 'PROVEEDOR_NO_CONFIGURADO: falta RESEND_WEBHOOK_SECRET' })
  async recibir(@Req() solicitud: SolicitudConCuerpoCrudo): Promise<void> {
    try {
      await this.procesarEvento.ejecutar(solicitud.rawBody ?? SIN_CUERPO, cabecerasSvix(solicitud.headers));
    } catch (error) {
      throw this.traducir(error);
    }
  }

  /** TR-RNF-109: el rechazo queda en el log sin el cuerpo ni las cabeceras. */
  private traducir(error: unknown): unknown {
    if (error instanceof FirmaWebhookInvalidaError) {
      this.logger.warn({ evento: EVENTO_FIRMA_INVALIDA });
      return new UnauthorizedException({ statusCode: HttpStatus.UNAUTHORIZED, code: error.code, message: error.message });
    }
    if (error instanceof ProveedorNoConfiguradoError) {
      return new ServiceUnavailableException({ statusCode: HttpStatus.SERVICE_UNAVAILABLE, code: error.code, message: error.message });
    }
    return error;
  }
}

function cabecerasSvix(cabeceras: SolicitudConCuerpoCrudo['headers']): CabecerasWebhook {
  return Object.fromEntries(CABECERAS_SVIX.map((nombre) => [nombre, primerValor(cabeceras[nombre])]));
}

function primerValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}
