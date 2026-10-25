import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { IsNull, QueryFailedError, type FindOptionsWhere, type Repository } from 'typeorm';
import type { RepositorioValores } from '../../application/ports/repositorios.js';
import type { AmbitoValor } from '../../domain/tipos.js';
import type { ValorParametro } from '../../domain/valor-parametro.js';
import { ParametroValorEntidad, type FilaValor } from './entidades.js';
import { filaDesdeValor, valorDesdeFila } from './mapeo.js';

const VIOLACION_UNICIDAD = '23505';
const MENSAJE_CONCURRENCIA = 'El valor fue modificado por otra operación; vuelva a cargarlo';

/** Valores del tenant del contexto, dentro de la transacción activa. Filtra por tenant además de la RLS (regla 3). */
export class ValoresRepositorioTypeOrm implements RepositorioValores {
  /** Versión con la que se leyó cada agregado: el UPDATE y el DELETE la exigen (bloqueo optimista). */
  private readonly versionesLeidas = new WeakMap<ValorParametro, number>();

  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async buscar(codigo: string, ambito: AmbitoValor): Promise<ValorParametro | null> {
    const fila = await this.valores().findOneBy({
      tenantId: this.tenantId(),
      codigo,
      alcance: ambito.alcance,
      empresaId: ambito.empresaId ?? IsNull(),
      sucursalId: ambito.sucursalId ?? IsNull(),
    });
    if (!fila) return null;
    const valorParametro = valorDesdeFila(fila);
    this.versionesLeidas.set(valorParametro, valorParametro.version);
    return valorParametro;
  }

  async guardar(valorParametro: ValorParametro): Promise<void> {
    const versionLeida = this.versionesLeidas.get(valorParametro);
    if (versionLeida === valorParametro.version) return;
    const fila = filaDesdeValor(valorParametro);
    if (versionLeida === undefined) {
      await this.insertar(fila);
    } else {
      const { valor, version, modificadoPor, modificadoEn } = fila;
      const resultado = await this.valores().update(this.criterioVersionado(valorParametro, versionLeida), { valor, version, modificadoPor, modificadoEn });
      if (resultado.affected === 0) throw new ConflictError(MENSAJE_CONCURRENCIA);
    }
    this.versionesLeidas.set(valorParametro, valorParametro.version);
  }

  async eliminar(valorParametro: ValorParametro): Promise<void> {
    const versionLeida = this.versionesLeidas.get(valorParametro);
    if (versionLeida === undefined) throw new ConflictError('Solo se elimina un valor leído en esta operación');
    const resultado = await this.valores().delete(this.criterioVersionado(valorParametro, versionLeida));
    if (resultado.affected === 0) throw new ConflictError(MENSAJE_CONCURRENCIA);
    this.versionesLeidas.delete(valorParametro);
  }

  /** Dos altas simultáneas del mismo nivel chocan con ux_valor_nivel: la segunda es un conflicto, no un 500. */
  private async insertar(fila: FilaValor): Promise<void> {
    try {
      await this.valores().insert(fila);
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === VIOLACION_UNICIDAD) {
        throw new ConflictError(MENSAJE_CONCURRENCIA);
      }
      throw error;
    }
  }

  private criterioVersionado(valorParametro: ValorParametro, versionLeida: number): FindOptionsWhere<FilaValor> {
    return { id: valorParametro.id, tenantId: this.tenantId(), version: String(versionLeida) };
  }

  private valores(): Repository<FilaValor> {
    return this.unidadDeTrabajo.manager.getRepository(ParametroValorEntidad);
  }

  private tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
