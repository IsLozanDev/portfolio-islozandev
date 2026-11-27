import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { IsNull, QueryFailedError, type EntityManager, type FindOptionsWhere, type Repository } from 'typeorm';
import type { FiltroPlantillas, Pagina, RepositorioPlantillas, ResumenPlantilla } from '../../application/ports/repositorios.js';
import type { CanalNotificacion } from '../../domain/canal.js';
import { VersionObsoletaPlantillaError } from '../../domain/errores.js';
import { IDIOMA_POR_DEFECTO, origenDe, type Plantilla } from '../../domain/plantilla.js';
import { PlantillaEntidad, type FilaPlantilla } from './entidades.js';
import { filaDesdePlantilla, plantillaDesdeFila } from './mapeo.js';

const VIOLACION_UNICA = '23505';
/** Otra personalización ganó la carrera: dos activas del tenant o el mismo número de versión. */
const INDICES_DE_VERSION = new Set(['uq_plantilla_activa_tenant', 'uq_plantilla_version']);
const SIN_VERSIONES = 0;

/** ntf.plantilla sobre el EntityManager de la transacción activa. Filtra por el tenant además de la RLS (regla 3). */
export class RepositorioPlantillasTypeOrm implements RepositorioPlantillas {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  /** El envío usa también las no personalizables (INTEGRIDAD_ROTA): no filtra por `personalizable`. */
  async vigente(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null> {
    return (
      (await this.vigenteDelTenant(codigo, canal, idioma)) ?? this.mayorVersion({ codigo, canal, idioma, activa: true, tenantId: IsNull() })
    );
  }

  async basePersonalizable(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null> {
    return this.mayorVersion({ codigo, canal, idioma, activa: true, personalizable: true, tenantId: IsNull() });
  }

  async vigenteDelTenant(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null> {
    return this.mayorVersion({ codigo, canal, idioma, activa: true, tenantId: this.tenantId });
  }

  async mayorVersionDelTenant(codigo: string, canal: CanalNotificacion, idioma: string): Promise<number> {
    const mayor = await this.mayorVersion({ codigo, canal, idioma, tenantId: this.tenantId });
    return mayor?.version ?? SIN_VERSIONES;
  }

  /**
   * Dos consultas (bases y personalizadas activas del tenant) y unión en memoria: hay pocas bases y el
   * QueryBuilder no expresa limpio «la del tenant si existe, si no la base» por código.
   */
  async listar(filtro: FiltroPlantillas): Promise<Pagina<ResumenPlantilla>> {
    const activas = { idioma: IDIOMA_POR_DEFECTO, activa: true, ...(filtro.canal ? { canal: filtro.canal } : {}) };
    const bases = await this.activasPorCodigo({ ...activas, personalizable: true, tenantId: IsNull() });
    const personalizadas = await this.activasPorCodigo({ ...activas, tenantId: this.tenantId });
    const vigentes = [...bases.values()].map((base) => personalizadas.get(claveDe(base)) ?? base);
    const coincidentes = vigentes.filter((plantilla) => coincideTexto(plantilla, filtro.texto)).sort(porCodigoYCanal);
    const desde = (filtro.pagina - 1) * filtro.tamano;
    return {
      items: coincidentes.slice(desde, desde + filtro.tamano).map(resumenDe),
      total: coincidentes.length,
      pagina: filtro.pagina,
      tamano: filtro.tamano,
    };
  }

  async versiones(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla[]> {
    const filas = await this.repositorio.find({ where: { codigo, canal, idioma, tenantId: this.tenantId }, order: { version: 'DESC' } });
    return filas.map(plantillaDesdeFila);
  }

  /**
   * Desactiva la vigente leída (ninguna, si regía la base) e inserta la nueva. Si otra transacción ya la
   * desactivó, el UPDATE no toca la versión esperada; si insertó antes, el índice de activa única o el de
   * versión rechaza el INSERT.
   */
  async guardarVersion(nueva: Plantilla, versionEsperada: number | null): Promise<void> {
    const desactivadas = await this.desactivar(nueva.codigo, nueva.canal, nueva.idioma);
    if (!desactivoLaEsperada(desactivadas, versionEsperada)) throw new VersionObsoletaPlantillaError();
    try {
      await this.repositorio.insert(filaDesdePlantilla(nueva));
    } catch (error) {
      if (esConflictoDeVersion(error)) throw new VersionObsoletaPlantillaError();
      throw error;
    }
  }

  async desactivarPersonalizacion(codigo: string, canal: CanalNotificacion, idioma: string): Promise<number> {
    return (await this.desactivar(codigo, canal, idioma)).length;
  }

  /** Pone activa = false en las activas del tenant para el código y devuelve las versiones que cambió. */
  private async desactivar(codigo: string, canal: CanalNotificacion, idioma: string): Promise<number[]> {
    const resultado = await this.manager
      .createQueryBuilder()
      .update(PlantillaEntidad)
      .set({ activa: false })
      .where({ codigo, canal, idioma, tenantId: this.tenantId, activa: true })
      .returning(['version'])
      .updateEntity(false)
      .execute();
    return (resultado.raw as { version: number }[]).map((fila) => fila.version);
  }

  private async mayorVersion(filtro: FindOptionsWhere<FilaPlantilla>): Promise<Plantilla | null> {
    const fila = await this.repositorio.findOne({ where: filtro, order: { version: 'DESC' } });
    return fila ? plantillaDesdeFila(fila) : null;
  }

  /** La activa de mayor versión por código y canal: en orden ascendente, la última de cada clave queda en el mapa. */
  private async activasPorCodigo(filtro: FindOptionsWhere<FilaPlantilla>): Promise<Map<string, Plantilla>> {
    const filas = await this.repositorio.find({ where: filtro, order: { version: 'ASC' } });
    return new Map(filas.map(plantillaDesdeFila).map((plantilla) => [claveDe(plantilla), plantilla]));
  }

  private get repositorio(): Repository<FilaPlantilla> {
    return this.manager.getRepository(PlantillaEntidad);
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

function desactivoLaEsperada(desactivadas: number[], versionEsperada: number | null): boolean {
  if (versionEsperada === null) return desactivadas.length === 0;
  return desactivadas.length === 1 && desactivadas[0] === versionEsperada;
}

function esConflictoDeVersion(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const { code, constraint } = error.driverError as { code?: string; constraint?: string };
  return code === VIOLACION_UNICA && constraint !== undefined && INDICES_DE_VERSION.has(constraint);
}

function claveDe(plantilla: Pick<Plantilla, 'codigo' | 'canal'>): string {
  return `${plantilla.codigo}|${plantilla.canal}`;
}

function coincideTexto(plantilla: Plantilla, texto: string | undefined): boolean {
  if (!texto) return true;
  const buscado = texto.toLocaleLowerCase();
  return [plantilla.nombre, plantilla.codigo, plantilla.asunto ?? ''].some((campo) => campo.toLocaleLowerCase().includes(buscado));
}

function porCodigoYCanal(una: Plantilla, otra: Plantilla): number {
  return una.codigo.localeCompare(otra.codigo) || una.canal.localeCompare(otra.canal);
}

function resumenDe(plantilla: Plantilla): ResumenPlantilla {
  return {
    codigo: plantilla.codigo,
    nombre: plantilla.nombre,
    canal: plantilla.canal,
    idioma: plantilla.idioma,
    origen: origenDe(plantilla),
    version: plantilla.version,
    asunto: plantilla.asunto,
    actualizadoEn: plantilla.creadoEn,
  };
}
