import { Controller, Get, Headers, HttpException, Inject } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ObtenerMiContexto } from '../application/obtener-mi-contexto.js';
import { SucursalNoAsignadaError } from '../domain/errores.js';
import { mfaEn, mfaVigente, type Principal } from '../domain/principal.js';
import { PrincipalActual } from './decoradores.js';
import { UUID } from './respuestas.js';

export const MFA_MAX_EDAD_SEG = Symbol('MFA_MAX_EDAD_SEG');

export class SucursalDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  empresa_id!: string;

  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  nombre!: string;
}

export class OpcionMenuDto {
  @ApiProperty()
  codigo!: string;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Código de la opción padre' })
  padre!: string | null;

  @ApiProperty()
  nombre!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  ruta!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  icono!: string | null;

  @ApiProperty()
  orden!: number;
}

export class MiContextoDto {
  @ApiProperty({ format: 'uuid' })
  usuario_id!: string;

  @ApiProperty({ format: 'uuid' })
  tenant_id!: string;

  @ApiProperty({ enum: ['INTERNO', 'EXTERNO', 'SOPORTE'] })
  tipo_usuario!: string;

  @ApiProperty({ enum: ['aal1', 'aal2'] })
  aal!: string;

  @ApiProperty()
  mfa_vigente!: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  mfa_en!: string | null;

  @ApiProperty({ type: [SucursalDto] })
  sucursales!: SucursalDto[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  sucursal_actual!: string | null;

  @ApiProperty({ description: 'Hay varias sucursales y ninguna se pudo elegir' })
  requiere_seleccion!: boolean;

  @ApiProperty({ description: 'Sin sucursales accesibles (TR-CA-046)' })
  sin_accesos!: boolean;

  @ApiProperty({ type: [String] })
  permisos!: string[];

  @ApiProperty({ type: [OpcionMenuDto] })
  menu!: OpcionMenuDto[];
}

/** Sin `@Permiso`: un usuario sin asignaciones tiene que poder recibir `sin_accesos` (decisión del spec 06). */
@ApiTags('seg')
@ApiBearerAuth()
@Controller('seg/mi-contexto')
export class MiContextoController {
  constructor(
    @Inject(ObtenerMiContexto) private readonly obtener: ObtenerMiContexto,
    @Inject(MFA_MAX_EDAD_SEG) private readonly mfaMaxEdadSeg: number,
  ) {}

  @Get()
  @ApiHeader({ name: 'X-Sucursal-Id', required: false, description: 'Sucursal a usar como actual; se recuerda para la próxima vez' })
  @ApiOkResponse({ type: MiContextoDto })
  @ApiBadRequestResponse({ description: 'SIN_SUCURSAL: X-Sucursal-Id no es UUID' })
  @ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO' })
  @ApiForbiddenResponse({ description: 'SIN_TENANT o SUCURSAL_NO_ASIGNADA' })
  async consultar(@PrincipalActual() p: Principal, @Headers('x-sucursal-id') sucursal?: string): Promise<MiContextoDto> {
    if (!p.tenantId) throw new HttpException({ codigo: 'SIN_TENANT' }, 403);
    if (sucursal !== undefined && !UUID.test(sucursal)) throw new HttpException({ codigo: 'SIN_SUCURSAL' }, 400);

    let c;
    try {
      c = await this.obtener.ejecutar({ usuarioId: p.usuarioId, tenantId: p.tenantId, sucursalSolicitada: sucursal });
    } catch (e) {
      if (e instanceof SucursalNoAsignadaError) throw new HttpException({ codigo: e.code }, 403);
      throw e;
    }
    const en = mfaEn(p);
    return {
      usuario_id: p.usuarioId,
      tenant_id: p.tenantId,
      tipo_usuario: p.tipo,
      aal: p.aal,
      mfa_vigente: mfaVigente(p, new Date(), this.mfaMaxEdadSeg),
      mfa_en: en ? en.toISOString() : null,
      sucursales: c.sucursales.map((s) => ({ id: s.id, empresa_id: s.empresaId, codigo: s.codigo, nombre: s.nombre })),
      sucursal_actual: c.sucursalActual,
      requiere_seleccion: c.requiereSeleccion,
      sin_accesos: c.sinAccesos,
      permisos: c.permisos,
      menu: c.menu,
    };
  }
}
