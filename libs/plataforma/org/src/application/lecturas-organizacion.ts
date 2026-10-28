import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import { existe } from './comunes.js';
import type {
  EmpresaListada,
  FiltroEmpresas,
  FiltroSucursales,
  FiltroUnidades,
  LecturaOrganizacion,
  Listado,
  SucursalListada,
  UnidadListada,
} from './ports/lectura-organizacion.js';
import type { RepositorioEmpresas } from './ports/repositorios.js';

export interface DependenciasLecturaOrganizacion {
  unidadDeTrabajo: UnitOfWork;
  lectura: LecturaOrganizacion;
}

export class ListarEmpresas {
  constructor(private readonly dependencias: DependenciasLecturaOrganizacion) {}

  ejecutar(filtro: FiltroEmpresas): Promise<Listado<EmpresaListada>> {
    const { unidadDeTrabajo, lectura } = this.dependencias;
    return unidadDeTrabajo.run(() => lectura.empresas(filtro));
  }
}

export class ListarSucursales {
  constructor(private readonly dependencias: DependenciasLecturaOrganizacion & { empresas: RepositorioEmpresas }) {}

  /** Una empresa de otro tenant no se ve con la RLS: responde que no existe (404, no 403). */
  ejecutar(empresaId: string, filtro: FiltroSucursales): Promise<Listado<SucursalListada>> {
    const { unidadDeTrabajo, lectura, empresas } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      existe(await empresas.buscar(empresaId), 'La empresa no existe');
      return lectura.sucursales(empresaId, filtro);
    });
  }
}

export class ListarUnidades {
  constructor(private readonly dependencias: DependenciasLecturaOrganizacion) {}

  ejecutar(filtro: FiltroUnidades): Promise<Listado<UnidadListada>> {
    const { unidadDeTrabajo, lectura } = this.dependencias;
    return unidadDeTrabajo.run(() => lectura.unidades(filtro));
  }
}
