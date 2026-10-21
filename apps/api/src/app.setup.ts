import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('v1');
  const documento = new DocumentBuilder().setTitle('Plataforma API').setVersion('1').addBearerAuth().build();
  SwaggerModule.setup('v1/docs', app, () => SwaggerModule.createDocument(app, documento));
}
