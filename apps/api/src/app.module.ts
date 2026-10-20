import { Module, type DynamicModule } from '@nestjs/common';
import { KernelInfraModule, type KernelInfraOptions } from '@vitrina/plataforma/kernel-infra';
import { OrgModule } from '@vitrina/plataforma/org';
import { SeguridadModule, type SeguridadOpciones } from '@vitrina/plataforma/seguridad';
import { SaludController } from './salud/salud.controller.js';

export type AppOpciones = KernelInfraOptions & Omit<SeguridadOpciones, 'dataSource'>;

@Module({})
export class AppModule {
  /** El DataSource llega ya inicializado desde main.ts; en pruebas puede no estarlo. */
  static register({ dataSource, validator, ...seguridad }: AppOpciones): DynamicModule {
    return {
      module: AppModule,
      imports: [KernelInfraModule.register({ dataSource, validator }), OrgModule, SeguridadModule.register({ ...seguridad, dataSource })],
      controllers: [SaludController],
    };
  }
}
