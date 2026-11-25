import { Body, Controller, Inject, Post, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permiso } from '@vitrina/plataforma/seguridad';
import { z } from 'zod';
import { FusionarPersonas } from '../application/duplicados/fusionar-personas.js';
import { TIPOS_CONTACTO } from '../domain/contacto.js';
import { ORIGENES_CAMPO, PRINCIPAL_DIRECCION, type CamposElegidos, type CampoDatosBasicos } from '../domain/fusion.js';
import { PERMISOS_PER } from '../domain/permisos-per.js';
import { FusionarPersonasDto } from './duplicados.dto.js';
import { versionLeida } from './esquemas.js';
import { ErrorPersonaDto, PersonaDetalleDto, personaDetalleDto } from './personas.dto.js';
import { PersonasFiltro, validar } from './personas.http.js';

/** Cota de entrada: el largo real (5 a 300, recortado) lo valida el dominio con MOTIVO_INVALIDO. */
const LONGITUD_MAXIMA_MOTIVO = 1000;

const origen = z.enum(ORIGENES_CAMPO).optional();
const EsquemaFusion = z.object({
  persona_conservada_id: z.uuid(),
  persona_absorbida_id: z.uuid(),
  version_conservada: versionLeida,
  version_absorbida: versionLeida,
  campos_elegidos: z.object({
    datos_basicos: z.strictObject({ nombres: origen, apellido_paterno: origen, apellido_materno: origen, razon_social: origen }).default({}),
    principales: z
      .strictObject(Object.fromEntries([...TIPOS_CONTACTO, PRINCIPAL_DIRECCION].map((clave) => [clave, z.uuid().optional()])))
      .default({}),
  }),
  motivo: z.string().max(LONGITUD_MAXIMA_MOTIVO),
});

const CAMPO_DE_COLUMNA: Record<string, CampoDatosBasicos> = {
  nombres: 'nombres',
  apellido_paterno: 'apellidoPaterno',
  apellido_materno: 'apellidoMaterno',
  razon_social: 'razonSocial',
};

/** Solo los elegidos: un campo que no llega toma el de la conservada. */
function camposElegidosDe({ datos_basicos: datosBasicos, principales }: z.infer<typeof EsquemaFusion>['campos_elegidos']): CamposElegidos {
  const elegidos = (registro: Record<string, string | undefined>) => Object.entries(registro).filter(([, valor]) => valor !== undefined);
  return {
    datosBasicos: Object.fromEntries(elegidos(datosBasicos).map(([columna, valor]) => [CAMPO_DE_COLUMNA[columna], valor])),
    principales: Object.fromEntries(elegidos(principales)),
  };
}

/** TR-RF-042, pasos 3 y 4: fusión irreversible de dos personas del tenant, con motivo y aal2 (permiso sensible). */
@ApiTags('personas')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Sucursal-Id', required: true })
@ApiUnauthorizedResponse({ description: 'TOKEN_INVALIDO, o MFA requerida: plat.persona.fusionar es sensible (aal2)' })
@ApiForbiddenResponse({ description: 'SIN_PERMISO o SUCURSAL_NO_ASIGNADA' })
@ApiBadRequestResponse({ description: 'SOLICITUD_INVALIDA (ids, versiones, orígenes o claves de principales fuera de lista)' })
@UseFilters(PersonasFiltro)
@Controller('personas/fusiones')
export class FusionesController {
  constructor(@Inject(FusionarPersonas) private readonly fusionarPersonas: FusionarPersonas) {}

  @Post()
  @Permiso(PERMISOS_PER.fusionar)
  @ApiBody({ type: FusionarPersonasDto })
  @ApiCreatedResponse({
    type: PersonaDetalleDto,
    description: 'La conservada con los datos elegidos; la absorbida queda inactiva como alias y se publica persona.fusionada',
  })
  @ApiNotFoundResponse({ type: ErrorPersonaDto, description: 'NO_ENCONTRADA, también si alguna persona es de otro tenant' })
  @ApiConflictResponse({
    type: ErrorPersonaDto,
    description: 'DOCUMENTOS_DISTINTOS, TIPO_PERSONA_DISTINTO, PERSONA_FUSIONADA (con persona_conservada_id) o VERSION_OBSOLETA',
  })
  @ApiUnprocessableEntityResponse({ type: ErrorPersonaDto, description: 'MISMA_PERSONA, MOTIVO_INVALIDO o CAMPO_ELEGIDO_INVALIDO' })
  async fusionar(@Body() cuerpo: unknown): Promise<PersonaDetalleDto> {
    const datos = validar(EsquemaFusion, cuerpo);
    const conservada = await this.fusionarPersonas.ejecutar({
      conservadaId: datos.persona_conservada_id,
      absorbidaId: datos.persona_absorbida_id,
      versionConservada: datos.version_conservada,
      versionAbsorbida: datos.version_absorbida,
      camposElegidos: camposElegidosDe(datos.campos_elegidos),
      motivo: datos.motivo,
    });
    return personaDetalleDto(conservada);
  }
}
