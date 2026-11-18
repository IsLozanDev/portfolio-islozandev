import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntityManager } from 'typeorm';
import type { RepositorioArchivos } from '../../application/ports/repositorio-archivos.js';
import { NUMERO_PRIMERA_VERSION, type Archivo } from '../../domain/archivo.js';
import type { CategoriaArchivo } from '../../domain/categoria.js';
import { ArchivoEntidad, CategoriaEntidad, VersionArchivoEntidad } from './entidades.js';
import { archivoDesdeFilas, cambiosDeArchivo, cambiosDeVersion, categoriaDesdeFila, filaDesdeArchivo, filaDesdeVersion } from './mapeo.js';

/**
 * arc.archivo con su versión 1 sobre el EntityManager de la transacción activa. Filtra por el tenant del
 * contexto además de la RLS (regla 3). Un archivo que no salió de este repositorio es nuevo.
 */
export class RepositorioArchivosTypeOrm implements RepositorioArchivos {
  /** Versión de la fila al leerla o guardarla: el UPDATE solo pasa si nadie la cambió desde entonces. */
  private readonly versionesGuardadas = new WeakMap<Archivo, number>();

  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async obtener(archivoId: string): Promise<Archivo | null> {
    const tenantId = this.tenantId;
    const fila = await this.manager.getRepository(ArchivoEntidad).findOneBy({ id: archivoId, tenantId });
    if (!fila) return null;
    const version = await this.manager
      .getRepository(VersionArchivoEntidad)
      .findOneByOrFail({ archivoId, tenantId, numero: NUMERO_PRIMERA_VERSION });
    const archivo = archivoDesdeFilas(fila, version);
    this.versionesGuardadas.set(archivo, fila.version);
    return archivo;
  }

  async guardar(archivo: Archivo): Promise<void> {
    const versionGuardada = this.versionesGuardadas.get(archivo);
    if (versionGuardada === undefined) {
      await this.insertar(archivo);
      this.versionesGuardadas.set(archivo, archivo.version);
      return;
    }
    await this.actualizar(archivo, versionGuardada);
    this.versionesGuardadas.set(archivo, versionGuardada + 1);
  }

  async eliminar(archivoId: string): Promise<void> {
    await this.manager.getRepository(ArchivoEntidad).delete({ id: archivoId, tenantId: this.tenantId });
  }

  async buscarCategoria(codigo: string): Promise<CategoriaArchivo | null> {
    const fila = await this.manager.getRepository(CategoriaEntidad).findOneBy({ codigo });
    return fila ? categoriaDesdeFila(fila) : null;
  }

  private async insertar(archivo: Archivo): Promise<void> {
    await this.manager.getRepository(ArchivoEntidad).insert(filaDesdeArchivo(archivo));
    await this.manager.getRepository(VersionArchivoEntidad).insert(filaDesdeVersion(archivo));
  }

  /** La columna de versión sube sola en el UPDATE; el filtro por la versión leída es el bloqueo optimista. */
  private async actualizar(archivo: Archivo, versionGuardada: number): Promise<void> {
    const tenantId = this.tenantId;
    const resultado = await this.manager
      .getRepository(ArchivoEntidad)
      .update({ id: archivo.id, tenantId, version: versionGuardada }, cambiosDeArchivo(archivo));
    if (resultado.affected !== 1) {
      throw new ConflictError('El archivo fue modificado por otra operación; vuelva a cargarlo');
    }
    await this.manager
      .getRepository(VersionArchivoEntidad)
      .update({ archivoId: archivo.id, tenantId, numero: archivo.primeraVersion.numero }, cambiosDeVersion(archivo.primeraVersion));
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
