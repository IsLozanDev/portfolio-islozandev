import type { Clock, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Catalogo } from '../../domain/catalogo.js';
import { ImportacionNoEncontradaError, TablaNoImportableError } from '../../domain/importacion/errores.js';
import type { Importacion } from '../../domain/importacion/importacion.js';
import { esTablaImportable, type TablaImportable } from '../../domain/importacion/tipos.js';
import { buscarCatalogo } from '../dependencias-catalogos.js';
import type { CanalAvance, ColaImportaciones, LectorTabla, LecturaItemsGlobales, RepositorioImportaciones } from '../ports/importacion.js';
import type { RepositorioCatalogos } from '../ports/repositorios.js';
import type { VerificadorOperador } from '../ports/verificador-operador.js';
import type { Avisar } from './avance.js';

/** Lo que comparten los casos de uso de importación de tablas oficiales. */
export interface DependenciasImportacion {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  catalogos: RepositorioCatalogos;
  importaciones: RepositorioImportaciones;
  itemsGlobales: LecturaItemsGlobales;
  lector: LectorTabla;
  verificadorOperador: VerificadorOperador;
  cola: ColaImportaciones;
  canal: CanalAvance;
  avisar: Avisar;
}

export interface TablaOficial {
  catalogo: Catalogo;
  tabla: TablaImportable;
}

/** 404 si el catálogo no existe; TABLA_NO_IMPORTABLE si no es una de las 7 oficiales. */
export async function buscarTablaOficial(catalogos: Pick<RepositorioCatalogos, 'buscarPorCodigo'>, codigo: string): Promise<TablaOficial> {
  const catalogo = await buscarCatalogo(catalogos, codigo);
  if (!esTablaImportable(catalogo.codigo)) throw new TablaNoImportableError();
  return { catalogo, tabla: catalogo.codigo };
}

/** Otro tenant o un id que no es UUID: 404, igual que una que no existe. */
export async function buscarImportacion(importaciones: RepositorioImportaciones, id: string): Promise<Importacion> {
  const importacion = await importaciones.buscar(id);
  if (!importacion) throw new ImportacionNoEncontradaError();
  return importacion;
}

/** El catálogo de una importación existe siempre (FK); su código va en las respuestas y en el reporte. */
export async function codigoDeCatalogo(catalogos: Pick<RepositorioCatalogos, 'buscarPorId'>, catalogoId: string): Promise<string> {
  const catalogo = await catalogos.buscarPorId(catalogoId);
  if (!catalogo) throw new ImportacionNoEncontradaError();
  return catalogo.codigo;
}
