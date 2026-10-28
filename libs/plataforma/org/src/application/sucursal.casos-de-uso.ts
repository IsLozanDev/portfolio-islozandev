import { ConflictError, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { Sucursal, type DatosSucursal } from '../domain/sucursal.js';
import { buscarTenant, cupoSucursales, existe } from './comunes.js';
import type { RepositorioEmpresas, RepositorioSucursales, RepositorioSuscripciones, RepositorioTenants } from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';
import { exigirVersion } from './version-obsoleta.js';

export interface SucursalRepos {
  tenants: RepositorioTenants;
  empresas: RepositorioEmpresas;
  sucursales: RepositorioSucursales;
  suscripciones: RepositorioSuscripciones;
}

export interface RegistrarSucursalComando extends DatosSucursal {
  empresaId: string;
}

export interface EditarSucursalComando extends DatosSucursal {
  sucursalId: string;
  /** La que leyó el cliente. */
  version: number;
  /** true reactiva (exige cupo del plan), false inactiva; sin valor no cambia. */
  activo?: boolean;
}

/** Base de los casos de uso de sucursal: todos exigen un tenant operativo (PRUEBA o ACTIVO). */
abstract class CasoSucursal {
  constructor(
    protected readonly uow: UnitOfWork,
    protected readonly contexto: TenantContext,
    protected readonly eventos: EventPublisher,
    protected readonly repos: SucursalRepos,
  ) {}

  protected enTransaccion<T>(trabajo: () => Promise<T>): Promise<T> {
    return this.uow.run(async () => {
      (await buscarTenant(this.repos.tenants, this.contexto)).exigirOperativo();
      return trabajo();
    });
  }

  protected async sucursal(id: string): Promise<Sucursal> {
    return existe(await this.repos.sucursales.buscar(id), 'La sucursal no existe');
  }
}

/** TR-RF-003. */
export class RegistrarSucursal extends CasoSucursal {
  constructor(uow: UnitOfWork, contexto: TenantContext, eventos: EventPublisher, repos: SucursalRepos, private readonly ids: IdGenerator) {
    super(uow, contexto, eventos, repos);
  }

  ejecutar({ empresaId, ...datos }: RegistrarSucursalComando): Promise<{ sucursalId: string }> {
    return this.enTransaccion(async () => {
      const empresa = existe(await this.repos.empresas.buscar(empresaId), 'La empresa no existe');
      const sucursal = Sucursal.crear(this.ids.next(), empresa, datos, await cupoSucursales(this.repos));
      await this.repos.sucursales.guardar(sucursal);
      await publicarEventos(this.eventos, sucursal);
      return { sucursalId: sucursal.id };
    });
  }
}

export class EditarSucursal extends CasoSucursal {
  ejecutar({ sucursalId, version, activo, ...datos }: EditarSucursalComando): Promise<void> {
    return this.enTransaccion(async () => {
      const sucursal = await this.sucursal(sucursalId);
      exigirVersion(sucursal, version);
      sucursal.editar(datos);
      if (activo === true) sucursal.reactivar(await cupoSucursales(this.repos));
      if (activo === false) sucursal.inactivar();
      await this.repos.sucursales.guardar(sucursal);
      await publicarEventos(this.eventos, sucursal);
    });
  }
}

export class InactivarSucursal extends CasoSucursal {
  ejecutar({ sucursalId }: { sucursalId: string }): Promise<void> {
    return this.enTransaccion(async () => {
      const sucursal = await this.sucursal(sucursalId);
      sucursal.inactivar();
      await this.repos.sucursales.guardar(sucursal);
      await publicarEventos(this.eventos, sucursal);
    });
  }
}

/** TR-CA-009: traslada la marca de principal y el 0000 en una sola transacción. */
export class MarcarSucursalPrincipal extends CasoSucursal {
  ejecutar({ sucursalId }: { sucursalId: string }): Promise<void> {
    return this.enTransaccion(async () => {
      const hacia = await this.sucursal(sucursalId);
      if (hacia.esPrincipal) return;
      const desde = await this.repos.sucursales.buscarPrincipal(hacia.empresaId);
      if (!desde) throw new ConflictError('La empresa no tiene sucursal principal');

      Sucursal.trasladarPrincipal(desde, hacia);
      // ux_sucursal_principal no es diferible: primero la que pierde la marca.
      await this.repos.sucursales.guardar(desde);
      await this.repos.sucursales.guardar(hacia);
      await publicarEventos(this.eventos, desde, hacia);
    });
  }
}
