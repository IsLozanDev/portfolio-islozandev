import { ValidationError, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { UnidadOperativa, type DatosUnidad, type TipoUnidad } from '../domain/unidad-operativa.js';
import { buscarTenant, existe } from './comunes.js';
import type { RepositorioEmpresas, RepositorioSucursales, RepositorioTenants, RepositorioUnidades } from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';
import { exigirVersion } from './version-obsoleta.js';

// Tope de la búsqueda de ciclos: una cadena más larga solo puede venir de datos ya corruptos.
const PROFUNDIDAD_MAXIMA = 50;

export interface UnidadRepos {
  tenants: RepositorioTenants;
  empresas: RepositorioEmpresas;
  sucursales: RepositorioSucursales;
  unidades: RepositorioUnidades;
}

export interface RegistrarUnidadComando extends DatosUnidad {
  empresaId: string;
  /** null solo para ALMACEN de empresa (TR-RN-004). */
  sucursalId: string | null;
  tipo: TipoUnidad;
  padreId: string | null;
}

export interface EditarUnidadComando extends DatosUnidad {
  unidadId: string;
  /** La que leyó el cliente. */
  version: number;
  padreId: string | null;
  /** true reactiva, false inactiva; sin valor no cambia. */
  activo?: boolean;
}

/** Base de los casos de uso de unidad: todos exigen un tenant operativo (PRUEBA o ACTIVO). */
abstract class CasoUnidad {
  constructor(
    protected readonly uow: UnitOfWork,
    protected readonly contexto: TenantContext,
    protected readonly eventos: EventPublisher,
    protected readonly repos: UnidadRepos,
  ) {}

  protected enTransaccion<T>(trabajo: () => Promise<T>): Promise<T> {
    return this.uow.run(async () => {
      (await buscarTenant(this.repos.tenants, this.contexto)).exigirOperativo();
      return trabajo();
    });
  }

  protected async unidad(id: string): Promise<UnidadOperativa> {
    return existe(await this.repos.unidades.buscar(id), 'La unidad no existe');
  }

  protected async padre(id: string | null): Promise<UnidadOperativa | null> {
    return id === null ? null : existe(await this.repos.unidades.buscar(id), 'La unidad padre no existe');
  }
}

/** TR-RF-004. */
export class RegistrarUnidad extends CasoUnidad {
  constructor(uow: UnitOfWork, contexto: TenantContext, eventos: EventPublisher, repos: UnidadRepos, private readonly ids: IdGenerator) {
    super(uow, contexto, eventos, repos);
  }

  ejecutar({ empresaId, sucursalId, tipo, padreId, ...datos }: RegistrarUnidadComando): Promise<{ unidadId: string }> {
    return this.enTransaccion(async () => {
      const empresa = existe(await this.repos.empresas.buscar(empresaId), 'La empresa no existe');
      const sucursal = sucursalId === null ? null : existe(await this.repos.sucursales.buscar(sucursalId), 'La sucursal no existe');
      const unidad = UnidadOperativa.crear(this.ids.next(), empresa, sucursal, tipo, datos, await this.padre(padreId));
      await this.repos.unidades.guardar(unidad);
      await publicarEventos(this.eventos, unidad);
      return { unidadId: unidad.id };
    });
  }
}

export class EditarUnidad extends CasoUnidad {
  ejecutar({ unidadId, version, padreId, activo, ...datos }: EditarUnidadComando): Promise<void> {
    return this.enTransaccion(async () => {
      const unidad = await this.unidad(unidadId);
      exigirVersion(unidad, version);
      const padre = await this.padre(padreId);
      await this.exigirSinCiclo(unidad, padre);

      unidad.editar(datos, padre);
      if (activo === true) unidad.reactivar();
      if (activo === false) unidad.inactivar();
      await this.repos.unidades.guardar(unidad);
      await publicarEventos(this.eventos, unidad);
    });
  }

  /** El dominio solo ve un nivel; aquí se recorre la cadena para que el padre no sea un descendiente. */
  private async exigirSinCiclo(unidad: UnidadOperativa, padre: UnidadOperativa | null): Promise<void> {
    let actual = padre;
    for (let nivel = 0; actual !== null && nivel < PROFUNDIDAD_MAXIMA; nivel++) {
      if (actual.id === unidad.id) throw new ValidationError('La unidad padre no puede ser la propia unidad ni una de sus descendientes');
      actual = actual.padreId === null ? null : await this.repos.unidades.buscar(actual.padreId);
    }
    if (actual !== null) throw new ValidationError('La jerarquía de unidades supera la profundidad permitida');
  }
}

export class InactivarUnidad extends CasoUnidad {
  ejecutar({ unidadId }: { unidadId: string }): Promise<void> {
    return this.enTransaccion(async () => {
      const unidad = await this.unidad(unidadId);
      unidad.inactivar();
      await this.repos.unidades.guardar(unidad);
      await publicarEventos(this.eventos, unidad);
    });
  }
}
