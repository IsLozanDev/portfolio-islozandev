import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { In, type EntityManager } from 'typeorm';
import type { RepositorioArchivos, VersionRegistrada } from '../../application/ports/repositorio-archivos.js';
import type { Archivo, VersionArchivo } from '../../domain/archivo.js';
import type { CategoriaArchivo } from '../../domain/categoria.js';
import { ArchivoEntidad, CategoriaEntidad, VersionArchivoEntidad } from './entidades.js';
import {
  archivoDesdeFilas,
  cambiosDeArchivo,
  cambiosDeVersion,
  categoriaDesdeFila,
  filaDesdeArchivo,
  filaDesdeVersion,
  versionRegistradaDesdeFila,
} from './mapeo.js';

/** Lo que había en la base al leer o guardar el archivo: su versión de fila y lo cambiable de cada versión. */
interface EstadoGuardado {
  version: number;
  /** Por número de versión, los cambios serializados: si difieren, la fila se actualiza. */
  versiones: Map<number, string>;
}

const POR_NUMERO = { numero: 'ASC' } as const;

/**
 * arc.archivo con sus versiones sobre el EntityManager de la transacción activa. Filtra por el tenant del
 * contexto además de la RLS (regla 3). Un archivo que no salió de este repositorio es nuevo.
 */
export class RepositorioArchivosTypeOrm implements RepositorioArchivos {
  /** El UPDATE solo pasa si nadie cambió la fila desde que se leyó o se guardó. */
  private readonly guardados = new WeakMap<Archivo, EstadoGuardado>();

  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async obtener(archivoId: string): Promise<Archivo | null> {
    const tenantId = this.tenantId;
    const fila = await this.manager.getRepository(ArchivoEntidad).findOneBy({ id: archivoId, tenantId });
    if (!fila) return null;
    const versiones = await this.manager.getRepository(VersionArchivoEntidad).find({ where: { archivoId, tenantId }, order: POR_NUMERO });
    const archivo = archivoDesdeFilas(fila, versiones);
    this.guardados.set(archivo, { version: fila.version, versiones: huellasDe(archivo) });
    return archivo;
  }

  async guardar(archivo: Archivo): Promise<void> {
    const guardado = this.guardados.get(archivo);
    if (guardado === undefined) {
      await this.insertar(archivo);
      this.guardados.set(archivo, { version: archivo.version, versiones: huellasDe(archivo) });
      return;
    }
    await this.actualizar(archivo, guardado.version);
    await this.sincronizarVersiones(archivo, guardado.versiones);
    this.guardados.set(archivo, { version: guardado.version + 1, versiones: huellasDe(archivo) });
  }

  async eliminar(archivoId: string): Promise<void> {
    await this.manager.getRepository(ArchivoEntidad).delete({ id: archivoId, tenantId: this.tenantId });
  }

  async buscarCategoria(codigo: string): Promise<CategoriaArchivo | null> {
    const fila = await this.manager.getRepository(CategoriaEntidad).findOneBy({ codigo });
    return fila ? categoriaDesdeFila(fila) : null;
  }

  async listarVersiones(archivoId: string): Promise<VersionRegistrada[]> {
    const filas = await this.manager
      .getRepository(VersionArchivoEntidad)
      .find({ where: { archivoId, tenantId: this.tenantId }, order: POR_NUMERO });
    return filas.map(versionRegistradaDesdeFila);
  }

  private async insertar(archivo: Archivo): Promise<void> {
    await this.manager.getRepository(ArchivoEntidad).insert(filaDesdeArchivo(archivo));
    await this.manager.getRepository(VersionArchivoEntidad).insert(archivo.versiones.map((version) => filaDesdeVersion(archivo, version)));
  }

  /** La columna de versión sube sola en el UPDATE; el filtro por la versión leída es el bloqueo optimista. */
  private async actualizar(archivo: Archivo, versionGuardada: number): Promise<void> {
    const resultado = await this.manager
      .getRepository(ArchivoEntidad)
      .update({ id: archivo.id, tenantId: this.tenantId, version: versionGuardada }, cambiosDeArchivo(archivo));
    if (resultado.affected !== 1) {
      throw new ConflictError('El archivo fue modificado por otra operación; vuelva a cargarlo');
    }
  }

  /**
   * Primero borra las descartadas, después actualiza y al final inserta: el número de un intento rechazado se
   * reutiliza y `ux_version_en_curso` admite una sola versión en curso.
   */
  private async sincronizarVersiones(archivo: Archivo, guardadas: Map<number, string>): Promise<void> {
    const repositorio = this.manager.getRepository(VersionArchivoEntidad);
    const tenantId = this.tenantId;
    const actuales = new Set(archivo.versiones.map((version) => version.numero));
    const descartadas = [...guardadas.keys()].filter((numero) => !actuales.has(numero));
    if (descartadas.length > 0) await repositorio.delete({ archivoId: archivo.id, tenantId, numero: In(descartadas) });
    const cambiadas = archivo.versiones.filter((version) => guardadas.has(version.numero) && guardadas.get(version.numero) !== huellaDe(version));
    for (const version of cambiadas) {
      await repositorio.update({ archivoId: archivo.id, tenantId, numero: version.numero }, cambiosDeVersion(version));
    }
    const nuevas = archivo.versiones.filter((version) => !guardadas.has(version.numero));
    if (nuevas.length > 0) await repositorio.insert(nuevas.map((version) => filaDesdeVersion(archivo, version)));
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

function huellaDe(version: Readonly<VersionArchivo>): string {
  return JSON.stringify(cambiosDeVersion(version));
}

function huellasDe(archivo: Archivo): Map<number, string> {
  return new Map(archivo.versiones.map((version) => [version.numero, huellaDe(version)]));
}
