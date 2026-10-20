import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Publico } from '@vitrina/plataforma/seguridad';

@ApiTags('salud')
@Controller('salud')
export class SaludController {
  @Publico()
  @Get()
  @ApiOkResponse({ description: 'La API está arriba', schema: { example: { estado: 'ok' } } })
  obtener() {
    return { estado: 'ok' };
  }
}
