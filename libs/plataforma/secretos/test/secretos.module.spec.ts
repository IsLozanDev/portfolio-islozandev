import 'reflect-metadata';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuditoriaModule } from '@vitrina/plataforma/auditoria';
import { InMemoryEventSchemaValidator, KernelInfraModule, TENANT_CONTEXT } from '@vitrina/plataforma/kernel-infra';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import { DataSource } from 'typeorm';
import { BOVEDA_SECRETOS, type BovedaSecretos } from '../src/application/ports/boveda-secretos.js';
import { ReenvolverClaves } from '../src/application/reenvolver-claves.js';
import { BovedaNoConfiguradaError } from '../src/domain/errores.js';
import { SecretosModule } from '../src/secretos.module.js';

// Sin base: la bóveda sin claves falla antes de abrir la transacción.
const dataSource = new DataSource({ type: 'postgres', url: 'postgres://nadie@127.0.0.1:1/ninguna' });

@Module({
  imports: [
    KernelInfraModule.register({ dataSource, validator: new InMemoryEventSchemaValidator() }),
    AuditoriaModule.registrarPuerto(),
    SecretosModule.register({ claves: undefined }),
    SecretosModule.registrarReenvoltura({ claves: undefined, dataSource }),
  ],
})
class PruebaModule {}

describe('SecretosModule', () => {
  let app: INestApplicationContext;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(PruebaModule, { logger: false });
  });

  afterAll(() => app.close());

  it('compone la bóveda con AUDITORIA de AuditoriaModule.registrarPuerto y, sin claves, falla al usarse', async () => {
    const boveda = app.get<BovedaSecretos>(BOVEDA_SECRETOS);
    const contexto = app.get<TenantContext>(TENANT_CONTEXT);

    await expect(contexto.run({ tenantId: 't', actorId: 'u' }, () => boveda.guardar('fe.clave', new Uint8Array(1)))).rejects.toThrow(
      BovedaNoConfiguradaError,
    );
  });

  it('compone la re-envoltura y, sin claves, falla al usarse', async () => {
    await expect(app.get(ReenvolverClaves).ejecutar()).rejects.toThrow(BovedaNoConfiguradaError);
  });
});
