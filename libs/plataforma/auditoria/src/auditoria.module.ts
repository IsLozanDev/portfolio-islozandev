import { Logger, Module, type DynamicModule } from '@nestjs/common';
import type { Clock, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { DependenciasRegistro } from './application/dependencias-registro.js';
import { AUDITORIA, type AuditoriaPort } from './application/ports/auditoria.port.js';
import { RegistrarAccesoSensible } from './application/registrar-acceso-sensible.js';
import { RegistrarEvento } from './application/registrar-evento.js';
import { RegistroAuditoriaTypeOrm } from './infrastructure/typeorm/registro-auditoria.typeorm.js';

const CONTEXTO_LOG = 'Auditoria';

// Usa los tokens de KernelInfraModule (global), que la app debe importar.
@Module({})
export class AuditoriaModule {
  /** `AUDITORIA` para los casos de uso de apps/api. Global: los módulos de producto lo inyectan sin importarlo. */
  static registrarApi(): DynamicModule {
    return {
      module: AuditoriaModule,
      global: true,
      providers: [
        {
          provide: AUDITORIA,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, ids: IdGenerator, reloj: Clock) =>
            crearAuditoria({ contexto, ids, reloj, registro: crearRegistro(unidadDeTrabajo) }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, ID_GENERATOR, CLOCK],
        },
      ],
      exports: [AUDITORIA],
    };
  }
}

function crearRegistro(unidadDeTrabajo: TypeOrmUnitOfWork): RegistroAuditoriaTypeOrm {
  const logger = new Logger(CONTEXTO_LOG);
  return new RegistroAuditoriaTypeOrm(unidadDeTrabajo, (mensaje, datos) => logger.error({ mensaje, ...datos }));
}

function crearAuditoria(dependencias: DependenciasRegistro): AuditoriaPort {
  const registrarEvento = new RegistrarEvento(dependencias);
  const registrarAccesoSensible = new RegistrarAccesoSensible(dependencias);
  return {
    registrar: (entrada) => registrarEvento.ejecutar(entrada),
    registrarAccesoSensible: (entrada) => registrarAccesoSensible.ejecutar(entrada),
  };
}
