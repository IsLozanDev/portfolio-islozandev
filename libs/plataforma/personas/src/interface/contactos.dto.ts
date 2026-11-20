import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TIPOS_CONTACTO, type TipoContacto } from '../domain/contacto.js';

const FORMATOS_DE_CONTACTO =
  'CELULAR: 9 dígitos, inicia con 9. FIJO: de 6 a 9 dígitos. CORREO: usuario@dominio. WHATSAPP: + y de 8 a 15 dígitos';

export class AgregarContactoDto {
  @ApiProperty({ enum: TIPOS_CONTACTO })
  tipo!: TipoContacto;

  @ApiProperty({ example: '+51987654321', description: FORMATOS_DE_CONTACTO })
  valor!: string;

  @ApiPropertyOptional({ default: false, description: 'Verdadero desmarca el principal anterior de ese tipo' })
  principal?: boolean;
}

export class EditarContactoDto {
  @ApiProperty({ minimum: 0, description: 'Versión de la persona que se leyó' })
  version!: number;

  @ApiPropertyOptional({ description: `El tipo no se edita. ${FORMATOS_DE_CONTACTO}` })
  valor?: string;

  @ApiPropertyOptional({ description: 'Verdadero desmarca el principal anterior de ese tipo; el celular principal no se desmarca' })
  principal?: boolean;
}
