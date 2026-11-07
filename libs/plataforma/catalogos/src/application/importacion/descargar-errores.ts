import { ImportacionNoAplicableError } from '../../domain/importacion/errores.js';
import { fechaDeVigencia } from '../../domain/vigencia.js';
import { exigirOperador } from '../dependencias-catalogos.js';
import { buscarImportacion, codigoDeCatalogo, type DependenciasImportacion } from './dependencias-importacion.js';
import { lineasReporteErrores } from './reporte-errores-csv.js';

export interface ReporteErrores {
  /** errores-{codigo}-{fecha}.csv, con la fecha de la previsualización. */
  nombreArchivo: string;
  lineas: Iterable<string>;
}

/** Reporte de una importación RECHAZADA del tenant, hasta que una previsualización nueva la vence. */
export class DescargarErrores {
  constructor(private readonly dependencias: DependenciasImportacion) {}

  ejecutar(comando: { id: string }): Promise<ReporteErrores> {
    const { unidadDeTrabajo, catalogos, importaciones } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const importacion = await buscarImportacion(importaciones, comando.id);
      if (importacion.estado !== 'RECHAZADA') throw new ImportacionNoAplicableError(importacion.estado);
      const codigo = await codigoDeCatalogo(catalogos, importacion.catalogoId);
      return {
        nombreArchivo: `errores-${codigo}-${fechaDeVigencia(importacion.creadoEn)}.csv`,
        lineas: lineasReporteErrores(importacion.errores ?? [], importacion.totalErrores),
      };
    });
  }
}
