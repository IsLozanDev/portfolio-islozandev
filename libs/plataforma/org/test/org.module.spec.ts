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
});
