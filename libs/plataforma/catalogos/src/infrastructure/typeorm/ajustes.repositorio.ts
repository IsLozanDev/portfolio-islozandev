import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { Repository } from 'typeorm';
import type { AjusteGuardado, RepositorioAjustes } from '../../application/ports/repositorios.js';
import { VERSION_INICIAL_AJUSTE, type AjusteItem } from '../../domain/ajuste-item.js';
import { AjusteEntidad, type FilaAjuste } from './entidades.js';
import { esViolacionDeUnicidad } from './errores-sql.js';
import { ajusteDesdeFila } from './mapeo.js';

/** Ajustes del tenant del contexto. Filtra por tenant además de la RLS (regla 3). */
export class AjustesRepositorioTypeOrm implements RepositorioAjustes {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async buscar(itemId: string): Promise<AjusteGuardado | null> {
    const fila = await this.ajustes().findOneBy({ itemId, tenantId: this.tenantId() });
    return fila ? ajusteDesdeFila(fila) : null;
  }

  async guardar(itemId: string, ajuste: AjusteItem, versionAnterior: number | null, autoria: { por: string; ahora: Date }): Promise<boolean> {
    const contenido = { visible: ajuste.visible, orden: ajuste.orden, alias: ajuste.alias, modificadoPor: autoria.por, modificadoEn: autoria.ahora };
    if (versionAnterior === null) return this.insertar(itemId, contenido);
    const resultado = await this.ajustes().update(
      { itemId, tenantId: this.tenantId(), version: String(versionAnterior) },
      { ...contenido, version: String(versionAnterior + 1) },
    );
    return resultado.affected === 1;
  }

  async borrar(itemId: string): Promise<void> {
    await this.ajustes().delete({ itemId, tenantId: this.tenantId() });
  }

  /** Otro usuario creó el ajuste entre la lectura y la escritura: es una versión obsoleta. */
  private async insertar(itemId: string, contenido: Omit<FilaAjuste, 'itemId' | 'tenantId' | 'version'>): Promise<boolean> {
    try {
      await this.ajustes().insert({ itemId, tenantId: this.tenantId(), version: String(VERSION_INICIAL_AJUSTE), ...contenido });
      return true;
    } catch (error) {
      if (esViolacionDeUnicidad(error)) return false;
      throw error;
    }
  }

  private tenantId(): string {
    return this.contexto.current().tenantId;
  }

  private ajustes(): Repository<FilaAjuste> {
    return this.unidadDeTrabajo.manager.getRepository(AjusteEntidad);
  }
}
