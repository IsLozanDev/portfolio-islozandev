import { Logger, Module, type DynamicModule } from '@nestjs/common';
import { AUDITORIA, type AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { Clock, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ClavesDeDatos } from './application/claves-de-datos.js';
import type { Registrar } from './application/dependencias-boveda.js';
import { BOVEDA_SECRETOS, type BovedaSecretos } from './application/ports/boveda-secretos.js';
import { ReenvolverClaves } from './application/reenvolver-claves.js';
import { ServicioBoveda } from './application/servicio-boveda.js';
import type { ClavesMaestras } from './domain/claves-maestras.js';
import { CifradorAesGcm } from './infrastructure/crypto/cifrador.aes-gcm.js';
import { RepositorioClavesTenantTypeOrm } from './infrastructure/typeorm/claves-tenant.repositorio.js';
import { RepositorioSecretosTypeOrm } from './infrastructure/typeorm/secretos.repositorio.js';
import { TenantsPorReenvolverSql, type EjecutorSql } from './infrastructure/typeorm/tenants-por-reenvolver.sql.js';

const CONTEXTO_LOG = 'Secretos';

export interface SecretosOpciones {
  /** De `clavesMaestrasDe(entorno)`. Sin claves la app arranca y la bóveda lanza BovedaNoConfiguradaError al usarse. */
  claves: ClavesMaestras | undefined;
}

export interface ReenvolturaOpciones extends SecretosOpciones {
  /** Para listar las claves de todos los tenants fuera de toda transacción. */
  dataSource: EjecutorSql;
}

function registradores(): { informar: Registrar; avisar: Registrar } {
  const logger = new Logger(CONTEXTO_LOG);
  return {
    informar: (mensaje, datos) => logger.log({ evento: mensaje, ...datos }),
    avisar: (mensaje, datos) => logger.warn({ evento: mensaje, ...datos }),
  };
}

// Usa los tokens de KernelInfraModule y AUDITORIA de AuditoriaModule (globales), que la app debe importar.
// Las entidades ENTIDADES_SEC van en el DataSource de la app.
@Module({})
export class SecretosModule {
  /** `BOVEDA_SECRETOS` en proceso, para los casos de uso de cada consumidor. Sin HTTP. */
  static register({ claves }: SecretosOpciones): DynamicModule {
    const { informar } = registradores();
    return {
      module: SecretosModule,
      providers: [
        {
          provide: BOVEDA_SECRETOS,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            ids: IdGenerator,
            auditoria: AuditoriaPort,
          ): BovedaSecretos => {
            const cifrador = new CifradorAesGcm();
            const clavesTenant = new RepositorioClavesTenantTypeOrm(unidadDeTrabajo, contexto);
            return new ServicioBoveda({
              unidadDeTrabajo,
              contexto,
              reloj,
              ids,
              auditoria,
              cifrador,
              clavesDeDatos: new ClavesDeDatos(cifrador, clavesTenant, claves),
              secretos: new RepositorioSecretosTypeOrm(unidadDeTrabajo, contexto),
              informar,
            });
          },
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, AUDITORIA],
        },
      ],
      exports: [BOVEDA_SECRETOS],
    };
  }

  /** La re-envoltura de las claves de datos al rotar la clave maestra, para el CLI `secretos:reenvolver`. Sin auditoría. */
  static registrarReenvoltura({ claves, dataSource }: ReenvolturaOpciones): DynamicModule {
    return {
      module: SecretosModule,
      providers: [
        {
          provide: ReenvolverClaves,
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock) => {
            const clavesTenant = new RepositorioClavesTenantTypeOrm(unidadDeTrabajo, contexto);
            return new ReenvolverClaves({
              unidadDeTrabajo,
              contexto,
              reloj,
              clavesDeDatos: new ClavesDeDatos(new CifradorAesGcm(), clavesTenant, claves),
              clavesTenant,
              tenantsPorReenvolver: new TenantsPorReenvolverSql(dataSource),
              ...registradores(),
            });
          },
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK],
        },
      ],
      exports: [ReenvolverClaves],
    };
  }
}
