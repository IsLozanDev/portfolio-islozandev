import { exigirOperador } from '../dependencias-catalogos.js';
import { buscarImportacion, codigoDeCatalogo, type DependenciasImportacion } from './dependencias-importacion.js';
import { detalleDe, type DetalleImportacion } from './resultados-importacion.js';

/**
 * Detalle de una importación del tenant. Si lleva más de una hora EN_COLA, el trabajo se perdió en Redis:
 * queda FALLIDA y libera ux_importacion_activa.
 */
export class ConsultarImportacion {
  constructor(private readonly dependencias: DependenciasImportacion) {}

  ejecutar(comando: { id: string }): Promise<DetalleImportacion> {
    const { unidadDeTrabajo, reloj, catalogos, importaciones } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const importacion = await buscarImportacion(importaciones, comando.id);
      if (importacion.revisarPerdida(reloj.now())) await importaciones.guardar(importacion, importacion.version);
      return detalleDe(importacion, await codigoDeCatalogo(catalogos, importacion.catalogoId));
    });
  }
}
