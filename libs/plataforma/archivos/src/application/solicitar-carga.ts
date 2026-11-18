import { Archivo } from '../domain/archivo.js';
import { CategoriaDesconocidaError, DatosArchivoInvalidosError } from '../domain/errores.js';
import { exigirAccesoEntidad, type DependenciasArchivos } from './dependencias-archivos.js';
import type { CargaSolicitada, SolicitarCargaComando } from './ports/archivo.port.js';

/**
 * TR-RF-080: registra el archivo como pendiente y entrega la URL firmada para subirlo directo al bucket.
 * La firma va fuera de la transacción: si Storage falla, la fila queda `PENDIENTE_CARGA` y la borra la
 * limpieza diaria.
 */
export class SolicitarCarga {
  constructor(private readonly dependencias: DependenciasArchivos) {}

  async ejecutar(comando: SolicitarCargaComando): Promise<CargaSolicitada> {
    const archivo = await this.dependencias.unidadDeTrabajo.run(() => this.registrar(comando));
    const carga = await this.dependencias.almacen.firmarCarga(archivo.primeraVersion.rutaStorage);
    return { archivoId: archivo.id, carga };
  }

  private async registrar(comando: SolicitarCargaComando): Promise<Archivo> {
    const { contexto, ids, archivos, autorizadores } = this.dependencias;
    const categoria = await archivos.buscarCategoria(comando.categoria);
    if (!categoria) throw new CategoriaDesconocidaError();
    await exigirAccesoEntidad(autorizadores, comando, 'puedeEditar');

    const { tenantId, actorId } = contexto.current();
    if (!actorId) throw new DatosArchivoInvalidosError('La carga necesita el usuario que sube el archivo');
    const archivo = Archivo.solicitar(
      {
        id: ids.next(),
        tenantId,
        nombreOriginal: comando.nombreOriginal,
        mimeDeclarado: comando.mime,
        bytesDeclarados: comando.tamano,
        entidadTipo: comando.entidadTipo,
        entidadId: comando.entidadId,
        solicitadoPor: actorId,
      },
      categoria,
    );
    await archivos.guardar(archivo);
    return archivo;
  }
}
