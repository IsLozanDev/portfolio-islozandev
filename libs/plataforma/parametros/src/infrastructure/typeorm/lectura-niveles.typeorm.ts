import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { In } from 'typeorm';
import type { LecturaNiveles, NivelValor } from '../../application/ports/repositorios.js';
import { RANGO_ALCANCE } from '../../domain/tipos.js';
import { EmpresaNombreEntidad, SucursalNombreEntidad } from './entidades-org.js';
import { ParametroValorEntidad, type FilaValor } from './entidades.js';

/** Valores del tenant del contexto con el nombre de su entidad. Filtra por tenant además de la RLS (regla 3). */
export class LecturaNivelesTypeOrm implements LecturaNiveles {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async deCodigo(codigo: string): Promise<NivelValor[]> {
    const tenantId = this.contexto.current().tenantId;
    const filas = await this.unidadDeTrabajo.manager.getRepository(ParametroValorEntidad).find({ where: { tenantId, codigo } });
    const nombres = await this.nombresDe(tenantId, filas);
    return filas.map((fila) => nivelDesdeFila(fila, nombres)).sort(porNivelYNombre);
  }

  private async nombresDe(tenantId: string, filas: FilaValor[]): Promise<Map<string, string>> {
    const empresaIds = filas.flatMap((fila) => (fila.empresaId ? [fila.empresaId] : []));
    const sucursalIds = filas.flatMap((fila) => (fila.sucursalId ? [fila.sucursalId] : []));
    const gestorEntidades = this.unidadDeTrabajo.manager;
    const empresas = empresaIds.length ? await gestorEntidades.getRepository(EmpresaNombreEntidad).findBy({ tenantId, id: In(empresaIds) }) : [];
    const sucursales = sucursalIds.length ? await gestorEntidades.getRepository(SucursalNombreEntidad).findBy({ tenantId, id: In(sucursalIds) }) : [];
    return new Map([...empresas.map((empresa) => [empresa.id, empresa.razonSocial] as const), ...sucursales.map((sucursal) => [sucursal.id, sucursal.nombre] as const)]);
  }
}

function nivelDesdeFila(fila: FilaValor, nombres: Map<string, string>): NivelValor {
  const entidadId = fila.sucursalId ?? fila.empresaId;
  return {
    alcance: fila.alcance,
    empresaId: fila.empresaId,
    sucursalId: fila.sucursalId,
    entidadNombre: entidadId ? (nombres.get(entidadId) ?? null) : null,
    valor: fila.valor,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  };
}

/** Del más general al más específico; dentro de un nivel, por nombre. */
function porNivelYNombre(izquierdo: NivelValor, derecho: NivelValor): number {
  const porNivel = RANGO_ALCANCE[derecho.alcance] - RANGO_ALCANCE[izquierdo.alcance];
  return porNivel !== 0 ? porNivel : (izquierdo.entidadNombre ?? '').localeCompare(derecho.entidadNombre ?? '');
}
