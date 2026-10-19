import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('salud')
@Controller('salud')
export class SaludController {
  @Get()
  @ApiOkResponse({ description: 'La API está arriba', schema: { example: { estado: 'ok' } } })
  obtener() {
    return { estado: 'ok' };
  }
}
