import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntityManager } from 'typeorm';
import type { RegistroFusion, RepositorioFusiones } from '../../application/ports/repositorio-fusiones.js';
import type { ParPersonas } from '../../domain/duplicados.js';
import { FusionEntidad, ParDescartadoEntidad, PersonaEntidad } from './entidades.js';

/** per.fusion y per.par_descartado sobre el EntityManager de la transacción activa, filtrados por tenant (regla 3). */
export class RepositorioFusionesTypeOrm implements RepositorioFusiones {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async registrar(fusion: RegistroFusion): Promise<void> {
    await this.manager.getRepository(FusionEntidad).insert({
      id: fusion.id,
      tenantId: this.tenantId,
      personaConservadaId: fusion.conservadaId,
      personaAbsorbidaId: fusion.absorbidaId,
      camposElegidos: fusion.camposElegidos,
      motivo: fusion.motivo,
      fusionadoPor: fusion.fusionadoPor,
      fusionadoEn: fusion.fusionadoEn,
    });
  }

  /** Sube la versión de cada alias: quien lo leyó antes no puede escribirlo encima. */
  async reapuntarAlias(anteriorConservadaId: string, nuevaConservadaId: string): Promise<number> {
    const resultado = await this.manager
      .createQueryBuilder()
      .update(PersonaEntidad)
      .set({ fusionadaEnId: nuevaConservadaId, version: () => 'version + 1' })
      .where('fusionada_en_id = :anterior AND tenant_id = :tenantId', { anterior: anteriorConservadaId, tenantId: this.tenantId })
      .execute();
    return resultado.affected ?? 0;
  }

  async descartar(par: ParPersonas, usuarioId: string, ahora: Date): Promise<void> {
    await this.manager
      .createQueryBuilder()
      .insert()
      .into(ParDescartadoEntidad)
      .values({ ...this.claveDe(par), descartadoPor: usuarioId, descartadoEn: ahora })
      .orIgnore()
      .execute();
  }

  async quitarDescarte(par: ParPersonas): Promise<boolean> {
    const resultado = await this.manager.getRepository(ParDescartadoEntidad).delete(this.claveDe(par));
    return (resultado.affected ?? 0) > 0;
  }

  estaDescartado(par: ParPersonas): Promise<boolean> {
    return this.manager.getRepository(ParDescartadoEntidad).existsBy(this.claveDe(par));
  }

  private claveDe(par: ParPersonas) {
    return { tenantId: this.tenantId, personaMenorId: par.menor, personaMayorId: par.mayor };
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
