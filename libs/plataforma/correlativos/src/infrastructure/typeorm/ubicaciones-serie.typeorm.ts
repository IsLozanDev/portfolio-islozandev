import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { UbicacionUnidad, UbicacionesSerie } from '../../application/ports/repositorios.js';
import { SucursalSerieEntidad, UnidadSerieEntidad } from './entidades-org.js';

/** Sucursales y unidades del tenant del contexto. Filtra por tenant además de la RLS de org. */
export class UbicacionesSerieTypeOrm implements UbicacionesSerie {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async sucursalDeUnidad(unidadId: string): Promise<UbicacionUnidad | null> {
    const unidad = await this.unidadDeTrabajo.manager.getRepository(UnidadSerieEntidad).findOneBy({ id: unidadId, tenantId: this.tenantId() });
    return unidad ? { empresaId: unidad.empresaId, sucursalId: unidad.sucursalId } : null;
  }

  async empresaDeSucursal(sucursalId: string): Promise<string | null> {
    const sucursal = await this.unidadDeTrabajo.manager.getRepository(SucursalSerieEntidad).findOneBy({ id: sucursalId, tenantId: this.tenantId() });
    return sucursal?.empresaId ?? null;
  }

  private tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
