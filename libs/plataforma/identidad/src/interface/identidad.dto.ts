import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MotivoInvalidez } from '@vitrina/shared/util';
import type { FuenteRespuesta, RespuestaConsulta } from '../application/ports/identidad.port.js';

const MOTIVOS_INVALIDEZ: MotivoInvalidez[] = ['LONGITUD', 'PREFIJO', 'DIGITO_VERIFICADOR', 'CARACTERES'];
const FUENTES: FuenteRespuesta[] = ['CACHE', 'PROVEEDOR'];

export class ValidezDto {
  @ApiProperty()
  valido!: boolean;

  @ApiPropertyOptional({ enum: MOTIVOS_INVALIDEZ, description: 'Solo si no es válido' })
  motivo?: MotivoInvalidez;
}

class OrigenDto {
  @ApiProperty({ enum: FUENTES })
  fuente!: FuenteRespuesta;

  @ApiProperty({ format: 'date-time', description: 'Cuándo se obtuvo el dato del proveedor' })
  consultado_en!: string;
}

export class DniDto extends OrigenDto {
  @ApiProperty({ example: 'Juana' })
  nombres!: string;

  @ApiProperty({ example: 'Quispe Mamani' })
  apellidos!: string;
}

export class RucDto extends OrigenDto {
  @ApiProperty({ example: 'Comercial Andina S.A.C.' })
  razon_social!: string;

  @ApiProperty({ example: 'ACTIVO' })
  estado!: string;

  @ApiProperty({ example: 'HABIDO' })
  condicion!: string;

  @ApiProperty({ example: 'Av. Larco 123, Miraflores' })
  direccion_fiscal!: string;

  @ApiProperty({ example: '150122' })
  ubigeo!: string;

  @ApiProperty({ description: 'ACTIVO y HABIDO (TR-RN-019)' })
  apto_factura!: boolean;

  @ApiPropertyOptional({ example: 'Estado BAJA DE OFICIO', description: 'Solo si no es apto' })
  motivo_no_apto?: string;
}

export class ErrorIdentidadDto {
  @ApiProperty({ example: 'DOCUMENTO_INVALIDO' })
  codigo!: string;

  @ApiProperty()
  mensaje!: string;

  @ApiPropertyOptional({ enum: MOTIVOS_INVALIDEZ, description: 'Solo en DOCUMENTO_INVALIDO' })
  motivo?: MotivoInvalidez;
}

/** El código del proveedor no se expone: solo si vino de la caché o del proveedor. */
export function respuestaDto(respuesta: RespuestaConsulta): DniDto | RucDto {
  const origen = { fuente: respuesta.fuente, consultado_en: respuesta.consultadoEn.toISOString() };
  if (respuesta.tipo === 'DNI') return { nombres: respuesta.datos.nombres, apellidos: respuesta.datos.apellidos, ...origen };

  const { razonSocial, estado, condicion, direccionFiscal, ubigeo } = respuesta.datos;
  return {
    razon_social: razonSocial,
    estado,
    condicion,
    direccion_fiscal: direccionFiscal,
    ubigeo,
    apto_factura: respuesta.aptoFactura,
    ...(respuesta.motivoNoApto === undefined ? {} : { motivo_no_apto: respuesta.motivoNoApto }),
    ...origen,
  };
}
