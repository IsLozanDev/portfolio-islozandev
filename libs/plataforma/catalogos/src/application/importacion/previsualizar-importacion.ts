import { calcularDiferencias } from '../../domain/importacion/calcular-diferencias.js';
import { FilasInvalidasError } from '../../domain/importacion/errores.js';
import { Importacion, type DatosArchivoImportado } from '../../domain/importacion/importacion.js';
import { ERRORES_EN_RESPUESTA } from '../../domain/importacion/tipos.js';
import type { ValidacionArchivo } from '../../domain/importacion/validacion-archivo.js';
import { exigirOperador } from '../dependencias-catalogos.js';
import { buscarTablaOficial, type DependenciasImportacion, type TablaOficial } from './dependencias-importacion.js';
import { previsualizacionDe, type Previsualizacion } from './resultados-importacion.js';
import { sha256De, validarArchivo, type ArchivoImportado } from './validar-archivo.js';

export interface PrevisualizarImportacionComando {
  catalogo: string;
  archivo: ArchivoImportado;
  versionOficial: string;
  /** YYYY-MM-DD. */
  fechaVigencia: string;
  actorId: string;
}

/**
 * TR-RF-028: valida el archivo completo contra el diseño de la tabla y calcula las diferencias con los
 * globales actuales, sin tocar ningún ítem. El archivo se lee fuera de la transacción: solo se guarda el
 * resultado. Con filas inválidas queda RECHAZADA con sus errores y responde 422.
 */
export class PrevisualizarImportacion {
  constructor(private readonly dependencias: DependenciasImportacion) {}

  async ejecutar(comando: PrevisualizarImportacionComando): Promise<Previsualizacion> {
    const { unidadDeTrabajo, catalogos, lector } = this.dependencias;
    const oficial = await unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      return buscarTablaOficial(catalogos, comando.catalogo);
    });

    const validacion = await validarArchivo(lector, oficial.tabla, comando.archivo);
    if (validacion.tieneErrores) return this.rechazar(comando, oficial, validacion);
    return this.guardarPrevisualizacion(comando, validacion);
  }

  private async rechazar(comando: PrevisualizarImportacionComando, oficial: TablaOficial, validacion: ValidacionArchivo): Promise<never> {
    const rechazada = Importacion.rechazar({
      ...this.datosDelArchivo(comando, oficial.catalogo.id, oficial.catalogo.version),
      errores: validacion.errores,
      totalErrores: validacion.totalErrores,
    });
    await this.dependencias.unidadDeTrabajo.run(() => this.dependencias.importaciones.guardar(rechazada, null));
    throw new FilasInvalidasError(rechazada.id, validacion.errores.slice(0, ERRORES_EN_RESPUESTA), validacion.totalErrores);
  }

  /** La versión del catálogo y los globales se leen en la misma transacción que guarda la previsualización. */
  private guardarPrevisualizacion(comando: PrevisualizarImportacionComando, validacion: ValidacionArchivo): Promise<Previsualizacion> {
    const { unidadDeTrabajo, catalogos, importaciones, itemsGlobales } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const { catalogo } = await buscarTablaOficial(catalogos, comando.catalogo);
      const diferencias = calcularDiferencias(validacion.filas, await itemsGlobales.de(catalogo.id), comando.fechaVigencia);
      const datos = this.datosDelArchivo(comando, catalogo.id, catalogo.version);
      await importaciones.vencerPrevias(catalogo.id, datos.ahora);
      const importacion = Importacion.previsualizar({ ...datos, diferencias });
      await importaciones.guardar(importacion, null);
      return previsualizacionDe(importacion, diferencias, validacion.filas.length);
    });
  }

  private datosDelArchivo(comando: PrevisualizarImportacionComando, catalogoId: string, versionCatalogo: number): DatosArchivoImportado {
    const { ids, reloj, contexto } = this.dependencias;
    return {
      id: ids.next(),
      tenantId: contexto.current().tenantId,
      catalogoId,
      versionOficial: comando.versionOficial,
      fechaVigencia: comando.fechaVigencia,
      archivoNombre: comando.archivo.nombre,
      archivoSha256: sha256De(comando.archivo.contenido),
      versionCatalogo,
      lanzadoPor: comando.actorId,
      ahora: reloj.now(),
    };
  }
}
