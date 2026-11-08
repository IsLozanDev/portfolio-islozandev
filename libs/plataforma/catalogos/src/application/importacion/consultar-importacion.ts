import { exigirOperador } from '../dependencias-catalogos.js';
import { seguimientoDe } from './avance.js';
import { buscarImportacion, codigoDeCatalogo, type DependenciasImportacion } from './dependencias-importacion.js';
import { detalleDe, type DetalleImportacion } from './resultados-importacion.js';

/**
 * Detalle de una importación del tenant, con el avance de Redis mientras está EN_COLA. Si lleva más de
 * una hora EN_COLA, el trabajo se perdió en Redis: queda FALLIDA y libera ux_importacion_activa.
 */
export class ConsultarImportacion {
  constructor(private readonly dependencias: DependenciasImportacion) {}

  async ejecutar(comando: { id: string }): Promise<DetalleImportacion> {
    const { unidadDeTrabajo, reloj, catalogos, importaciones, canal } = this.dependencias;
    const { importacion, codigo } = await unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const leida = await buscarImportacion(importaciones, comando.id);
      if (leida.revisarPerdida(reloj.now())) await importaciones.guardar(leida, leida.version);
      return { importacion: leida, codigo: await codigoDeCatalogo(catalogos, leida.catalogoId) };
    });
    return detalleDe(importacion, codigo, await seguimientoDe(canal, importacion.id, importacion.estado));
  }
}
