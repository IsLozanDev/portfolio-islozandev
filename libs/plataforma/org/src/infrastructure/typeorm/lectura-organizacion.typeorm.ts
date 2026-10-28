import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntitySchema, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type {
  EmpresaListada,
  FiltroEmpresas,
  FiltroSucursales,
  FiltroUnidades,
  LecturaOrganizacion,
  Listado,
  Pagina,
  SucursalListada,
  UnidadListada,
} from '../../application/ports/lectura-organizacion.js';
import {
  EmpresaLecturaEntidad,
  SucursalLecturaEntidad,
  UnidadLecturaEntidad,
  type FilaEmpresa,
  type FilaSucursal,
  type FilaUnidad,
} from './entidades-lectura.js';

/** Listas del tenant del contexto. Filtra por tenant además de la RLS (regla 3). */
export class LecturaOrganizacionTypeOrm implements LecturaOrganizacion {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async empresas(filtro: FiltroEmpresas): Promise<Listado<EmpresaListada>> {
    const consulta = this.delTenant(EmpresaLecturaEntidad, 'empresa').orderBy('empresa.razonSocial').addOrderBy('empresa.id');
    if (filtro.activo !== undefined) consulta.andWhere('empresa.activo = :activo', { activo: filtro.activo });
    return paginar(consulta, filtro, empresaListada);
  }

  async sucursales(empresaId: string, filtro: FiltroSucursales): Promise<Listado<SucursalListada>> {
    const consulta = this.delTenant(SucursalLecturaEntidad, 'sucursal')
      .andWhere('sucursal.empresaId = :empresaId', { empresaId })
      .orderBy('sucursal.esPrincipal', 'DESC')
      .addOrderBy('sucursal.codigo');
    if (filtro.activo !== undefined) consulta.andWhere('sucursal.activo = :activo', { activo: filtro.activo });
    return paginar(consulta, filtro, sucursalListada);
  }

  async unidades(filtro: FiltroUnidades): Promise<Listado<UnidadListada>> {
    const consulta = this.delTenant(UnidadLecturaEntidad, 'unidad').orderBy('unidad.tipo').addOrderBy('unidad.codigo');
    if (filtro.empresaId) consulta.andWhere('unidad.empresaId = :empresaId', { empresaId: filtro.empresaId });
    if (filtro.sucursalId) consulta.andWhere('unidad.sucursalId = :sucursalId', { sucursalId: filtro.sucursalId });
    if (filtro.tipo) consulta.andWhere('unidad.tipo = :tipo', { tipo: filtro.tipo });
    if (filtro.activo !== undefined) consulta.andWhere('unidad.activo = :activo', { activo: filtro.activo });
    return paginar(consulta, filtro, unidadListada);
  }

  private delTenant<F extends ObjectLiteral>(entidad: EntitySchema<F>, alias: string): SelectQueryBuilder<F> {
    return this.unidadDeTrabajo.manager
      .getRepository(entidad)
      .createQueryBuilder(alias)
      .where(`${alias}.tenantId = :tenantId`, { tenantId: this.contexto.current().tenantId });
  }
}

async function paginar<F extends ObjectLiteral, T>(consulta: SelectQueryBuilder<F>, pagina: Pagina, mapear: (fila: F) => T): Promise<Listado<T>> {
  const [filas, total] = await consulta
    .skip((pagina.pagina - 1) * pagina.tamano)
    .take(pagina.tamano)
    .getManyAndCount();
  return { items: filas.map(mapear), total };
}

function empresaListada({ tenantId: _tenantId, version, ...fila }: FilaEmpresa): EmpresaListada {
  return { ...fila, version: Number(version) };
}

function sucursalListada({ tenantId: _tenantId, version, ...fila }: FilaSucursal): SucursalListada {
  return { ...fila, version: Number(version) };
}

function unidadListada({ tenantId: _tenantId, version, ...fila }: FilaUnidad): UnidadListada {
  return { ...fila, version: Number(version) };
}
