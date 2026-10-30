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
import { OrgModule } from '../src/infrastructure/org.module.js';

describe('OrgModule', () => {
  it('resuelve cada caso de uso con los puertos de KernelInfraModule', async () => {
    const modulo = await Test.createTestingModule({
      imports: [KernelInfraModule.register({ dataSource: new DataSource({ type: 'postgres' }), validator: new InMemoryEventSchemaValidator() }), OrgModule],
    }).compile();

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
});
