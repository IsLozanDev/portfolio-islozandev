import { Module, type DynamicModule } from '@nestjs/common';
import { CorrelativosModule } from '@vitrina/plataforma/correlativos';
import { EventosModule, type PoliticaReintentos } from '@vitrina/plataforma/eventos';
import { KernelInfraModule, type KernelInfraOptions } from '@vitrina/plataforma/kernel-infra';
import { OrgModule } from '@vitrina/plataforma/org';
import { ParametrosModule } from '@vitrina/plataforma/parametros';
import { SeguridadModule, type SeguridadOpciones } from '@vitrina/plataforma/seguridad';
import { FallidosController } from './eventos/fallidos.controller.js';
import { SaludController } from './salud/salud.controller.js';

export type AppOpciones = KernelInfraOptions & Omit<SeguridadOpciones, 'dataSource'> & { reintentosEventos: PoliticaReintentos };

@Module({})
export class AppModule {
  /** El DataSource llega ya inicializado desde main.ts; en pruebas puede no estarlo. */
  static register({ dataSource, validator, reintentosEventos, ...seguridad }: AppOpciones): DynamicModule {
    return {
      module: AppModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        OrgModule,
        SeguridadModule.register({ ...seguridad, dataSource }),
        ParametrosModule.register({ redisUrl: seguridad.redisUrl }),
        CorrelativosModule.register(),
        EventosModule.registrarApi({ redisUrl: seguridad.redisUrl, reintentos: reintentosEventos }),
      ],
      // El de fallidos vive aquí y no en la lib: comp:evt no puede importar seguridad (PL-10).
      controllers: [SaludController, FallidosController],
    };
  }
}
