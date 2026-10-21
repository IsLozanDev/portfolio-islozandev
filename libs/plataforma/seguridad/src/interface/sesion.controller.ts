import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { mfaEn, mfaVigente, type Principal } from '../domain/principal.js';
import { PrincipalActual } from './decoradores.js';

export const MFA_MAX_EDAD_SEG = Symbol('MFA_MAX_EDAD_SEG');

export class SesionDto {
  @ApiProperty({ format: 'uuid' })
  usuario_id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  tenant_id!: string | null;

  @ApiProperty({ enum: ['INTERNO', 'EXTERNO', 'SOPORTE'] })
  tipo_usuario!: string;

  @ApiProperty({ enum: ['aal1', 'aal2'] })
  aal!: string;

  @ApiProperty()
  mfa_vigente!: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  mfa_en!: string | null;
}

/** Datos del propio token, para la prueba de humo. El spec 07 lo reemplaza por /v1/seg/mi-contexto. */
@ApiTags('seg')
@ApiBearerAuth()
@Controller('seg/sesion')
export class SesionController {
  constructor(@Inject(MFA_MAX_EDAD_SEG) private readonly mfaMaxEdadSeg: number) {}

  @Get()
  @ApiOkResponse({ type: SesionDto })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
  obtener(@PrincipalActual() p: Principal): SesionDto {
    const en = mfaEn(p);
    return {
      usuario_id: p.usuarioId,
      tenant_id: p.tenantId,
      tipo_usuario: p.tipo,
      aal: p.aal,
      mfa_vigente: mfaVigente(p, new Date(), this.mfaMaxEdadSeg),
      mfa_en: en ? en.toISOString() : null,
    };
  }
}
