import { Module, type DynamicModule } from '@nestjs/common';
import { KernelInfraModule, type KernelInfraOptions } from '@vitrina/plataforma/kernel-infra';
import { OrgModule } from '@vitrina/plataforma/org';
import { SaludController } from './salud/salud.controller.js';

@Module({})
export class AppModule {
  /** El DataSource llega ya inicializado desde main.ts; en pruebas puede no estarlo. */
  static register(opciones: KernelInfraOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [KernelInfraModule.register(opciones), OrgModule],
      controllers: [SaludController],
    };
  }
}
