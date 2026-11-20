import type { VersionArchivo } from '../domain/archivo.js';
import { ArchivoNoEncontradoError, CategoriaDesconocidaError, DatosArchivoInvalidosError } from '../domain/errores.js';
import { exigirAccesoEntidad, type DependenciasArchivos } from './dependencias-archivos.js';
import type { NuevaVersionComando, VersionSolicitada } from './ports/archivo.port.js';

/**
 * TR-RF-081: registra una versión nueva `PENDIENTE_CARGA` de un archivo `DISPONIBLE` y entrega la URL firmada
 * para subirla. Fuera de la transacción borra lo que hubiera quedado en esa ruta (un intento rechazado cuyo
 * borrado falló) y firma: si Storage falla, la versión queda pendiente y la borra la limpieza diaria.
 */
export class SolicitarVersion {
  constructor(private readonly dependencias: DependenciasArchivos) {}

  async ejecutar(comando: NuevaVersionComando): Promise<VersionSolicitada> {
    const { unidadDeTrabajo, almacen } = this.dependencias;
    const version = await unidadDeTrabajo.run(() => this.registrar(comando));
    await almacen.borrar(version.rutaStorage);
    const carga = await almacen.firmarCarga(version.rutaStorage);
    return { archivoId: comando.archivoId, numero: version.numero, carga };
  }

  private async registrar(comando: NuevaVersionComando): Promise<Readonly<VersionArchivo>> {
    const { contexto, archivos, autorizadores } = this.dependencias;
    const archivo = await archivos.obtener(comando.archivoId);
    if (!archivo) throw new ArchivoNoEncontradoError();
    await exigirAccesoEntidad(autorizadores, archivo, 'puedeEditar');

    const { actorId } = contexto.current();
    if (!actorId) throw new DatosArchivoInvalidosError('La versión necesita el usuario que sube el archivo');
    const categoria = await archivos.buscarCategoria(archivo.categoria);
    if (!categoria) throw new CategoriaDesconocidaError();
    const version = archivo.solicitarVersion({ mimeDeclarado: comando.mime, bytesDeclarados: comando.tamano, solicitadoPor: actorId }, categoria);
    await archivos.guardar(archivo);
    return version;
  }
}
