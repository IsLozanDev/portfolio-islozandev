import { Module, type Provider } from '@nestjs/common';
import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork, UNIT_OF_WORK } from '@vitrina/plataforma/kernel-infra';
import { CrearTenant } from '../application/crear-tenant.js';
import { EditarEmpresa, RegistrarEmpresa } from '../application/empresa.casos-de-uso.js';
import type { PadronRucPort } from '../application/ports/padron-ruc.port.js';
import type { UsoUsuariosPort } from '../application/ports/uso-usuarios.port.js';
import { EditarSucursal, InactivarSucursal, MarcarSucursalPrincipal, RegistrarSucursal } from '../application/sucursal.casos-de-uso.js';
import { CambiarEstadoTenant, GestionarSuscripcion } from '../application/tenant.casos-de-uso.js';
import { EditarUnidad, InactivarUnidad, RegistrarUnidad } from '../application/unidad.casos-de-uso.js';
import { PadronRucNulo } from './padron-ruc.nulo.js';
import { EmpresaRepositorioTypeOrm } from './typeorm/empresa.repositorio.js';
import { SucursalRepositorioTypeOrm } from './typeorm/sucursal.repositorio.js';
import { SuscripcionRepositorioTypeOrm } from './typeorm/suscripcion.repositorio.js';
import { TenantRepositorioTypeOrm } from './typeorm/tenant.repositorio.js';
import { UnidadRepositorioTypeOrm } from './typeorm/unidad.repositorio.js';
import { UsoUsuariosProvisional } from './uso-usuarios.provisional.js';

export const PADRON_RUC = Symbol('PADRON_RUC');
export const USO_USUARIOS = Symbol('USO_USUARIOS');
const REPOS = Symbol('ORG_REPOS');

interface Repos {
  tenants: TenantRepositorioTypeOrm;
  suscripciones: SuscripcionRepositorioTypeOrm;
  empresas: EmpresaRepositorioTypeOrm;
  sucursales: SucursalRepositorioTypeOrm;
  unidades: UnidadRepositorioTypeOrm;
}

type Base = [UnitOfWork, TenantContext, EventPublisher, Repos];
const BASE = [UNIT_OF_WORK, TENANT_CONTEXT, EVENT_PUBLISHER, REPOS];

/** Casos de uso que reciben (uow, contexto, eventos, repos). */
const conBase = <T>(provide: abstract new (...args: never[]) => T, crear: (...deps: Base) => T): Provider => ({
  provide,
  useFactory: crear,
  inject: BASE,
});

/** Igual, con el generador de ids al final. */
const conIds = <T>(provide: abstract new (...args: never[]) => T, crear: (...deps: [...Base, IdGenerator]) => T): Provider => ({
  provide,
  useFactory: crear,
  inject: [...BASE, ID_GENERATOR],
});

// Las clases de application no llevan decoradores: todo se arma con useFactory y los tokens de
// KernelInfraModule (global), que la app debe importar.
@Module({
  providers: [
    {
      provide: REPOS,
      useFactory: (uow: TypeOrmUnitOfWork, contexto: TenantContext): Repos => ({
        tenants: new TenantRepositorioTypeOrm(uow, contexto),
        suscripciones: new SuscripcionRepositorioTypeOrm(uow, contexto),
        empresas: new EmpresaRepositorioTypeOrm(uow, contexto),
        sucursales: new SucursalRepositorioTypeOrm(uow, contexto),
        unidades: new UnidadRepositorioTypeOrm(uow, contexto),
      }),
      inject: [TypeOrmUnitOfWork, TENANT_CONTEXT],
    },
    { provide: PADRON_RUC, useClass: PadronRucNulo },
    { provide: USO_USUARIOS, useClass: UsoUsuariosProvisional },
    {
      provide: CrearTenant,
      useFactory: (uow: UnitOfWork, ctx: TenantContext, ev: EventPublisher, r: Repos, ids: IdGenerator) => new CrearTenant(uow, ctx, ids, ev, r.tenants),
      inject: [...BASE, ID_GENERATOR],
    },
    {
      provide: RegistrarEmpresa,
      useFactory: (uow: UnitOfWork, ctx: TenantContext, ev: EventPublisher, r: Repos, ids: IdGenerator, padron: PadronRucPort) =>
        new RegistrarEmpresa(uow, ctx, ids, ev, r, padron),
      inject: [...BASE, ID_GENERATOR, PADRON_RUC],
    },
    conBase(EditarEmpresa, (uow, ctx, ev, r) => new EditarEmpresa(uow, ctx, ev, r)),
    conIds(RegistrarSucursal, (uow, ctx, ev, r, ids) => new RegistrarSucursal(uow, ctx, ev, r, ids)),
    conBase(EditarSucursal, (uow, ctx, ev, r) => new EditarSucursal(uow, ctx, ev, r)),
    conBase(InactivarSucursal, (uow, ctx, ev, r) => new InactivarSucursal(uow, ctx, ev, r)),
    conBase(MarcarSucursalPrincipal, (uow, ctx, ev, r) => new MarcarSucursalPrincipal(uow, ctx, ev, r)),
    conIds(RegistrarUnidad, (uow, ctx, ev, r, ids) => new RegistrarUnidad(uow, ctx, ev, r, ids)),
    conBase(EditarUnidad, (uow, ctx, ev, r) => new EditarUnidad(uow, ctx, ev, r)),
    conBase(InactivarUnidad, (uow, ctx, ev, r) => new InactivarUnidad(uow, ctx, ev, r)),
    {
      provide: GestionarSuscripcion,
      useFactory: (uow: UnitOfWork, ctx: TenantContext, ev: EventPublisher, r: Repos, ids: IdGenerator, uso: UsoUsuariosPort) =>
        new GestionarSuscripcion(uow, ctx, ids, ev, r, uso),
      inject: [...BASE, ID_GENERATOR, USO_USUARIOS],
    },
    {
      provide: CambiarEstadoTenant,
      useFactory: (uow: UnitOfWork, ctx: TenantContext, ev: EventPublisher, r: Repos, ids: IdGenerator, reloj: Clock) =>
        new CambiarEstadoTenant(uow, ctx, ids, reloj, ev, r.tenants),
      inject: [...BASE, ID_GENERATOR, CLOCK],
    },
  ],
  exports: [
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
  ],
})
export class OrgModule {}
