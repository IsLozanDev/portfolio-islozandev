import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { In, type Repository, type SelectQueryBuilder } from 'typeorm';
import type { ImportacionListada, Listado, Pagina, RepositorioImportaciones } from '../../application/ports/importacion.js';
import { ImportacionEnCursoError } from '../../domain/importacion/errores.js';
import type { Importacion } from '../../domain/importacion/importacion.js';
import type { EstadoImportacion } from '../../domain/importacion/tipos.js';
import { ImportacionEntidad, type FilaImportacion } from './entidades.js';
import { esUuid, esViolacionDeUnicidad } from './errores-sql.js';
import { filaDesdeImportacion, importacionDesdeFila, listadaDesdeFila } from './mapeo-importacion.js';

const ESTADOS_PREVIOS: EstadoImportacion[] = ['PREVISUALIZADA', 'RECHAZADA'];
/** Todo menos operaciones y errores, que pesan megas. */
const COLUMNAS_LISTADO = [
  'id',
  'tenantId',
  'catalogoId',
  'versionOficial',
  'fechaVigencia',
  'archivoNombre',
  'archivoSha256',
  'versionCatalogo',
  'estado',
  'altas',
  'cambios',
  'bajas',
  'sinCambios',
  'totalErrores',
  'motivoFallo',
  'lanzadoPor',
  'creadoEn',
  'encoladoEn',
  'aplicadoPor',
  'terminadoEn',
  'version',
].map((columna) => `importacion.${columna}`);

/** Importaciones del tenant del contexto: la RLS no deja ver ni escribir las de otro tenant. */
export class ImportacionesRepositorioTypeOrm implements RepositorioImportaciones {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async buscar(id: string): Promise<Importacion | null> {
    if (!esUuid(id)) return null;
    const fila = await this.importaciones().findOneBy({ id });
    return fila ? importacionDesdeFila(fila) : null;
  }

  async guardar(importacion: Importacion, versionAnterior: number | null): Promise<boolean> {
    try {
      return versionAnterior === null ? await this.insertar(importacion) : await this.actualizar(importacion, versionAnterior);
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new ImportacionEnCursoError();
      throw error;
    }
  }

  async listarPorCatalogo(catalogoId: string, pagina: Pagina): Promise<Listado<ImportacionListada>> {
    const [filas, total] = await this.listado()
      .where('importacion.catalogoId = :catalogoId', { catalogoId })
      .orderBy('importacion.creadoEn', 'DESC')
      .skip((pagina.pagina - 1) * pagina.tamano)
      .take(pagina.tamano)
      .getManyAndCount();
    return { items: filas.map(listadaDesdeFila), total };
  }

  async activasDe(usuarioId: string): Promise<ImportacionListada[]> {
    const filas = await this.listado()
      .where('importacion.lanzadoPor = :usuarioId', { usuarioId })
      .andWhere('importacion.estado = :estado', { estado: 'EN_COLA' })
      .orderBy('importacion.creadoEn', 'DESC')
      .getMany();
    return filas.map(listadaDesdeFila);
  }

  async enColaDe(catalogoId: string): Promise<Importacion | null> {
    const fila = await this.importaciones().findOneBy({ catalogoId, estado: 'EN_COLA' });
    return fila ? importacionDesdeFila(fila) : null;
  }

  async vencerPrevias(catalogoId: string, ahora: Date): Promise<void> {
    await this.importaciones()
      .createQueryBuilder()
      .update()
      .set({ estado: 'VENCIDA', operaciones: null, errores: null, terminadoEn: ahora, version: () => 'version + 1' })
      .where({ catalogoId, estado: In(ESTADOS_PREVIOS) })
      .execute();
  }

  private async insertar(importacion: Importacion): Promise<boolean> {
    await this.importaciones().insert(filaDesdeImportacion(importacion, importacion.version));
    return true;
  }

  private async actualizar(importacion: Importacion, versionAnterior: number): Promise<boolean> {
    const { estado, operaciones, errores, motivoFallo, encoladoEn, aplicadoPor, terminadoEn, version } = filaDesdeImportacion(
      importacion,
      versionAnterior + 1,
    );
    const resultado = await this.importaciones().update(
      { id: importacion.id, version: String(versionAnterior) },
      { estado, operaciones, errores, motivoFallo, encoladoEn, aplicadoPor, terminadoEn, version },
    );
    return resultado.affected === 1;
  }

  private listado(): SelectQueryBuilder<FilaImportacion> {
    return this.importaciones().createQueryBuilder('importacion').select(COLUMNAS_LISTADO);
  }

  private importaciones(): Repository<FilaImportacion> {
    return this.unidadDeTrabajo.manager.getRepository(ImportacionEntidad);
  }
}
