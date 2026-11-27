import { ApiProperty } from '@nestjs/swagger';
import type { BajasDestino } from '../application/preferencias/registrar-baja.js';
import type { PreferenciasDestino } from '../application/preferencias/consultar-preferencias.js';
import { ALCANCES_BAJA, type AlcanceBaja } from '../domain/baja.js';
import { CANALES_HABILITADOS, type CanalNotificacion } from '../domain/canal.js';

const DESCRIPCION_TOKEN = 'Token del fragmento #t= del enlace del pie. Va en el cuerpo, nunca en la URL';

export class ConsultarPreferenciasDto {
  @ApiProperty({ description: DESCRIPCION_TOKEN })
  token!: string;
}

export class RegistrarBajaDto {
  @ApiProperty({ description: DESCRIPCION_TOKEN })
  token!: string;

  @ApiProperty({ enum: ALCANCES_BAJA, description: 'PROMOCIONAL deja las promociones; CANAL deja todo el correo, también recordatorios y comprobantes' })
  baja!: AlcanceBaja;
}

export class BajasDto {
  @ApiProperty({ enum: ALCANCES_BAJA, isArray: true, description: 'Bajas vigentes del destino' })
  bajas!: AlcanceBaja[];
}

export class PreferenciasDto extends BajasDto {
  @ApiProperty({ example: 'j***@gmail.com', description: 'Primera letra y dominio; nunca el correo completo' })
  destinoEnmascarado!: string;

  @ApiProperty({ enum: CANALES_HABILITADOS })
  canal!: CanalNotificacion;
}

export class ErrorPreferenciasDto {
  @ApiProperty({ example: 'ENLACE_INVALIDO' })
  codigo!: string;

  @ApiProperty({ example: 'Enlace inválido o vencido', required: false })
  mensaje?: string;
}

export function preferenciasDto(preferencias: PreferenciasDestino): PreferenciasDto {
  return { destinoEnmascarado: preferencias.destinoEnmascarado, canal: preferencias.canal, bajas: preferencias.bajas };
}

export function bajasDto(registradas: BajasDestino): BajasDto {
  return { bajas: registradas.bajas };
}
