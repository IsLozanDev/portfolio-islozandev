import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

/** Pasa a pino todo lo que se loguea con el `Logger` de Nest, incluidos los `new Logger(...)` ya existentes. */
export function usarLoggerDeObservabilidad(app: INestApplicationContext): void {
  app.useLogger(app.get(Logger));
}
