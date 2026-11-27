import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { CrearTenant } from '../src/application/crear-tenant.js';
import { EditarEmpresa, RegistrarEmpresa } from '../src/application/empresa.casos-de-uso.js';
import { ConsultarEmpresa, ConsultarSucursal, ConsultarUnidad, ListarEmpresas, ListarSucursales, ListarUnidades } from '../src/application/lecturas-organizacion.js';
import { EditarSucursal, InactivarSucursal, MarcarSucursalPrincipal, RegistrarSucursal } from '../src/application/sucursal.casos-de-uso.js';
import { CambiarEstadoTenant, GestionarSuscripcion } from '../src/application/tenant.casos-de-uso.js';
import { EditarUnidad, InactivarUnidad, RegistrarUnidad } from '../src/application/unidad.casos-de-uso.js';
import type { PadronRucPort } from '../src/application/ports/padron-ruc.port.js';
import { PadronRucNulo } from '../src/infrastructure/padron-ruc.nulo.js';
import { OrgModule, PADRON_RUC, type OpcionesOrg } from '../src/infrastructure/org.module.js';
import { VALIDADOR_LOGO_PORT, type ValidadorLogoPort } from '../src/application/ports/validador-logo.port.js';
import { ValidadorLogoRechazaTodo } from '../src/infrastructure/validador-logo.rechaza-todo.js';

const compilar = (opciones?: OpcionesOrg) =>
  Test.createTestingModule({
    imports: [
      KernelInfraModule.register({ dataSource: new DataSource({ type: 'postgres' }), validator: new InMemoryEventSchemaValidator() }),
      OrgModule.register(opciones),
    ],
  }).compile();

describe('OrgModule', () => {
  it('resuelve cada caso de uso con los puertos de KernelInfraModule', async () => {
    const modulo = await compilar();

    for (const caso of [
      CrearTenant,
      RegistrarEmpresa,
      EditarEmpresa,
      RegistrarSucursal,
      EditarSucursal,
      InactivarSucursal,
      MarcarSucursalPrincipal,
      RegistrarUnidad,
      EditarUnidad,
      InactivarUnidad,
      GestionarSuscripcion,
      CambiarEstadoTenant,
      ListarEmpresas,
      ListarSucursales,
      ListarUnidades,
      ConsultarEmpresa,
      ConsultarSucursal,
      ConsultarUnidad,
    ]) {
      expect(modulo.get(caso)).toBeInstanceOf(caso);
    }
  });

  it('sin padronRuc enlaza PadronRucNulo', async () => {
    const modulo = await compilar();
    expect(modulo.get(PADRON_RUC)).toBeInstanceOf(PadronRucNulo);
  });

  it('con padronRuc usa el proveedor recibido', async () => {
    const padronFalso: PadronRucPort = { consultar: async () => null };
    const modulo = await compilar({ padronRuc: { provide: PADRON_RUC, useValue: padronFalso } });
    expect(modulo.get(PADRON_RUC)).toBe(padronFalso);
  });

  it('sin validadorLogo enlaza ValidadorLogoRechazaTodo, que rechaza todo logo', async () => {
    const validador = (await compilar()).get<ValidadorLogoPort>(VALIDADOR_LOGO_PORT);

    expect(validador).toBeInstanceOf(ValidadorLogoRechazaTodo);
    await expect(validador.validar('archivo', 'empresa')).resolves.toEqual({ valido: false, motivo: 'NO_ENCONTRADO' });
  });

  it('con validadorLogo usa el proveedor recibido', async () => {
    const validadorFalso: ValidadorLogoPort = { validar: async () => ({ valido: true }) };
    const modulo = await compilar({ validadorLogo: { provide: VALIDADOR_LOGO_PORT, useValue: validadorFalso } });
    expect(modulo.get(VALIDADOR_LOGO_PORT)).toBe(validadorFalso);
  });
});
