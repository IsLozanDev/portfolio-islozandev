import { applyDecorators, Body, Controller, HttpCode, Inject, Param, Post, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { FinalizarMembresia, ReactivarMembresia, RevocarAsignacion, SuspenderMembresia } from '../application/membresia.casos-de-uso.js';
import { PERMISOS_SEG } from '../domain/permisos-seg.js';
import type { Principal } from '../domain/principal.js';
import { Permiso, PrincipalActual } from './decoradores.js';
import { exigirUuid, MembresiasFiltro, validar } from './membresias.http.js';

// La longitud del motivo la valida el dominio (MOTIVO_INVALIDO); aquí solo el tipo.
const EsquemaAccion = z.object({ motivo: z.string(), confirmar: z.boolean().optional().default(false) });

export class AccionDto {
  @ApiProperty({ minLength: 4, maxLength: 300, example: 'Cese' })
  motivo!: string;

  @ApiProperty({ description: 'Debe ser true (TR-RNF-021)', example: true })
  confirmar!: boolean;
}

export class EstadoMembresiaDto {
  @ApiProperty({ enum: ['INVITADO', 'ACTIVO', 'SUSPENDIDO', 'FINALIZADO'] })
  estado!: string;
}

export class MembresiaFinalizadaDto extends EstadoMembresiaDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  asignaciones_revocadas!: string[];
}

export class AsignacionRevocadaDto {
  @ApiProperty({ format: 'date-time' })
  revocada_en!: string;
}

const accionDe = (p: Principal, cuerpo: unknown) => {
  const d = validar(EsquemaAccion, cuerpo);
  return { motivo: d.motivo, confirmar: d.confirmar, actorId: p.usuarioId };
};

/** Permiso sensible, header de sucursal y respuestas OpenAPI comunes a las cuatro acciones. */
const AccionProtegida = (exito: object) =>
  applyDecorators(
    Permiso(PERMISOS_SEG.asignacionRevocar),
    HttpCode(200),
    ApiHeader({ name: 'X-Sucursal-Id', required: true }),
    ApiBody({ type: AccionDto }),
    ApiOkResponse(exito),
    ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA, CONFIRMACION_REQUERIDA o MOTIVO_INVALIDO' }),
    ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO o MFA_REQUERIDA (permiso sensible, TR-RN-009)' }),
    ApiForbiddenResponse({ description: 'SIN_PERMISO o ACTOR_SIN_ALCANCE' }),
    ApiNotFoundResponse({ description: 'No existe en el tenant' }),
    ApiConflictResponse({ description: 'TRANSICION_INVALIDA, PROPIETARIO_UNICO (TR-CA-040) o ASIGNACION_YA_REVOCADA' }),
  );

/** TR-RF-014. Todas con `plat.asignacion.revocar`, que es sensible: PermisoGuard exige MFA. */
@ApiTags('seg')
@ApiBearerAuth()
@UseFilters(MembresiasFiltro)
@Controller('seg')
export class MembresiasController {
  constructor(
    @Inject(SuspenderMembresia) private readonly suspenderMembresia: SuspenderMembresia,
    @Inject(ReactivarMembresia) private readonly reactivarMembresia: ReactivarMembresia,
    @Inject(FinalizarMembresia) private readonly finalizarMembresia: FinalizarMembresia,
    @Inject(RevocarAsignacion) private readonly revocarAsignacion: RevocarAsignacion,
  ) {}

  @Post('membresias/:id/suspender')
  @AccionProtegida({ type: EstadoMembresiaDto })
  suspender(@PrincipalActual() p: Principal, @Param('id') id: string, @Body() cuerpo: unknown): Promise<EstadoMembresiaDto> {
    return this.suspenderMembresia.ejecutar({ membresiaId: exigirUuid(id, 'La membresía'), ...accionDe(p, cuerpo) });
  }

  @Post('membresias/:id/reactivar')
  @AccionProtegida({ type: EstadoMembresiaDto })
  reactivar(@PrincipalActual() p: Principal, @Param('id') id: string, @Body() cuerpo: unknown): Promise<EstadoMembresiaDto> {
    return this.reactivarMembresia.ejecutar({ membresiaId: exigirUuid(id, 'La membresía'), ...accionDe(p, cuerpo) });
  }

  @Post('membresias/:id/finalizar')
  @AccionProtegida({ type: MembresiaFinalizadaDto })
  async finalizar(@PrincipalActual() p: Principal, @Param('id') id: string, @Body() cuerpo: unknown): Promise<MembresiaFinalizadaDto> {
    const r = await this.finalizarMembresia.ejecutar({ membresiaId: exigirUuid(id, 'La membresía'), ...accionDe(p, cuerpo) });
    return { estado: r.estado, asignaciones_revocadas: r.asignacionesRevocadas };
  }

  @Post('asignaciones/:id/revocar')
  @AccionProtegida({ type: AsignacionRevocadaDto })
  async revocar(@PrincipalActual() p: Principal, @Param('id') id: string, @Body() cuerpo: unknown): Promise<AsignacionRevocadaDto> {
    const r = await this.revocarAsignacion.ejecutar({ asignacionId: exigirUuid(id, 'La asignación'), ...accionDe(p, cuerpo) });
    return { revocada_en: r.revocadaEn.toISOString() };
  }
}
